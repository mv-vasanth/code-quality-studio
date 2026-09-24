import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { grade } from "../shared/grade.js";
import { STACK_LIST, DEFAULT_STACK_ID, getPersona } from "../stacks/definitions.js";
import { getAuditStack } from "../stacks/registry.js";
import StudioHeader from "../components/layout/StudioHeader.jsx";
import ErrorBoundary from "../components/layout/ErrorBoundary.jsx";
import { getAnalysisModeLabel, isAiConfigured } from "../settings/aiSettingsDefaults.js";
import { useAiSettings } from "../settings/AiSettingsContext.jsx";
import AiSettingsModal from "../components/settings/AiSettingsModal.jsx";
import { sanitizeClientError } from "../services/ai/safeErrors.js";
import { runFileAnalysis } from "../services/runFileAnalysis.js";
import { runCrossFileAnalysis } from "../analyzers/crossFileAnalyzer.js";
import { scoreFromFindings } from "../analyzers/analyzerUtils.js";
import { generateAiFix } from "../services/ai/generateFix.js";
import { fixAllCritical } from "../services/ai/fixAllCritical.js";
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
import FileDropModal from "../components/layout/FileDropModal.jsx";
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
import { loadRuleSettings } from "../rules/ruleSettingsStorage.js";
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

/**
 * Run async factory functions with a bounded concurrency limit.
 * Up to `limit` tasks execute at the same time; the rest wait in a queue.
 * Individual task failures are swallowed (logged) so one bad file never
 * kills the remaining workers.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} limit  Max simultaneous tasks
 */
async function runConcurrent(tasks, limit = 4) {
  const queue = [...tasks];
  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length) {
        const task = queue.shift();
        if (task) {
          try {
            await task();
          } catch (err) {
            // Isolate: one failing file must not stop remaining workers
            console.warn("[runConcurrent] task failed, continuing:", err?.message ?? err);
          }
        }
      }
    },
  );
  await Promise.all(workers);
}

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
  const [fileDropOpen, setFileDropOpen] = useState(false);
  const [resultsView, setResultsView] = useState("local");
  const [stackId, setStackId] = useState(() => { try { return sessionStorage.getItem("cqs-active-stack") || DEFAULT_STACK_ID; } catch { return DEFAULT_STACK_ID; } });
  const stack = getAuditStack(stackId);
  const CATEGORIES = stack.categories;
  const [projectName, setProjectName] = useState(stack.defaultProjectName);
  const [workspaceSavedAt, setWorkspaceSavedAt] = useState(null);
  const [folderHint, setFolderHint] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const restoreAnalysisRef = useRef(false);
  const fileInputRef = useRef();
  const folderInputRef = useRef();

  // ── Responsive sidebar state ──────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
      if (w >= 768) setSidebarOpen(false); // close drawer when resizing to desktop/tablet
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fix-all-critical batch AI state
  const [fixAllBusy, setFixAllBusy] = useState(false);
  const [fixAllProgress, setFixAllProgress] = useState(null); // {current, total, fileName}
  const [fixAllResults, setFixAllResults] = useState(null);   // array of results
  const [fixAllError, setFixAllError] = useState(null);

  // Live rule settings — updated whenever the Rules tab persists a change,
  // used to filter findings in the display without requiring a re-run.
  const [ruleSettings, setRuleSettings] = useState(() => loadRuleSettings(stackId));

  // Reload rule settings whenever the stack changes
  useEffect(() => { setRuleSettings(loadRuleSettings(stackId)); }, [stackId]);

  // Set of currently-disabled rule IDs (for instant finding suppression)
  const disabledRuleIds = useMemo(
    () => new Set(Object.keys(ruleSettings.disabled).filter((id) => ruleSettings.disabled[id] === true)),
    [ruleSettings],
  );

  // Skipped rule IDs across all files — must be top-level (not inside JSX conditionals)
  const skippedRuleIds = useMemo(
    () => new Set(files.flatMap(f => (f.resultLocal?.skippedRules ?? []).map(s => s.ruleId))),
    [files],
  );

  const changeStack = useCallback((nextId) => {
    if (nextId === stackId) return;
    if (files.length > 0 && !window.confirm("Switching stack clears loaded files. Continue?")) return;
    if (files.length > 0) { setFiles([]); setSelectedFile(null); setFolderHint(""); setWorkspaceSavedAt(null); clearWorkspace(); }
    setStackId(nextId);
    try { sessionStorage.setItem("cqs-active-stack", nextId); } catch {}
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
      try { activeStack = sessionStorage.getItem("cqs-active-stack") || saved.stackId || DEFAULT_STACK_ID; } catch { activeStack = saved.stackId || DEFAULT_STACK_ID; }
      if (saved.stackId && saved.stackId !== activeStack) { setWorkspaceReady(true); return; }
      setStackId(saved.stackId || activeStack);
      try { sessionStorage.setItem("cqs-active-stack", saved.stackId || activeStack); } catch {}
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

  /**
   * Merge cross-file duplicate findings into each file's resultLocal.
   * Uses the functional setFiles updater so it always sees the latest state,
   * including results written by any preceding analyseFile calls.
   */
  const runCrossFilePass = useCallback(() => {
    setFiles((prev) => {
      const eligible = prev.filter((f) => f.resultLocal && f.content);
      if (eligible.length < 2) return prev;

      const crossFindings = runCrossFileAnalysis(eligible);
      if (!Object.keys(crossFindings).length) return prev;

      const categoryIds = stack.categories.map((c) => c.id);

      return prev.map((f) => {
        const extra = crossFindings[f.name];
        if (!extra?.length || !f.resultLocal) return f;

        // Strip any previous cross-file findings to avoid duplicates on rerun
        const base = (f.resultLocal.findings || []).filter((fi) => !fi._crossFile);
        const findings = [...base, ...extra];

        const categoryScores = Object.fromEntries(
          categoryIds.map((id) => [id, scoreFromFindings(findings, id)]),
        );
        const overallScore = Math.round(
          categoryIds.reduce((sum, id) => sum + categoryScores[id], 0) / categoryIds.length,
        );

        return {
          ...f,
          resultLocal: { ...f.resultLocal, findings, categoryScores, overallScore },
        };
      });
    });
  }, [stack]);

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
    // Run up to 4 files in parallel instead of one at a time
    await runConcurrent(
      batch.map((f) => () => analyseFile(f, mode, providerId)),
      4,
    );
    // Re-run cross-file duplicate detection after local rules finish
    if (mode === "local" || mode === "auto") runCrossFilePass();
    setRerunBusy(false);
  }, [files, analyseFile, rerunBusy, runCrossFilePass]);

  const rerunAllBoth = useCallback(async () => {
    if (!files.length || rerunBusy) return;
    const runnable = getRunnableAiProviders(aiSettings);
    if (!runnable.length) {
      setSettingsOpen(true);
      return;
    }
    setRerunBusy(true);
    const batch = [...files];
    // Run up to 4 files in parallel; within each file keep local → AI order
    await runConcurrent(
      batch.map((f) => async () => {
        await analyseFile(f, "local");
        for (const p of runnable) {
          await analyseFile(f, "ai", p.id);
        }
      }),
      4,
    );
    runCrossFilePass();
    setRerunBusy(false);
  }, [files, analyseFile, rerunBusy, aiSettings, runCrossFilePass]);

  const loadFiles = useCallback(async (rawFiles, { runAnalysis = true } = {}) => {
    const incoming = [];
    for (const rf of rawFiles) {
      if (!stack.filePattern.test(rf.name)) continue;
      const content = await rf.text();
      const relPath = rf.webkitRelativePath || rf.name;
      incoming.push({ name: relPath, content });
    }
    if (!incoming.length) return;

    // Compute diff OUTSIDE the updater so React 18 StrictMode's double-invoke
    // doesn't push duplicate entries into newFiles / toReanalyse.
    const newFiles = [];
    const toReanalyse = [];
    for (const { name, content } of incoming) {
      const existing = files.find((f) => f.name === name);
      if (!existing) {
        newFiles.push({ name, content, status: "pending", resultLocal: null, resultsAi: {}, errorsAi: {} });
      } else if (existing.content !== content) {
        toReanalyse.push({ ...existing, content, status: "pending", resultLocal: null, resultsAi: {}, errorsAi: {}, error: null });
      }
    }

    // Pure updater — no side effects, safe to call twice
    setFiles((prev) => {
      const next = [...prev];
      for (const { name, content } of incoming) {
        const idx = next.findIndex((f) => f.name === name);
        if (idx >= 0) {
          if (next[idx].content !== content) {
            next[idx] = { ...next[idx], content, status: "pending", resultLocal: null, resultsAi: {}, errorsAi: {}, error: null };
          }
        } else {
          next.push({ name, content, status: "pending", resultLocal: null, resultsAi: {}, errorsAi: {} });
        }
      }
      return next;
    });

    setFolderHint(inferFolderHint([...files.map((f) => f.name), ...incoming.map((i) => i.name)]));
    setActiveTab("files");

    if (!runAnalysis) return;

    const toRun = providersToRunOnUpload(aiSettings);
    // Run all new + changed files in parallel (up to 4 at once); within each
    // file keep local → AI order so results always appear complete.
    const allToProcess = [...newFiles, ...toReanalyse];
    await runConcurrent(
      allToProcess.map((f) => async () => {
        await analyseFile(f, "local");
        for (const pid of toRun) {
          await analyseFile(f, "ai", pid);
        }
      }),
      4,
    );

    // After all individual analyses finish, run cross-file duplicate detection
    runCrossFilePass();
  }, [files, analyseFile, stack, aiSettings, runCrossFilePass]);

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
      await runConcurrent(
        pending.map((f) => async () => {
          await analyseFile(f, "local");
          for (const pid of toRun) {
            await analyseFile(f, "ai", pid);
          }
        }),
        4,
      );
      runCrossFilePass();
    })();
  }, [workspaceReady, files, aiSettings, analyseFile, runCrossFilePass]);

  const reanalyse = (file) => analyseFile(file);

  // Run a single file on demand (rules + any enabled AI providers) — used by per-card Run buttons.
  const runFile = useCallback(async (file) => {
    await analyseFile(file, "local");
    for (const pid of providersToRunOnUpload(aiSettings)) {
      await analyseFile(file, "ai", pid);
    }
  }, [analyseFile, aiSettings]);

  const handleFixAllCritical = async () => {
    if (fixAllBusy || !aiSettings) return;
    setFixAllBusy(true);
    setFixAllProgress(null);
    setFixAllResults(null);
    setFixAllError(null);
    try {
      // Build the files array from current results
      const filesToFix = files
        .filter((f) => f.resultLocal)
        .map((f) => ({
          name: f.name,
          content: f.content || "",
          result: f.resultLocal,
        }));
      const results = await fixAllCritical({
        files: filesToFix,
        settings: aiSettings,
        onProgress: (current, total, fileName) =>
          setFixAllProgress({ current, total, fileName }),
      });
      setFixAllResults(results);
    } catch (err) {
      setFixAllError(err.message || "Fix-all failed");
    } finally {
      setFixAllBusy(false);
      setFixAllProgress(null);
    }
  };

  /**
   * Load a folder using the File System Access API (showDirectoryPicker).
   * Gives a native OS folder picker with no browser "Upload N files?" prompt.
   * Falls back to the hidden <input webkitdirectory> on unsupported browsers.
   */
  const handleLoadFolder = useCallback(async () => {
    // Feature-detect File System Access API
    if (!window.showDirectoryPicker) {
      folderInputRef.current?.click();
      return;
    }
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: "read" });
    } catch (err) {
      if (err.name === "AbortError") return; // user cancelled — silent
      // FSA failed for some reason, fall back
      folderInputRef.current?.click();
      return;
    }

    // Recursively collect all files matching the stack pattern
    const rawFiles = [];
    async function collectEntries(handle, parentPath) {
      for await (const [entryName, entry] of handle.entries()) {
        const entryPath = parentPath ? `${parentPath}/${entryName}` : entryName;
        if (entry.kind === "file") {
          if (stack.filePattern.test(entryName)) {
            rawFiles.push({ _fsaHandle: entry, name: entryName, webkitRelativePath: entryPath });
          }
        } else if (entry.kind === "directory") {
          await collectEntries(entry, entryPath);
        }
      }
    }
    await collectEntries(dirHandle, "");

    if (!rawFiles.length) return;

    // Wrap FSA file handles so loadFiles can call .text() on them
    const wrappedFiles = rawFiles.map((rf) => ({
      name: rf.name,
      webkitRelativePath: rf.webkitRelativePath,
      text: async () => {
        const file = await rf._fsaHandle.getFile();
        return file.text();
      },
    }));

    await loadFiles(wrappedFiles);
  }, [stack, loadFiles]);

  const hasLocalResults = files.some((f) => fileHasResult(f, "local"));
  const providersWithResults = listProvidersWithResults(files);
  const hasAiResults = hasAnyAiResults(files);

  useEffect(() => {
    if (resultsView === "compare-all") {
      // compare-all needs both local and AI results
      if (!(hasLocalResults && hasAiResults)) {
        if (hasAiResults && !hasLocalResults && providersWithResults[0]) {
          setResultsView(providersWithResults[0].id);
        } else {
          setResultsView("local");
        }
      }
    } else if (resultsView !== "local") {
      // Viewing a specific AI provider — reset if that provider lost its results
      const stillHasResults = providersWithResults.some((p) => p.id === resultsView);
      if (!stillHasResults) {
        setResultsView(hasLocalResults ? "local" : providersWithResults[0]?.id ?? "local");
      }
    }
  }, [hasLocalResults, hasAiResults, resultsView, providersWithResults]);

  const chartView = resultsView === "compare-all" ? "local" : resultsView;
  const allResults = filesWithViewResults(files, chartView);
  const avgScore = averageScore(files, resultsView === "compare-all" ? "local" : resultsView);
  const avgBySource = averageScoresBySource(files);

  // Exclude disabled rules from all counts and display
  const allFindings = collectFindings(files, resultsView).filter((f) => !disabledRuleIds.has(f.ruleId));
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
    // Never show findings for rules the user has disabled in the Rules tab
    !disabledRuleIds.has(f.ruleId) &&
    (catFilter === "all" || f.category === catFilter) &&
    (sevFilter === "all" || f.severity === sevFilter)
  );

  // For the selected-file findings view: its per-category scores + finding counts,
  // so it's clear which category drove the failure.
  const displayResult = displayFile
    ? getStoredResult(displayFile, resultsView === "compare-all" ? "local" : resultsView)
    : null;
  const displayCatCounts = displayFindingsBase.reduce((acc, f) => {
    if (!disabledRuleIds.has(f.ruleId)) {
      acc[f.category] = (acc[f.category] || 0) + 1;
    }
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
        onAddFiles={() => setFileDropOpen(true)}
        onLoadFolder={() => setFileDropOpen(true)}
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
        isMobile={isMobile}
        onMenuToggle={() => setSidebarOpen(v => !v)}
        onRun={() => rerunAllFiles("local")}
        onRunAi={() => {
          // Guard: same check as rerunAllBoth — open settings if no provider configured
          const runnable = getRunnableAiProviders(aiSettings);
          if (!runnable.length) { setSettingsOpen(true); return; }
          rerunAllFiles("ai");
        }}
        onRunBoth={rerunAllBoth}
        rerunBusy={rerunBusy}
        aiConfigured={getRunnableAiProviders(aiSettings).length > 0}
      />
      {/* Centered file-drop modal — replaces native browser file pickers */}
      {fileDropOpen && (
        <FileDropModal
          fileAccept={stack.fileAccept}
          onFiles={(fileList) => loadFiles([...fileList])}
          onClose={() => setFileDropOpen(false)}
        />
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>

        {/* ── Mobile overlay backdrop ── */}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(15,23,42,0.45)" }}
            aria-hidden
          />
        )}

        {/* ── LEFT SIDEBAR ── */}
        <div style={{
          // Desktop: 228px fixed. Tablet: 48px icon rail. Mobile: off-canvas overlay.
          width: isMobile ? 0 : isTablet ? 48 : 228,
          flexShrink: 0,
          ...(isMobile ? {
            position: "fixed", top: 0, bottom: 0, left: 0,
            width: 260, zIndex: 200,
            transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.22s ease",
          } : {}),
          background: "#fafafa",
          borderRight: "1px solid #e2e8f0",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Project name — hidden on tablet icon rail */}
          {!isTablet && (
            <div style={{ padding: "10px 12px", borderBottom: "1px solid #e8edf2" }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Project</div>
              <input value={projectName} onChange={e => setProjectName(e.target.value)}
                style={{ width: "100%", fontSize: 12.5, border: "1px solid #e2e8f0", borderRadius: 7, padding: "5px 9px", color: "#0f172a", outline: "none", boxSizing: "border-box", background: "#fff", fontWeight: 600 }}/>
            </div>
          )}

          {/* Nav */}
          <div style={{ padding: isTablet ? "8px 4px 4px" : "6px 6px 4px" }}>
            {[
              { id: "overview", icon: "🏠", label: "Overview" },
              { id: "files",    icon: "📂", label: `Files (${files.length})` },
              { id: "findings", icon: "🔍", label: `Findings (${allFindings.length})` },
              { id: "rules",    icon: "⚙️", label: "Rule Settings" },
              { id: "radar",    icon: "🕸️", label: "Coverage Radar" },
              { id: "roadmap",  icon: "🗺️", label: "Roadmap" },
              { id: "guide",    icon: "📖", label: "Practices (" + stack.shortName + ")" },
            ].map(n => (
              <button key={n.id}
                onClick={() => { setActiveTab(n.id); setSelectedFile(null); if (isMobile) setSidebarOpen(false); }}
                title={isTablet ? n.label : undefined}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isTablet ? "center" : "flex-start",
                  gap: isTablet ? 0 : 8,
                  padding: isTablet ? "9px 4px" : "7px 10px",
                  border: "none", borderRadius: 7,
                  background: activeTab === n.id ? "#e0fdfa" : "transparent",
                  color: activeTab === n.id ? "#0d9488" : "#475569",
                  fontWeight: activeTab === n.id ? 700 : 400,
                  fontSize: 12.5, cursor: "pointer", textAlign: "left", marginBottom: 1,
                  borderLeft: activeTab === n.id ? "3px solid #0d9488" : "3px solid transparent",
                }}>
                <span style={{ fontSize: isTablet ? 17 : 13 }}>{n.icon}</span>
                {!isTablet && <span>{n.label}</span>}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px" }}>
            {files.length > 0 && !isTablet && (
              <>
                <WorkspaceSessionBar
                  folderHint={folderHint}
                  fileCount={files.length}
                  savedAt={workspaceSavedAt}
                  busy={rerunBusy}
                  onRerunRules={() => rerunAllFiles("local")}
                  onAddFiles={() => setFileDropOpen(true)}
                  onAddFolder={() => setFileDropOpen(true)}
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

          {files.length > 0 && !isTablet && (
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
        <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: files.length === 0 && activeTab === "overview" ? "0" : "16px", display: "flex", flexDirection: "column" }}>
         <ErrorBoundary resetKey={`${activeTab}:${resultsView}:${selectedFile?.name ?? ""}`}>

          {/* ── OVERVIEW ── */}
          {activeTab === "overview" && (
            <div style={{ flex: 1 }}>
              {files.length === 0 ? (
                /* ── Full-viewport welcome — no card-in-card ── */
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  style={{
                    height: "100%",
                    minHeight: "calc(100vh - 58px)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: dragging
                      ? "linear-gradient(145deg,#f0fdfa 0%,#e0f2fe 100%)"
                      : "linear-gradient(145deg,#f8fafc 0%,#f1f5f9 100%)",
                    transition: "background 0.25s",
                    padding: "48px 32px",
                    position: "relative",
                  }}
                >
                  {/* Drag overlay ring */}
                  {dragging && (
                    <div style={{
                      position: "absolute", inset: 12, borderRadius: 16,
                      border: "2.5px dashed #14b8a6", pointerEvents: "none",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                  )}

                  {/* App icon */}
                  <div style={{
                    width: 72, height: 72, borderRadius: 20,
                    background: "linear-gradient(135deg,#0d9488 0%,#0891b2 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 36, marginBottom: 20,
                    boxShadow: "0 8px 32px rgba(13,148,136,0.25)",
                  }}>⚡</div>

                  {/* Title */}
                  <div style={{ fontWeight: 800, fontSize: 28, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.5px" }}>
                    Code Quality Studio
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#0d9488", marginBottom: 28 }}>
                    {getPersona(stack.persona).label} · {getPersona(stack.persona).blurb}
                  </div>

                  {/* CTA buttons */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 16, width: "100%", maxWidth: 360 }}>
                    <button onClick={() => setFileDropOpen(true)}
                      style={{ flex: 1, padding: "13px 12px", background: "#0d9488", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 14px rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
                      📄 {stack.loadFilesLabel || "Load files"}
                    </button>
                    <button onClick={() => setFileDropOpen(true)}
                      style={{ flex: 1, padding: "13px 12px", background: "#fff", color: "#0d9488", border: "2px solid #14b8a6", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
                      📁 Load folder
                    </button>
                  </div>

                  {/* FSA hint */}
                  <p style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 32, textAlign: "center", maxWidth: 380, lineHeight: 1.5, margin: "0 auto 32px" }}>
                    🔒 Your browser will ask permission to read the folder — click <strong style={{ color: "#64748b" }}>Allow</strong> once and it won't ask again for that folder.
                  </p>

                  {/* Feature cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, maxWidth: 740, width: "100%" }}>
                    {[
                      { icon: "🔍", label: "45+ rules", desc: "Playwright best practices checked instantly" },
                      { icon: "🤖", label: "AI review", desc: "Claude, Bedrock, or Gemini analysis on demand" },
                      { icon: "🔄", label: "Duplicate detection", desc: "Cross-file & within-file code duplication" },
                      { icon: "⚡", label: "Parallel analysis", desc: "Up to 4 files analysed simultaneously" },
                    ].map(f => (
                      <div key={f.label} style={{ background: "#fff", borderRadius: 12, padding: "14px 14px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: 12.5, color: "#0f172a", marginBottom: 3 }}>{f.label}</div>
                        <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.45 }}>{f.desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* Category chips */}
                  <div style={{ marginTop: 24, display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center", maxWidth: 680 }}>
                    {CATEGORIES.map(c => (
                      <div key={c.id} style={{ background: c.bg, borderRadius: 20, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5, border: `1px solid ${c.color}33` }}>
                        <span style={{ fontSize: 11 }}>{c.icon}</span>
                        <span style={{ fontSize: 11, color: c.color, fontWeight: 600 }}>{c.label}</span>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => setActiveTab("guide")}
                    style={{ marginTop: 20, background: "transparent", border: "none", color: "#14b8a6", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                    View {stack.shortName} best practices reference →
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#111", marginBottom: 14 }}>{projectName} — Overview</div>

                  {/* ── Incomplete analysis banner ── */}
                  {analysedCount < files.length && !rerunBusy && (
                    <div style={{
                      background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10,
                      padding: "12px 16px", marginBottom: 14, display: "flex",
                      alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#c2410c" }}>
                          ⚠️ Analysis incomplete — {analysedCount} of {files.length} files processed
                        </div>
                        <div style={{ fontSize: 11.5, color: "#92400e", marginTop: 3, lineHeight: 1.4 }}>
                          Some files may have failed silently. Click <strong>Analyse remaining</strong> to retry unanalysed files.
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={rerunBusy}
                        onClick={async () => {
                          const unanalysed = files.filter(f => !f.resultLocal && f.status !== "analysing");
                          if (!unanalysed.length) return;
                          setRerunBusy(true);
                          await runConcurrent(unanalysed.map(f => () => analyseFile(f, "local")), 4);
                          runCrossFilePass();
                          setRerunBusy(false);
                        }}
                        style={{
                          padding: "8px 18px", background: "#ea580c", color: "#fff", border: "none",
                          borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: "pointer",
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        ↺ Analyse remaining ({files.length - analysedCount})
                      </button>
                    </div>
                  )}

                  {rerunBusy && (
                    <div style={{
                      background: "#f0fdfa", border: "1px solid #5eead4", borderRadius: 10,
                      padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <span style={{ width: 14, height: 14, border: "2px solid #5eead4", borderTopColor: "#0d9488", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0d9488" }}>Analysing files…</div>
                        <div style={{ fontSize: 11.5, color: "#0f766e" }}>{analysedCount} of {files.length} done — results appear as each file completes</div>
                      </div>
                    </div>
                  )}

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
                              max={CATEGORIES.length}
                              columns={1}
                              onSelectCategory={(id) => { setSelectedFile(f); setCatFilter(id); setSevFilter("all"); setActiveTab("findings"); }}
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
                  {/* ── Fix all critical button ── */}
                  {aiSettings && (() => {
                    const criticalCount = allFindings.filter((f) => f.severity === "critical" && !disabledRuleIds.has(f.ruleId)).length;
                    if (criticalCount === 0) return null;
                    return (
                      <button
                        type="button"
                        onClick={handleFixAllCritical}
                        disabled={fixAllBusy}
                        title="Call AI to generate fixes for every critical finding at once"
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          fontSize: 11.5, fontWeight: 700, padding: "6px 14px",
                          borderRadius: 8, border: "1px solid #a78bfa",
                          background: fixAllBusy ? "#f5f3ff" : "#ede9fe",
                          color: "#7c3aed", cursor: fixAllBusy ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        {fixAllBusy ? (
                          <>
                            <span style={{ width: 10, height: 10, border: "2px solid #a78bfa", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                            {fixAllProgress
                              ? `${fixAllProgress.current}/${fixAllProgress.total} — ${fixAllProgress.fileName}`
                              : "Preparing…"}
                          </>
                        ) : (
                          `✨ Fix all critical (${criticalCount})`
                        )}
                      </button>
                    );
                  })()}
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
                    onSelectCategory={(id) => {
                      const next = id === catFilter ? "all" : id;
                      setCatFilter(next);
                      if (next !== "all") setSevFilter("all");
                    }}
                    activeCategory={catFilter === "all" ? null : catFilter}
                    findingCounts={displayCatCounts}
                  />
                </div>
              )}

              {/* Severity filter */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {[
                  { id: "all",      label: `All (${displayFindingsBase.filter(f=>!disabledRuleIds.has(f.ruleId)).length})`, color: "#14b8a6", bg: "#f0fdfa" },
                  { id: "critical", label: `🔴 Critical (${displayFindingsBase.filter(f=>!disabledRuleIds.has(f.ruleId)&&f.severity==="critical").length})`, color: "#dc2626", bg: "#fef2f2" },
                  { id: "warning",  label: `🟡 Warning (${displayFindingsBase.filter(f=>!disabledRuleIds.has(f.ruleId)&&f.severity==="warning").length})`,  color: "#d97706", bg: "#fffbeb" },
                  { id: "info",     label: `🔵 Info (${displayFindingsBase.filter(f=>!disabledRuleIds.has(f.ruleId)&&f.severity==="info").length})`,     color: "#2563eb", bg: "#eff6ff" },
                ].map(s => (
                  <button key={s.id} onClick={() => {
                    // When switching severity, check if the current category has any findings
                    // in the new severity — if not, reset it to avoid an empty result.
                    if (s.id !== sevFilter && catFilter !== "all") {
                      const hasFindings = displayFindingsBase.some(
                        f => !disabledRuleIds.has(f.ruleId) &&
                             (s.id === "all" || f.severity === s.id) &&
                             f.category === catFilter
                      );
                      if (!hasFindings) setCatFilter("all");
                    }
                    setSevFilter(s.id);
                  }}
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
                  const count = displayFindingsBase.filter(f =>
                    !disabledRuleIds.has(f.ruleId) &&
                    f.category === cat.id &&
                    (sevFilter === "all" || f.severity === sevFilter)
                  ).length;
                  if (!count) return null;
                  return (
                    <button key={cat.id} onClick={() => {
                      const next = cat.id === catFilter ? "all" : cat.id;
                      setCatFilter(next);
                      if (next !== "all") setSevFilter("all");
                    }}
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
                    <FindingCard
                      f={enrichFindingWithFileContext(f, fileForFinding(f))}
                      categories={CATEGORIES}
                      stackId={stackId}
                      onOpenPractices={() => { setSelectedFile(null); setActiveTab("guide"); }}
                      onAiFix={isAiConfigured(aiSettings) ? (finding) => {
                        const file = fileForFinding(finding);
                        return generateAiFix({
                          settings: aiSettings,
                          fileContent: file?.content || "",
                          fileName: finding.sourcePath || finding.fileName || "",
                          finding,
                        });
                      } : null}
                    />
                  </div>
                ))
              )}

              {/* ── Fix-all results panel ── */}
              {(fixAllResults || fixAllError) && (
                <div style={{ marginTop: 16, border: "1px solid #a78bfa", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "#ede9fe", borderBottom: "1px solid #a78bfa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5b21b6" }}>
                      ✨ AI Fixes — {fixAllResults ? `${fixAllResults.filter((r) => r.fix).length} of ${fixAllResults.length} succeeded` : ""}
                    </span>
                    <button type="button" onClick={() => { setFixAllResults(null); setFixAllError(null); }} style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer" }}>
                      Dismiss
                    </button>
                  </div>
                  {fixAllError && (
                    <div style={{ padding: "10px 14px", fontSize: 12, color: "#dc2626" }}>{fixAllError}</div>
                  )}
                  {fixAllResults && fixAllResults.map((r, i) => (
                    <div key={i} style={{ padding: "10px 14px", borderBottom: i < fixAllResults.length - 1 ? "1px solid #e9d5ff" : "none", background: "#faf5ff" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <div>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: r.error ? "#dc2626" : "#1e1b4b" }}>
                            {r.error ? "✗" : "✓"} {r.title}
                          </span>
                          <span style={{ fontSize: 10.5, color: "#94a3b8", marginLeft: 8 }}>{r.fileName}{r.line ? `:${r.line}` : ""}</span>
                        </div>
                        {r.fix && (
                          <button
                            type="button"
                            onClick={async () => {
                              const codeMatch = r.fix.match(/```[\w]*\n?([\s\S]*?)```/);
                              const text = codeMatch ? codeMatch[1].trim() : r.fix;
                              try { await navigator.clipboard.writeText(text); } catch {}
                            }}
                            style={{ fontSize: 10, padding: "3px 9px", borderRadius: 6, border: "1px solid #a78bfa", background: "#fff", color: "#7c3aed", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            Copy fix
                          </button>
                        )}
                      </div>
                      {r.error && <p style={{ margin: 0, fontSize: 11, color: "#dc2626" }}>{r.error}</p>}
                      {r.fix && (() => {
                        const explMatch = r.fix.match(/EXPLANATION:\s*(.+?)(?:\n|$)/i);
                        const codeMatch = r.fix.match(/```[\w]*\n?([\s\S]*?)```/);
                        const explanation = explMatch?.[1]?.trim();
                        const code = codeMatch?.[1]?.trim() ?? r.fix;
                        return (
                          <>
                            {explanation && <p style={{ margin: "4px 0 6px", fontSize: 11.5, color: "#5b21b6", fontStyle: "italic", lineHeight: 1.4 }}>{explanation}</p>}
                            <pre style={{ margin: 0, background: "#1e293b", color: "#86efac", border: "1px solid #334155", padding: "8px 10px", borderRadius: 6, fontSize: 10.5, overflowX: "auto", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.5 }}>{code}</pre>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
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
              onSettingsChange={() => setRuleSettings(loadRuleSettings(stackId))}
              aiSettings={aiSettings}
              loadedFiles={files}
              allFindings={allFindings}
              onAiFix={isAiConfigured(aiSettings) ? (ruleId) => {
                // Find the first finding for this rule and fix it
                const fi = allFindings.find(f => f.ruleId === ruleId);
                if (!fi) return;
                const srcFile = fileForFinding(fi);
                generateAiFix({ settings: aiSettings, fileContent: srcFile?.content || "", fileName: fi.sourcePath || fi.fileName || srcFile?.name || "", finding: fi });
              } : null}
              skippedRuleIds={skippedRuleIds}
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
                  {/* Findings-based roadmap: each finding is an actionable item with file + AI fix */}
                  {[
                    { label: "Immediate (Day 1)",   sev: "critical", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", num: 1 },
                    { label: "Short-term (Week 1)", sev: "warning",  color: "#d97706", bg: "#fffbeb", border: "#fcd34d", num: 2 },
                    { label: "Long-term (Month 1)", sev: "info",     color: "#16a34a", bg: "#f0fdf4", border: "#86efac", num: 3 },
                  ].map((ph) => {
                    const phFindings = allFindings.filter(f => f.severity === ph.sev);
                    if (!phFindings.length) return null;
                    const canAiFix = isAiConfigured(aiSettings);
                    return (
                      <div key={ph.sev} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 12, overflow: "hidden" }}>
                        {/* Phase header */}
                        <div style={{ background: ph.bg, borderBottom: `1px solid ${ph.border}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: ph.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{ph.num}</div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: ph.color }}>{ph.label}</div>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: ph.color, background: "white", padding: "2px 8px", borderRadius: 99, fontWeight: 600 }}>{phFindings.length} finding{phFindings.length !== 1 ? "s" : ""}</span>
                        </div>
                        {/* Finding rows */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {phFindings.map((fi, j) => {
                            const srcFile = fileForFinding(fi);
                            const shortName = (fi.sourcePath || fi.fileName || srcFile?.name || "").split(/[\\/]/).pop();
                            return (
                              <div key={j} style={{ padding: "10px 14px", borderBottom: j < phFindings.length - 1 ? "1px solid #f1f5f9" : "none", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                {/* Left: title + file + rule */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", marginBottom: 3 }}>{fi.title}</div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                    {shortName && (
                                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", fontFamily: "monospace" }}>
                                        📄 {shortName}
                                      </span>
                                    )}
                                    {fi.ruleId && (
                                      <code style={{ fontSize: 10, color: "#94a3b8" }}>{fi.ruleId}</code>
                                    )}
                                    {fi.line && (
                                      <span style={{ fontSize: 10, color: "#94a3b8" }}>line {fi.line}</span>
                                    )}
                                  </div>
                                  {fi.description && (
                                    <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 4, lineHeight: 1.4 }}>{fi.description}</div>
                                  )}
                                </div>
                                {/* Right: Go to file + AI fix buttons */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                                  {srcFile && (
                                    <button
                                      type="button"
                                      onClick={() => { setSelectedFile(srcFile); setActiveTab("overview"); }}
                                      style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0d9488", cursor: "pointer", whiteSpace: "nowrap" }}
                                      title={`View findings in ${shortName}`}
                                    >
                                      📄 Go to file
                                    </button>
                                  )}
                                  {canAiFix && (
                                    <button
                                      type="button"
                                      onClick={() => generateAiFix({ settings: aiSettings, fileContent: srcFile?.content || "", fileName: fi.sourcePath || fi.fileName || srcFile?.name || "", finding: fi })}
                                      style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: "1px solid #7c3aed", background: "#faf5ff", color: "#7c3aed", cursor: "pointer", whiteSpace: "nowrap" }}
                                      title="Generate AI fix for this finding"
                                    >
                                      🤖 AI Fix
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

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
        allFindings={allFindings}
        ruleSettings={ruleSettings}
        onAddFiles={() => setFileDropOpen(true)}
      />

      <AiSettingsModal open={settingsOpen} setupFromToggle={aiSetupFromToggle} initialProvider={settingsProvider} onClose={() => { setSettingsOpen(false); setAiSetupFromToggle(false); setSettingsProvider(null); }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
