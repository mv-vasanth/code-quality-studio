import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { grade } from "../shared/grade.js";
import { STACK_LIST, DEFAULT_STACK_ID } from "../stacks/definitions.js";
import { getAuditStack } from "../stacks/registry.js";
import StudioHeader from "../components/layout/StudioHeader.jsx";
import ErrorBoundary from "../components/layout/ErrorBoundary.jsx";
import { getAnalysisModeLabel, isAiConfigured } from "../settings/aiSettingsDefaults.js";
import { useAiSettings } from "../settings/AiSettingsContext.jsx";
import AiSettingsModal from "../components/settings/AiSettingsModal.jsx";
import { sanitizeClientError } from "../services/ai/safeErrors.js";
import { runFileAnalysis } from "../services/runFileAnalysis.js";
import ScoreRing from "../components/charts/ScoreRing.jsx";
import MiniBar from "../components/charts/MiniBar.jsx";
import RadarChart from "../components/charts/RadarChart.jsx";
import FindingCard from "../components/findings/FindingCard.jsx";
import { enrichFindingWithFileContext, resolveFileForFinding } from "../shared/findingActualCode.js";
import FileTree from "../components/files/FileTree.jsx";
import BestPracticesPanel from "../BestPracticesPanelWithChecklist.jsx";
import DownloadReportButton from "../DownloadReportButton.jsx";
import RerunAllControls from "../components/analysis/RerunAllControls.jsx";
import AnalysisViewToggle from "../components/analysis/AnalysisViewToggle.jsx";
import StudioFooter from "../components/layout/StudioFooter.jsx";
import LabeledScoreChips from "../components/files/LabeledScoreChips.jsx";
import FileCategoryScores from "../components/files/FileCategoryScores.jsx";
import FilesTabGuide from "../components/files/FilesTabGuide.jsx";
import WorkspaceSessionBar from "../components/files/WorkspaceSessionBar.jsx";
import RulesReviewTab from "../components/rules/RulesReviewTab.jsx";
import {
  saveWorkspace,
  loadWorkspace,
  clearWorkspace,
  inferFolderHint,
} from "../shared/workspacePersistence.js";
import {
  getStoredResult,
  getAiResult,
  fileHasResult,
  collectFindings,
  averageScore,
  averageScoresBySource,
  countAnalysed,
  filesWithViewResults,
  listProvidersWithResults,
  providersToRunOnUpload,
  hasAnyAiResults,
} from "../shared/fileResults.js";
import {
  hasAiCredentials,
  getRunnableAiProviders,
  AI_PROVIDERS,
} from "../settings/aiSettingsDefaults.js";

export default function PlaywrightQualityStudio() {
  const { settings: aiSettings } = useAiSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSetupFromToggle, setAiSetupFromToggle] = useState(false);
  const [settingsProvider, setSettingsProvider] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [catFilter, setCatFilter] = useState("all");
  const [sevFilter, setSevFilter] = useState("all");
  const [dragging, setDragging] = useState(false);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [resultsView, setResultsView] = useState("local");
  const [stackId, setStackId] = useState(() => { try { return sessionStorage.getItem("pqs-active-stack") || DEFAULT_STACK_ID; } catch { return DEFAULT_STACK_ID; } });
  const stack = getAuditStack(stackId);
  const CATEGORIES = stack.categories;
  const [projectName, setProjectName] = useState(stack.defaultProjectName);
  const [workspaceSavedAt, setWorkspaceSavedAt] = useState(null);
  const [folderHint, setFolderHint] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const restoreAnalysisRef = useRef(false);
  const fileInputRef = useRef();
  const folderInputRef = useRef();

  const changeStack = useCallback((nextId) => {
    if (nextId === stackId) return;
    if (files.length > 0 && !window.confirm("Switching stack clears loaded files. Continue?")) return;
    if (files.length > 0) { setFiles([]); setSelectedFile(null); setFolderHint(""); setWorkspaceSavedAt(null); clearWorkspace(); }
    setStackId(nextId);
    try { sessionStorage.setItem("pqs-active-stack", nextId); } catch {}
    setProjectName(getAuditStack(nextId).defaultProjectName);
    setCatFilter("all"); setSevFilter("all"); setActiveTab("overview");
  }, [stackId, files.length]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadWorkspace();
      if (cancelled || !saved?.files?.length) {
        setWorkspaceReady(true);
        return;
      }
      let activeStack = DEFAULT_STACK_ID;
      try { activeStack = sessionStorage.getItem("pqs-active-stack") || saved.stackId || DEFAULT_STACK_ID; } catch { activeStack = saved.stackId || DEFAULT_STACK_ID; }
      if (saved.stackId && saved.stackId !== activeStack) { setWorkspaceReady(true); return; }
      setStackId(saved.stackId || activeStack);
      try { sessionStorage.setItem("pqs-active-stack", saved.stackId || activeStack); } catch {}
      setProjectName(saved.projectName || getAuditStack(saved.stackId || activeStack).defaultProjectName);
      setResultsView(saved.resultsView || "local");
      setFolderHint(saved.folderHint || inferFolderHint(saved.files.map((f) => f.name)));
      setWorkspaceSavedAt(saved.savedAt || null);
      setFiles(saved.files.map((f) => ({
        ...f,
        resultsAi: f.resultsAi || {},
        errorsAi: f.errorsAi || {},
        status: f.status === "analysing" ? "done" : (f.status || "done"),
      })));
      setActiveTab("files");
      const needsAnalysis = saved.files.some((f) => !f.resultLocal && f.status !== "error");
      restoreAnalysisRef.current = needsAnalysis;
      setWorkspaceReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    const timer = setTimeout(() => {
      const hint = folderHint || inferFolderHint(files.map((f) => f.name));
      if (hint && hint !== folderHint) setFolderHint(hint);
      saveWorkspace({
        stackId,
        projectName,
        folderHint: hint,
        resultsView,
        files,
      }).then(() => setWorkspaceSavedAt(new Date().toISOString())).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [files, projectName, stackId, resultsView, workspaceReady, folderHint]);

  const analyseFile = useCallback(async (file, mode = "auto", providerId = null) => {
    const slotLabel = mode === "local" ? "local" : providerId || "ai";
    setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: "analysing", error: null, analysingSlot: slotLabel } : f));
    const runMode = mode === "auto" ? "auto" : mode === "local" ? "local" : "ai";
    try {
      const result = await runFileAnalysis(file, stackId, aiSettings, { mode: runMode, providerId: providerId || undefined });
      setFiles(prev => prev.map(f => {
        if (f.name !== file.name) return f;
        const patch = { status: "done", error: null, analysingSlot: null };
        if (runMode === "local") return { ...f, ...patch, resultLocal: result };
        const pid = providerId || getRunnableAiProviders(aiSettings)[0]?.id;
        const resultsAi = { ...(f.resultsAi || {}), [pid]: result };
        return { ...f, ...patch, resultsAi, resultAi: result, _legacyAiProvider: pid };
      }));
    } catch (e) {
      const msg = sanitizeClientError(e.message);
      setFiles((prev) =>
        prev.map((f) => {
          if (f.name !== file.name) return f;
          const isAiRun = runMode !== "local";
          const pid = isAiRun
            ? providerId || getRunnableAiProviders(aiSettings)[0]?.id
            : null;
          const hasUsableResult =
            Boolean(f.resultLocal) || Object.keys(f.resultsAi || {}).length > 0;

          if (isAiRun && pid && hasUsableResult) {
            const errorsAi = { ...(f.errorsAi || {}), [pid]: msg };
            return {
              ...f,
              status: "done",
              errorsAi,
              lastAiError: msg,
              error: null,
              analysingSlot: null,
            };
          }
          return { ...f, status: "error", error: msg, analysingSlot: null };
        }),
      );
    }
  }, [stackId, aiSettings]);

  const rerunAllFiles = useCallback(async (mode, providerId = null) => {
    if (!files.length || rerunBusy) return;
    setRerunBusy(true);
    const batch = [...files];
    for (const f of batch) {
      await analyseFile(f, mode, providerId);
    }
    setRerunBusy(false);
  }, [files, analyseFile, rerunBusy]);

  const rerunAllBoth = useCallback(async () => {
    if (!files.length || rerunBusy) return;
    const runnable = getRunnableAiProviders(aiSettings);
    if (!runnable.length) {
      setSettingsOpen(true);
      return;
    }
    setRerunBusy(true);
    const batch = [...files];
    for (const f of batch) {
      await analyseFile(f, "local");
      for (const p of runnable) {
        await analyseFile(f, "ai", p.id);
      }
    }
    setRerunBusy(false);
  }, [files, analyseFile, rerunBusy, aiSettings]);

  const loadFiles = useCallback(async (rawFiles, { runAnalysis = true } = {}) => {
    const incoming = [];
    for (const rf of rawFiles) {
      if (!stack.filePattern.test(rf.name)) continue;
      const content = await rf.text();
      const relPath = rf.webkitRelativePath || rf.name;
      incoming.push({ name: relPath, content });
    }
    if (!incoming.length) return;

    const newFiles = [];
    const toReanalyse = [];

    setFiles((prev) => {
      const next = [...prev];
      for (const { name, content } of incoming) {
        const idx = next.findIndex((f) => f.name === name);
        if (idx >= 0) {
          if (next[idx].content !== content) {
            next[idx] = {
              ...next[idx],
              content,
              status: "pending",
              resultLocal: null,
              resultsAi: {},
              errorsAi: {},
              error: null,
            };
            toReanalyse.push(next[idx]);
          }
        } else {
          const row = { name, content, status: "pending", resultLocal: null, resultsAi: {}, errorsAi: {} };
          next.push(row);
          newFiles.push(row);
        }
      }
      return next;
    });

    setFolderHint(inferFolderHint([...files.map((f) => f.name), ...incoming.map((i) => i.name)]));
    setActiveTab("files");

    if (!runAnalysis) return;

    const toRun = providersToRunOnUpload(aiSettings);
    const batch = [...newFiles];
    for (const f of batch) {
      await analyseFile(f, "local");
      for (const pid of toRun) {
        await analyseFile(f, "ai", pid);
      }
    }
    for (const f of toReanalyse) {
      await analyseFile(f, "local");
      for (const pid of toRun) {
        await analyseFile(f, "ai", pid);
      }
    }
  }, [files, analyseFile, stack, aiSettings]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const items = [...e.dataTransfer.files];
    await loadFiles(items);
  }, [loadFiles]);

  const removeFile = (name) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    if (selectedFile?.name === name) setSelectedFile(null);
  };



  useEffect(() => {
    if (!workspaceReady || !restoreAnalysisRef.current) return;
    const pending = files.filter((f) => !f.resultLocal && f.status !== "analysing" && f.status !== "error");
    if (!pending.length) {
      restoreAnalysisRef.current = false;
      return;
    }
    restoreAnalysisRef.current = false;
    (async () => {
      const toRun = providersToRunOnUpload(aiSettings);
      for (const f of pending) {
        await analyseFile(f, "local");
        for (const pid of toRun) {
          await analyseFile(f, "ai", pid);
        }
      }
    })();
  }, [workspaceReady, files, aiSettings, analyseFile]);

  const reanalyse = (file) => analyseFile(file);

  // Run a single file on demand (rules + any enabled AI providers) — used by per-card Run buttons.
  const runFile = useCallback(async (file) => {
    await analyseFile(file, "local");
    for (const pid of providersToRunOnUpload(aiSettings)) {
      await analyseFile(file, "ai", pid);
    }
  }, [analyseFile, aiSettings]);

  const hasLocalResults = files.some((f) => fileHasResult(f, "local"));
  const providersWithResults = listProvidersWithResults(files);
  const hasAiResults = hasAnyAiResults(files);

  useEffect(() => {
    if (resultsView === "compare-all" && !(hasLocalResults && hasAiResults)) {
      if (hasAiResults && !hasLocalResults && providersWithResults[0]) {
        setResultsView(providersWithResults[0].id);
      } else if (hasLocalResults) setResultsView("local");
    }
  }, [hasLocalResults, hasAiResults, resultsView, providersWithResults]);

  const chartView = resultsView === "compare-all" ? "local" : resultsView;
  const allResults = filesWithViewResults(files, chartView);
  const avgScore = averageScore(files, resultsView === "compare-all" ? "local" : resultsView);
  const avgBySource = averageScoresBySource(files);

  const allFindings = collectFindings(files, resultsView);
  const critTotal = allFindings.filter((f) => f.severity === "critical").length;
  const warnTotal = allFindings.filter((f) => f.severity === "warning").length;

  const displayFile = selectedFile || (files.length === 1 ? files[0] : null);
  const displayFindingsBase = displayFile
    ? collectFindings([displayFile], resultsView)
    : allFindings;

  const fileForFinding = useCallback(
    (fi) => resolveFileForFinding(files, fi),
    [files],
  );
  const filteredFindings = displayFindingsBase.filter((f) =>
    (catFilter === "all" || f.category === catFilter) &&
    (sevFilter === "all" || f.severity === sevFilter)
  );

  // For the selected-file findings view: its per-category scores + finding counts,
  // so it's clear which category drove the failure.
  const displayResult = displayFile
    ? getStoredResult(displayFile, resultsView === "compare-all" ? "local" : resultsView)
    : null;
  const displayCatCounts = displayFindingsBase.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {});

  const avgCatScores = CATEGORIES.reduce((acc, cat) => {
    const vals = allResults.map((f) => f.result.categoryScores?.[cat.id] ?? 0);
    acc[cat.id] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    return acc;
  }, {});

  const analysedCount = countAnalysed(files, resultsView);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", background: "#f1f5f9", overflow: "hidden" }}>

      <StudioHeader
        stack={stack}
        stackList={STACK_LIST}
        stackId={stackId}
        onStackChange={changeStack}
        modeLabel={getAnalysisModeLabel(aiSettings)}
        onAddFiles={() => fileInputRef.current?.click()}
        onLoadFolder={() => folderInputRef.current?.click()}
        onOpenAiSettings={({ provider, setupFromToggle } = {}) => {
          setSettingsProvider(provider || null);
          setAiSetupFromToggle(Boolean(setupFromToggle));
          setSettingsOpen(true);
        }}
        projectName={projectName}
        files={files}
        categories={CATEGORIES}
        resultsView={resultsView}
        hasLocalResults={hasLocalResults}
        providersWithResults={providersWithResults}
        showResultsBar={files.length > 0}
        onResultsViewChange={setResultsView}
        fileCount={files.length}
        critTotal={critTotal}
        warnTotal={warnTotal}
        avgScore={avgScore}
        avgBySource={avgBySource}
        resultsViewCompareAll={resultsView === "compare-all"}
        gradeFn={grade}
        aiProviders={AI_PROVIDERS}
      />
        <input ref={fileInputRef} type="file" accept={stack.fileAccept} multiple style={{ display: "none" }}
          onChange={e => loadFiles([...e.target.files])} />
        <input ref={folderInputRef} type="file" webkitdirectory="true" multiple style={{ display: "none" }}
          onChange={e => loadFiles([...e.target.files])} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{ width: 220, background: "#fff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#888", letterSpacing: "0.06em", marginBottom: 6 }}>PROJECT</div>
            <input value={projectName} onChange={e => setProjectName(e.target.value)}
              style={{ width: "100%", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", color: "#111", outline: "none", boxSizing: "border-box" }}/>
          </div>

          {/* Nav */}
          <div style={{ padding: "8px 8px 4px" }}>
            {[
              { id: "overview", icon: "🏠", label: "Overview" },
              { id: "files",    icon: "📂", label: `Files (${files.length})` },
              { id: "findings", icon: "🔍", label: `Findings (${allFindings.length})` },
              { id: "rules", icon: "⚙️", label: "Rules" },
              { id: "radar",    icon: "🕸️", label: "Coverage Radar" },
              { id: "roadmap",  icon: "🗺️", label: "Roadmap" },
              { id: "guide",    icon: "📖", label: "Practices (" + stack.shortName + ")" },
            ].map(n => (
              <button key={n.id} onClick={() => { setActiveTab(n.id); setSelectedFile(null); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "none", borderRadius: 7, background: activeTab === n.id ? "#f0fdfa" : "transparent", color: activeTab === n.id ? "#0d9488" : "#555", fontWeight: activeTab === n.id ? 600 : 400, fontSize: 12.5, cursor: "pointer", textAlign: "left", marginBottom: 2 }}>
                <span>{n.icon}</span><span>{n.label}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px" }}>
            {files.length > 0 && (
              <>
                <WorkspaceSessionBar
                  folderHint={folderHint}
                  fileCount={files.length}
                  savedAt={workspaceSavedAt}
                  busy={rerunBusy}
                  onRerunRules={() => rerunAllFiles("local")}
                  onAddFiles={() => fileInputRef.current?.click()}
                  onAddFolder={() => folderInputRef.current?.click()}
                  onClear={() => {
                    if (!window.confirm("Clear all files and remove saved workspace from this browser?")) return;
                    setFiles([]);
                    setSelectedFile(null);
                    setFolderHint("");
                    setWorkspaceSavedAt(null);
                    clearWorkspace();
                    setActiveTab("overview");
                  }}
                />
                <div style={{ fontSize: 10, fontWeight: 700, color: "#888", letterSpacing: "0.06em", padding: "8px 4px 4px" }}>SPEC FILES</div>
                <FileTree files={files} selected={selectedFile} resultsView={resultsView}
                  onSelect={f => { setSelectedFile(f); setActiveTab("findings"); }}
                  onRemove={removeFile} />
              </>
            )}
          </div>

          {files.length > 0 && (
            <div style={{ padding: "8px 10px", borderTop: "1px solid #f3f4f6" }}>
              <RerunAllControls
                fileCount={files.length}
                busy={rerunBusy}
                aiCredentialsReady={hasAiCredentials(aiSettings)}
                onOpenAiSettings={() => setSettingsOpen(true)}
                onRerunAll={rerunAllFiles}
                onRerunBoth={rerunAllBoth}
              />
              <button onClick={() => { setFiles([]); setSelectedFile(null); setFolderHint(""); setWorkspaceSavedAt(null); clearWorkspace(); setActiveTab("overview"); }}
                style={{ width: "100%", padding: "6px", border: "1px solid #fee2e2", borderRadius: 6, background: "#fff", color: "#dc2626", fontSize: 11.5, cursor: "pointer", fontWeight: 500 }}>
                🗑️ Clear all files
              </button>
            </div>
          )}
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
         <ErrorBoundary resetKey={`${activeTab}:${resultsView}:${selectedFile?.name ?? ""}`}>

          {/* ── OVERVIEW ── */}
          {activeTab === "overview" && (
            <div>
              {files.length === 0 ? (
                <div onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  style={{ border: `2px dashed ${dragging ? "#14b8a6" : "#99f6e4"}`, borderRadius: 16, padding: "4rem 2rem", textAlign: "center", background: dragging ? "#f0fdfa" : "#fff", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
                  <div style={{ fontWeight: 800, fontSize: 22, color: "#1e1b4b", marginBottom: 8 }}>Code Quality Studio</div>
                  <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, marginBottom: 20, maxWidth: 520, margin: "0 auto 20px" }}>
                    Choose a <strong>stack</strong> in the header, turn on any <strong>AI on scan</strong> providers you need, then add files or a folder. Rules always run; enabled AIs run automatically.
                  </div>
                  <ol style={{ textAlign: "left", maxWidth: 360, margin: "0 auto 24px", color: "#475569", fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
                    <li>Pick Playwright, Java, or TypeScript (header)</li>
                    <li>Optional: enable Claude, Bedrock, or Gemini</li>
                    <li>Add files or drag them here</li>
                  </ol>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
                    <button onClick={() => fileInputRef.current?.click()}
                      style={{ padding: "12px 28px", background: "#0d9488", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      📄 {stack.loadFilesLabel || "Load files"}
                    </button>
                    <button onClick={() => folderInputRef.current?.click()}
                      style={{ padding: "12px 28px", background: "#fff", color: "#0d9488", border: "2px solid #14b8a6", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      📁 {stack.loadFolderLabel || "Load project folder"}
                    </button>
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: 12 }}>or drag & drop files for this stack ({stack.dropHint})</div>
                  <button type="button" onClick={() => setActiveTab("guide")}
                    style={{ marginTop: 16, background: "transparent", border: "none", color: "#14b8a6", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                    View {stack.shortName} best practices reference
                  </button>
                  <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, maxWidth: 700, margin: "28px auto 0" }}>
                    {CATEGORIES.map(c => (
                      <div key={c.id} style={{ background: c.bg, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 7, border: `1px solid ${c.color}22` }}>
                        <span>{c.icon}</span><span style={{ fontSize: 11.5, color: c.color, fontWeight: 500 }}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                                    <div style={{ fontWeight: 700, fontSize: 16, color: "#111", marginBottom: 14 }}>{projectName} — Overview</div>
                  <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#0c4a6e", lineHeight: 1.5 }}>
                    <strong>Rules</strong> scan your loaded source in the browser (no API). Optional <strong>AI</strong> runs only if you configure a provider — use the results bar to view Rules-only scores.
                  </div>

                  {/* Summary stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      { label: "Files analysed", val: analysedCount, sub: `of ${files.length}`, color: "#14b8a6" },
                      { label: "Avg quality score", val: avgScore ?? "—", sub: avgScore ? grade(avgScore).label : "", color: avgScore ? grade(avgScore).color : "#888" },
                      { label: "Critical issues", val: critTotal, sub: "need fixing", color: critTotal > 0 ? "#dc2626" : "#16a34a" },
                      { label: "Warnings", val: warnTotal, sub: "should fix", color: warnTotal > 0 ? "#d97706" : "#16a34a" },
                      { label: "Total findings", val: allFindings.length, sub: "across all files", color: "#374151" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginTop: 2 }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* File score list */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, fontSize: 13, color: "#111", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span>Files</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" disabled={rerunBusy} onClick={() => rerunAllFiles("local")}
                          style={{ fontSize: 10.5, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f766e", cursor: rerunBusy ? "not-allowed" : "pointer" }}>
                          ↺ Re-run all (rules)
                        </button>
                        <button type="button" disabled={rerunBusy} onClick={() => (hasAiCredentials(aiSettings) ? rerunAllFiles("ai") : setSettingsOpen(true))}
                          style={{ fontSize: 10.5, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid #5eead4", background: "#0d9488", color: "#fff", cursor: rerunBusy ? "not-allowed" : "pointer" }}>
                          ↺ Re-run all (AI)
                        </button>
                        <span style={{ fontWeight: 400, fontSize: 11, color: "#888" }}>Click a file for findings</span>
                      </div>
                    </div>
                    {files.map(f => {
                      const localR = getStoredResult(f, "local");
                      const aiR = getStoredResult(f, "ai");
                      const viewR = resultsView === "local" ? localR : resultsView === "compare-all" ? null : getStoredResult(f, resultsView);
                      const g = viewR ? grade(viewR.overallScore) : null;
                      const crit = (resultsView === "compare-all"
                        ? collectFindings([f], "compare-all")
                        : (viewR?.findings || [])
                      ).filter(fi => fi.severity === "critical").length;
                      return (
                        <div key={f.name} onClick={() => { setSelectedFile(f); setActiveTab("findings"); }}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid #f9fafb", cursor: "pointer", transition: "background 0.1s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <span style={{ fontSize: 16 }}>📄</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                            {viewR && (
                              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                {CATEGORIES.slice(0, 6).map(cat => {
                                  const s = viewR.categoryScores?.[cat.id] ?? 0;
                                  return <div key={cat.id} title={`${cat.label}: ${s}`} style={{ width: 28, height: 4, borderRadius: 2, background: grade(s).color, opacity: 0.7 }}/>;
                                })}
                              </div>
                            )}
                          </div>
                          {f.status === "analysing" && <span style={{ width: 12, height: 12, border: "2px solid #99f6e4", borderTopColor: "#14b8a6", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }}/>}
                          {f.status === "error" && <span style={{ fontSize: 11, color: "#dc2626" }}>⚠️ Error</span>}
                          {f.status === "pending" && !localR && !aiR && (
                            <button type="button" title="Analyse this file" onClick={e => { e.stopPropagation(); runFile(f); }}
                              style={{ fontSize: 10.5, fontWeight: 700, color: "#0d9488", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 6, padding: "5px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>
                              ▶ Run
                            </button>
                          )}
                          {(localR || aiR) && (
                            <>
                              {crit > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fef2f2", padding: "2px 7px", borderRadius: 99 }}>{crit} critical</span>}
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {resultsView === "compare-all" && (localR || hasAnyAiResults([f])) ? (
                                  <LabeledScoreChips file={f} localResult={localR} />
                                ) : viewR ? (
                                  <ScoreRing score={viewR.overallScore} size={44}/>
                                ) : null}
                              </div>
                            </>
                          )}
                          {f.status === "done" && <button onClick={e => { e.stopPropagation(); reanalyse(f); }}
                            style={{ fontSize: 10, color: "#14b8a6", background: "#f0fdfa", border: "none", borderRadius: 5, padding: "3px 7px", cursor: "pointer" }}>↺</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FILES TAB ── */}
          {activeTab === "files" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Loaded files</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{files.length} spec{files.length === 1 ? "" : "s"} · click for findings</div>
                </div>
                {files.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <AnalysisViewToggle
                      compact
                      value={resultsView}
                      onChange={setResultsView}
                      hasLocal={hasLocalResults}
                      providersWithResults={providersWithResults}
                    />
                    <button type="button" disabled={rerunBusy} onClick={() => rerunAllFiles("local")}
                      style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f766e", cursor: rerunBusy ? "not-allowed" : "pointer" }}>
                      ↺ Re-run all (rules)
                    </button>
                    <button type="button" disabled={rerunBusy} onClick={() => (hasAiCredentials(aiSettings) ? rerunAllFiles("ai") : setSettingsOpen(true))}
                      style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1px solid #5eead4", background: "#0d9488", color: "#fff", cursor: rerunBusy ? "not-allowed" : "pointer" }}>
                      ↺ Re-run all (AI)
                    </button>
                  </div>
                )}
              </div>
              {files.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "2rem", textAlign: "center", color: "#9ca3af" }}>No files loaded yet. Use the buttons above to load files.</div>
              ) : (
                <>
                <FilesTabGuide
                  resultsView={resultsView}
                  hasCompare={hasLocalResults && hasAiResults}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                  {files.map(f => {
                    const localR = getStoredResult(f, "local");
                    const aiR = getStoredResult(f, "ai");
                    const viewR = resultsView === "local" ? localR : resultsView === "compare-all" ? null : getStoredResult(f, resultsView);
                    const g = viewR ? grade(viewR.overallScore) : null;
                    return (
                      <div key={f.name} onClick={() => { setSelectedFile(f); setActiveTab("findings"); }}
                        style={{ background: "#fff", borderRadius: 12, border: `1px solid ${selectedFile?.name === f.name ? "#14b8a6" : "#e5e7eb"}`, padding: "12px 14px", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name.split("/").pop()}</div>
                            <div style={{ fontSize: 10.5, color: "#888", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                          </div>
                          {resultsView === "compare-all" && (localR || hasAnyAiResults([f])) ? (
                            <LabeledScoreChips file={f} localResult={localR} />
                          ) : viewR ? (
                            <div style={{ textAlign: "center" }}>
                              <ScoreRing score={viewR.overallScore} size={50}/>
                              <div style={{ fontSize: 9, fontWeight: 600, color: "#64748b", marginTop: 2 }}>
                                {resultsView === "local" ? "Rules" : AI_PROVIDERS.find((p) => p.id === resultsView)?.shortLabel ?? "AI"}
                              </div>
                            </div>
                          ) : (
                            <div style={{ width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {f.status === "analysing" ? <span style={{ width: 18, height: 18, border: "2px solid #99f6e4", borderTopColor: "#14b8a6", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }}/> : f.status === "pending" ? <button type="button" title="Analyse this file" onClick={e => { e.stopPropagation(); runFile(f); }} style={{ fontSize: 10.5, fontWeight: 700, color: "#0d9488", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 6, padding: "5px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>▶ Run</button> : <span style={{ color: "#ccc", fontSize: 20 }} title="No score for this view">—</span>}
                            </div>
                          )}
                        </div>
                        {(viewR || (resultsView === "compare-all" && localR)) && (
                          <div>
                            {resultsView === "compare-all" && (
                              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                                Category scores (rules)
                              </div>
                            )}
                            <FileCategoryScores
                              categories={CATEGORIES}
                              result={viewR || localR}
                              max={6}
                              columns={1}
                              onSelectCategory={(id) => { setSelectedFile(f); setCatFilter(id); setActiveTab("findings"); }}
                              findingCounts={(viewR || localR)?.findings?.reduce((acc, fi) => { acc[fi.category] = (acc[fi.category] || 0) + 1; return acc; }, {})}
                            />
                          </div>
                        )}
                        {f.errorsAi && Object.keys(f.errorsAi).length > 0 && (
                          <div style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>
                            ⚠️ AI: {Object.entries(f.errorsAi).map(([id, err]) => `${id}: ${err}`).join(" · ")}
                          </div>
                        )}
                        {f.status === "error" && f.resultLocal && !(f.errorsAi && Object.keys(f.errorsAi).length) && (
                          <div style={{ fontSize: 11, color: "#b45309", marginTop: 6 }}>
                            ⚠️ AI step failed{f.error ? `: ${f.error}` : ""} — use <strong>Re-run all (AI)</strong> or turn off AI toggles
                          </div>
                        )}
                        {f.status === "error" && !f.resultLocal && (
                          <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>
                            ⚠️ {f.error || "Analysis failed"} — <span onClick={e => { e.stopPropagation(); reanalyse(f); }} style={{ textDecoration: "underline", cursor: "pointer" }}>retry</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          )}

          {/* ── FINDINGS TAB ── */}
          {activeTab === "findings" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>
                  {displayFile ? <>Findings — <span style={{ color: "#14b8a6" }}>{displayFile.name.split("/").pop()}</span></> : "All findings"}
                  <span style={{ fontWeight: 400, fontSize: 12, color: "#888", marginLeft: 8 }}>({filteredFindings.length} shown)</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <AnalysisViewToggle compact value={resultsView} onChange={setResultsView} hasLocal={hasLocalResults} providersWithResults={providersWithResults} />
                  <DownloadReportButton
                    projectName={projectName}
                    files={files}
                    categories={CATEGORIES}
                    analysisModeLabel={getAnalysisModeLabel(aiSettings)}
                    auditStack={stack}
                    resultsView={resultsView}
                  />
                  {displayFile && (
                    <button onClick={() => setSelectedFile(null)}
                      style={{ fontSize: 11.5, color: "#14b8a6", background: "#f0fdfa", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                      ← Show all files
                    </button>
                  )}
                </div>
              </div>

              {/* Category scores for the selected file — shows which category failed; click to filter */}
              {displayFile && displayResult && (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Category scores · click to filter findings
                    </span>
                    {catFilter !== "all" && (
                      <button type="button" onClick={() => setCatFilter("all")}
                        style={{ fontSize: 10.5, fontWeight: 600, color: "#0d9488", background: "#f0fdfa", border: "none", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                        Clear filter
                      </button>
                    )}
                  </div>
                  <FileCategoryScores
                    categories={CATEGORIES}
                    result={displayResult}
                    max={CATEGORIES.length}
                    columns={2}
                    onSelectCategory={(id) => setCatFilter(id === catFilter ? "all" : id)}
                    activeCategory={catFilter === "all" ? null : catFilter}
                    findingCounts={displayCatCounts}
                  />
                </div>
              )}

              {/* Severity filter */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {[
                  { id: "all", label: `All (${displayFindingsBase.length})`, color: "#14b8a6", bg: "#f0fdfa" },
                  { id: "critical", label: `🔴 Critical (${displayFindingsBase.filter(f=>f.severity==="critical").length})`, color: "#dc2626", bg: "#fef2f2" },
                  { id: "warning",  label: `🟡 Warning (${displayFindingsBase.filter(f=>f.severity==="warning").length})`,  color: "#d97706", bg: "#fffbeb" },
                  { id: "info",     label: `🔵 Info (${displayFindingsBase.filter(f=>f.severity==="info").length})`,     color: "#2563eb", bg: "#eff6ff" },
                ].map(s => (
                  <button key={s.id} onClick={() => setSevFilter(s.id)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${sevFilter === s.id ? s.color : "#e5e7eb"}`, background: sevFilter === s.id ? s.bg : "#fff", color: sevFilter === s.id ? s.color : "#666", fontSize: 11.5, cursor: "pointer", fontWeight: sevFilter === s.id ? 700 : 400 }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Category filter */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #e5e7eb" }}>
                <button onClick={() => setCatFilter("all")}
                  style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${catFilter === "all" ? "#14b8a6" : "#e5e7eb"}`, background: catFilter === "all" ? "#f0fdfa" : "#fff", color: catFilter === "all" ? "#14b8a6" : "#666", fontSize: 11, cursor: "pointer", fontWeight: catFilter === "all" ? 700 : 400 }}>
                  All categories
                </button>
                {CATEGORIES.map(cat => {
                  const count = displayFindingsBase.filter(f => f.category === cat.id).length;
                  if (!count) return null;
                  return (
                    <button key={cat.id} onClick={() => setCatFilter(cat.id === catFilter ? "all" : cat.id)}
                      style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${catFilter === cat.id ? cat.color : "#e5e7eb"}`, background: catFilter === cat.id ? cat.bg : "#fff", color: catFilter === cat.id ? cat.color : "#666", fontSize: 11, cursor: "pointer", fontWeight: catFilter === cat.id ? 700 : 400, display: "flex", alignItems: "center", gap: 4 }}>
                      {cat.icon} {cat.label}
                      <span style={{ background: catFilter === cat.id ? cat.color : "#e5e7eb", color: catFilter === cat.id ? "#fff" : "#666", borderRadius: 99, padding: "0 5px", fontSize: 9, fontWeight: 700 }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {filteredFindings.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "2rem", textAlign: "center", color: "#9ca3af" }}>
                  {allFindings.length === 0 ? "No files analysed yet. Load files from the sidebar." : "No findings match this filter."}
                </div>
              ) : (
                filteredFindings.map((f, i) => (
                  <div key={i}>
                    {!displayFile && f.fileName && (i === 0 || filteredFindings[i-1]?.fileName !== f.fileName) && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#888", padding: "8px 4px 4px", letterSpacing: "0.05em" }}>📄 {f.fileName}</div>
                    )}
                    <FindingCard f={enrichFindingWithFileContext(f, fileForFinding(f))} categories={CATEGORIES} stackId={stackId} onOpenPractices={() => { setSelectedFile(null); setActiveTab("guide"); }} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── RADAR TAB ── */}
          {activeTab === "radar" && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111", marginBottom: 14 }}>Coverage radar — {projectName}</div>
              {allResults.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "3rem", textAlign: "center", color: "#9ca3af" }}>Load and analyse files first.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start" }}>
                  <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "1rem" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8, textAlign: "center" }}>Average across {allResults.length} file{allResults.length > 1 ? "s" : ""}</div>
                    <RadarChart scores={avgCatScores} categories={CATEGORIES} accent={stack.accent} />
                  </div>
                  <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "1rem" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 12 }}>Category averages</div>
                    {CATEGORIES.map(cat => {
                      const s = avgCatScores[cat.id] ?? 0;
                      const g = grade(s);
                      return (
                        <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: 14, width: 20, flexShrink: 0 }}>{cat.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{cat.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: g.color }}>{s} <span style={{ fontWeight: 400, fontSize: 10, color: "#888" }}>{g.label}</span></span>
                            </div>
                            <MiniBar score={s} color={cat.color} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ROADMAP TAB ── */}

          {activeTab === "rules" && (
            <RulesReviewTab
              stackId={stackId}
              categories={CATEGORIES}
              hasFiles={files.length > 0}
              rerunBusy={rerunBusy}
              onRerunRules={() => rerunAllFiles("local")}
            />
          )}

          {activeTab === "guide" && (
            <BestPracticesPanel key={stackId} categories={CATEGORIES} stackId={stackId} />
          )}

          {activeTab === "roadmap" && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111", marginBottom: 14 }}>Fix roadmap — {projectName}</div>
              {allResults.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "3rem", textAlign: "center", color: "#9ca3af" }}>Load and analyse files first.</div>
              ) : (
                <div>
                  {/* Aggregate roadmap from all files */}
                  {(() => {
                    const phases = ["Immediate (Day 1)", "Short-term (Week 1)", "Long-term (Month 1)"];
                    const colors = ["#dc2626", "#d97706", "#16a34a"];
                    const bgs = ["#fef2f2", "#fffbeb", "#f0fdf4"];
                    const borders = ["#fca5a5", "#fcd34d", "#86efac"];
                    const allActions = phases.map((phase, pi) => {
                      const actions = new Set();
                      allResults.forEach(f => {
                        (f.result.roadmap || []).forEach(r => {
                          if (r.phase?.includes(phases[pi].split(" ")[0])) {
                            (r.actions || []).forEach(a => actions.add(a));
                          }
                        });
                      });
                      return { phase, actions: [...actions], color: colors[pi], bg: bgs[pi], border: borders[pi] };
                    });
                    return allActions.map((ph, i) => ph.actions.length > 0 && (
                      <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 12, overflow: "hidden" }}>
                        <div style={{ background: ph.bg, borderBottom: `1px solid ${ph.border}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: ph.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i+1}</div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: ph.color }}>{ph.phase}</div>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: ph.color, background: "white", padding: "2px 8px", borderRadius: 99, fontWeight: 600 }}>{ph.actions.length} actions</span>
                        </div>
                        <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 7 }}>
                          {ph.actions.map((a, j) => (
                            <div key={j} style={{ background: ph.bg, borderRadius: 8, padding: "8px 11px", fontSize: 12.5, color: "#374151", border: `1px solid ${ph.border}`, display: "flex", gap: 7, alignItems: "flex-start" }}>
                              <span style={{ flexShrink: 0 }}>{["🔴","🟡","🟢"][i]}</span><span>{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}

                  {/* Metrics panel */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "1rem", marginTop: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginBottom: 10 }}>Aggregate metrics across project</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                      {(() => {
                        // Stack-agnostic: aggregate whatever metric keys the active analyzer emits.
                        const agg = {};
                        allResults.forEach((f) => {
                          const fm = f.result.metrics || {};
                          for (const [k, v] of Object.entries(fm)) {
                            if (typeof v === "number") agg[k] = (agg[k] || 0) + v;
                            else if (typeof v === "boolean") agg[k] = (agg[k] || 0) + (v ? 1 : 0);
                          }
                        });
                        const NEUTRAL = /^(total|count|files|restController)/i;
                        const entries = Object.entries(agg);
                        if (!entries.length) {
                          return <div style={{ fontSize: 12, color: "#94a3b8" }}>No metrics for this stack.</div>;
                        }
                        return entries.map(([k, v]) => {
                          const bad = !NEUTRAL.test(k) && v > 0;
                          return (
                            <div key={k} style={{ background: bad ? "#fef2f2" : "#f0fdf4", borderRadius: 9, padding: "9px 11px", border: `1px solid ${bad ? "#fca5a5" : "#86efac"}` }}>
                              <div style={{ fontSize: 22, fontWeight: 800, color: bad ? "#dc2626" : "#16a34a" }}>{v}</div>
                              <div style={{ fontSize: 10.5, color: "#374151", fontWeight: 500, marginTop: 1 }}>{k.replace(/([A-Z])/g, " $1").trim()}</div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
         </ErrorBoundary>
        </div>
      </div>

      <StudioFooter
        categoryCount={CATEGORIES.length}
        modeLabel={getAnalysisModeLabel(aiSettings)}
        files={files}
        stackId={stackId}
        onRunRules={() => rerunAllFiles("local")}
      />

      <AiSettingsModal open={settingsOpen} setupFromToggle={aiSetupFromToggle} initialProvider={settingsProvider} onClose={() => { setSettingsOpen(false); setAiSetupFromToggle(false); setSettingsProvider(null); }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
