import { useState, useRef, useEffect } from "react";
import { theme } from "../../shared/theme.js";
import { runLocalAnalysis } from "../../analyzers/index.js";
import { getRuleCatalog } from "../../rules/catalog.js";
import { isRuleEnabled } from "../../rules/ruleSettingsStorage.js";

const COLORS = {
  default: "#e2e8f0",
  muted: "#94a3b8",
  prompt: "#2dd4bf",
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  accent: "#7dd3fc",
  dim: "#475569",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let LINE_SEQ = 0;
const line = (text, tone = "default") => ({ id: `${Date.now()}-${LINE_SEQ++}`, text, tone });
const blank = () => line("", "muted");

// ── Argument parser ────────────────────────────────────────────────────────────
function parseArgs(raw) {
  const tokens = raw.trim().split(/\s+/);
  const [cmd, ...rest] = tokens;
  const flags = {};
  const positional = [];
  for (const t of rest) {
    const m = t.match(/^--([^=]+)(?:=(.+))?$/);
    if (m) flags[m[1]] = m[2] ?? true;
    else positional.push(t);
  }
  return { cmd: cmd?.toLowerCase(), flags, positional };
}

// ── Help text ─────────────────────────────────────────────────────────────────
const HELP_ALL = [
  line("─── File commands ───────────────────────────────────", "accent"),
  line("  ls [--scores]           list loaded files (add --scores for score column)", "muted"),
  line("  open                    open file picker to add files", "muted"),
  line("─── Analysis commands ───────────────────────────────", "accent"),
  line("  run                     scan all loaded files with rules engine", "muted"),
  line("  test <file>             scan a specific file (partial name ok)", "muted"),
  line("  score [<file>]          show score summary for all or one file", "muted"),
  line("  summary                 overall stats — files, avg, crits, warnings", "muted"),
  line("─── Findings commands ───────────────────────────────", "accent"),
  line("  findings                list all findings across loaded files", "muted"),
  line("  findings --sev=critical|warning|info   filter by severity", "muted"),
  line("  findings --file=<name>  findings for one file", "muted"),
  line("  findings --top=N        show top N by severity", "muted"),
  line("─── Rules commands ──────────────────────────────────", "accent"),
  line("  rules                   list all rules for the current stack", "muted"),
  line("  rules --disabled        show only disabled rules", "muted"),
  line("  rules --enabled         show only enabled rules", "muted"),
  line("  skipped                 rules skipped (prerequisite not met) across files", "muted"),
  line("─── Export / Util ───────────────────────────────────", "accent"),
  line("  export                  download all findings as report.json", "muted"),
  line("  clear                   clear terminal output", "muted"),
  line("  help [<command>]        show this help, or detail on one command", "muted"),
];

const HELP_CMD = {
  test: [
    line("test <file>", "accent"),
    line("  Scan a specific file using the rules engine.", "muted"),
    line("  Partial name match: 'test login' matches 'tests/login.spec.ts'", "muted"),
    line("  Example: test spec/cart", "dim"),
  ],
  findings: [
    line("findings [--sev=<level>] [--file=<name>] [--top=N]", "accent"),
    line("  List findings from the last analysis run.", "muted"),
    line("  --sev=critical|warning|info   filter by severity", "muted"),
    line("  --file=<partial>              filter to one file", "muted"),
    line("  --top=N                       show only the first N results", "muted"),
    line("  Example: findings --sev=critical --top=5", "dim"),
  ],
  rules: [
    line("rules [--enabled | --disabled]", "accent"),
    line("  List all rules for the current stack.", "muted"),
    line("  --enabled   show only active rules", "muted"),
    line("  --disabled  show only rules you've turned off", "muted"),
  ],
  score: [
    line("score [<partial-file-name>]", "accent"),
    line("  Show score + category breakdown.", "muted"),
    line("  No argument: all files. With argument: match one file.", "muted"),
    line("  Example: score login", "dim"),
  ],
  export: [
    line("export", "accent"),
    line("  Downloads all findings across loaded files as report.json.", "muted"),
  ],
};

// ── Score coloring ────────────────────────────────────────────────────────────
function scoreTone(s) {
  if (s >= 90) return "success";
  if (s >= 70) return "warning";
  return "danger";
}

function pad(str, n) {
  return String(str).padEnd(n, " ");
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StudioTerminal({
  files = [],
  stackId,
  onRunRules,
  allFindings = [],
  ruleSettings = {},
  onAddFiles,
}) {
  const [lines, setLines] = useState(() => [
    line(`Code Quality Studio  ·  cqs terminal  ·  stack: ${stackId}`, "accent"),
    line("Type 'help' for all commands, or 'run' to scan loaded files.", "muted"),
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const outRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [lines]);

  const push = (...ls) => setLines((prev) => [...prev, ...ls]);

  // ── run / scan ──────────────────────────────────────────────────────────────
  const runScan = async (targetFiles = null) => {
    if (busy) return;
    const batch = targetFiles ?? files;
    if (!batch.length) {
      push(line("no files loaded — use 'open' or add files via the header.", "warning"));
      return;
    }
    setBusy(true);
    if (!targetFiles) onRunRules?.();
    push(line(`$ cqs scan --stack=${stackId} --files=${batch.length}`, "prompt"));
    await wait(100);

    let scoreSum = 0, crit = 0, warn = 0, info = 0;
    for (const f of batch) {
      push(line(`  ▶ scanning ${f.name} …`, "dim"));
      await wait(120);
      const res = runLocalAnalysis(stackId, f.name, f.content ?? "");
      const fs = res.findings || [];
      const c = fs.filter((x) => x.severity === "critical").length;
      const w = fs.filter((x) => x.severity === "warning").length;
      const i = fs.filter((x) => x.severity === "info").length;
      scoreSum += res.overallScore ?? 0;
      crit += c; warn += w; info += i;
      const tone = c > 0 ? "danger" : w > 0 ? "warning" : "success";
      const mark = c > 0 ? "✗" : "✓";
      push(line(
        `  ${mark}  ${pad(f.name, 42)} score ${String(res.overallScore).padStart(3)}  ·  ${c}✗ ${w}! ${i}ℹ`,
        tone,
      ));
      await wait(50);
    }
    const avg = Math.round(scoreSum / batch.length);
    push(blank(), line(
      `  ── done  ${batch.length} file(s)  avg ${avg}  ·  ${crit}✗ critical  ${warn}! warning  ${info}ℹ info`,
      crit > 0 ? "danger" : "success",
    ));
    setBusy(false);
  };

  // ── test <file> ─────────────────────────────────────────────────────────────
  const runTest = async (positional) => {
    const query = positional.join(" ").toLowerCase();
    if (!query) { push(line("usage: test <partial-filename>", "warning")); return; }
    const match = files.filter((f) => f.name.toLowerCase().includes(query));
    if (!match.length) { push(line(`no file matching "${query}" — use 'ls' to see loaded files`, "danger")); return; }
    await runScan(match);
  };

  // ── score ───────────────────────────────────────────────────────────────────
  const cmdScore = (positional) => {
    const query = positional.join(" ").toLowerCase();
    const batch = query ? files.filter((f) => f.name.toLowerCase().includes(query)) : files;
    if (!batch.length) {
      push(query
        ? line(`no file matching "${query}"`, "danger")
        : line("no files loaded", "warning"));
      return;
    }
    push(blank(), line(`  ${pad("File", 42)} ${pad("Score", 7)} Findings`, "accent"));
    push(line(`  ${pad("─".repeat(41), 42)} ${pad("─────", 7)} ────────`, "dim"));
    let total = 0;
    for (const f of batch) {
      const res = f.resultLocal;
      if (!res) { push(line(`  ${pad(f.name, 42)} not analysed yet`, "muted")); continue; }
      const score = res.overallScore ?? "—";
      const fc = res.findings?.length ?? 0;
      const tone = typeof score === "number" ? scoreTone(score) : "muted";
      total += typeof score === "number" ? score : 0;
      push(line(`  ${pad(f.name, 42)} ${String(score).padStart(5)}   ${fc} finding${fc !== 1 ? "s" : ""}`, tone));
    }
    const analysed = batch.filter((f) => f.resultLocal).length;
    if (analysed > 1) {
      const avg = Math.round(total / analysed);
      push(line(`  ${pad("─".repeat(41), 42)} ${pad("─────", 7)} ────────`, "dim"));
      push(line(`  ${pad("Average", 42)} ${String(avg).padStart(5)}`, scoreTone(avg)));
    }
    push(blank());
  };

  // ── summary ─────────────────────────────────────────────────────────────────
  const cmdSummary = () => {
    if (!files.length) { push(line("no files loaded", "warning")); return; }
    const analysed = files.filter((f) => f.resultLocal);
    const scores = analysed.map((f) => f.resultLocal.overallScore ?? 0);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const crit = allFindings.filter((f) => f.severity === "critical").length;
    const warn = allFindings.filter((f) => f.severity === "warning").length;
    const inf  = allFindings.filter((f) => f.severity === "info").length;
    push(
      blank(),
      line("  Summary", "accent"),
      line(`  Files loaded    : ${files.length} (${analysed.length} analysed)`, "default"),
      avg != null
        ? line(`  Average score   : ${avg}`, scoreTone(avg))
        : line("  Average score   : —", "muted"),
      line(`  Total findings  : ${allFindings.length}`, allFindings.length ? "default" : "muted"),
      line(`    ✗ Critical    : ${crit}`, crit > 0 ? "danger" : "muted"),
      line(`    ! Warning     : ${warn}`, warn > 0 ? "warning" : "muted"),
      line(`    ℹ Info        : ${inf}`, "muted"),
      blank(),
    );
  };

  // ── findings ─────────────────────────────────────────────────────────────────
  const cmdFindings = (flags) => {
    let list = [...allFindings];
    if (!list.length) { push(line("no findings — run analysis first", "muted")); return; }

    if (flags.sev)  list = list.filter((f) => f.severity === flags.sev);
    if (flags.file) list = list.filter((f) => (f.file ?? f.filename ?? "").toLowerCase().includes(flags.file.toLowerCase()));
    if (flags.top)  list = list.slice(0, parseInt(flags.top, 10) || 10);

    if (!list.length) { push(line("no findings match those filters", "muted")); return; }

    push(blank(), line(`  ${list.length} finding${list.length !== 1 ? "s" : ""}`, "accent"));
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    list.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));
    for (const f of list) {
      const tone = f.severity === "critical" ? "danger" : f.severity === "warning" ? "warning" : "muted";
      const mark = f.severity === "critical" ? "✗" : f.severity === "warning" ? "!" : "ℹ";
      const file = (f.file ?? f.filename ?? "—").split(/[\\/]/).pop();
      push(line(`  [${mark}] ${f.ruleId ?? "—"}  ${f.title ?? f.message ?? ""}`, tone));
      if (file) push(line(`       in ${file}${f.line ? `:${f.line}` : ""}`, "dim"));
    }
    push(blank());
  };

  // ── rules ────────────────────────────────────────────────────────────────────
  const cmdRules = (flags) => {
    const catalog = getRuleCatalog(stackId);
    let list = catalog;
    if (flags.disabled) list = list.filter((r) => !isRuleEnabled(stackId, r.ruleId, ruleSettings));
    else if (flags.enabled) list = list.filter((r) => isRuleEnabled(stackId, r.ruleId, ruleSettings));
    const enabledCount = catalog.filter((r) => isRuleEnabled(stackId, r.ruleId, ruleSettings)).length;
    push(blank(), line(`  ${enabledCount}/${catalog.length} rules enabled  ·  showing ${list.length}`, "accent"));
    for (const r of list) {
      const on = isRuleEnabled(stackId, r.ruleId, ruleSettings);
      const tone = on ? "default" : "dim";
      const mark = on ? "●" : "○";
      push(line(`  ${mark}  ${pad(r.ruleId, 20)} ${r.title ?? ""}`, tone));
    }
    push(blank());
  };

  // ── skipped ──────────────────────────────────────────────────────────────────
  const cmdSkipped = () => {
    const skippedMap = {};
    for (const f of files) {
      for (const s of (f.resultLocal?.skippedRules ?? [])) {
        if (!skippedMap[s.ruleId]) skippedMap[s.ruleId] = { reason: s.reason, files: [] };
        skippedMap[s.ruleId].files.push(f.name);
      }
    }
    const entries = Object.entries(skippedMap);
    if (!entries.length) { push(line("no skipped rules — all applicable rules ran", "success")); return; }
    push(blank(), line(`  ${entries.length} rule${entries.length !== 1 ? "s" : ""} skipped`, "accent"));
    for (const [ruleId, { reason, files: flist }] of entries) {
      push(line(`  ⏭  ${ruleId}`, "muted"));
      push(line(`       reason: ${reason}`, "dim"));
      push(line(`       in: ${flist.join(", ")}`, "dim"));
    }
    push(blank());
  };

  // ── ls ───────────────────────────────────────────────────────────────────────
  const cmdLs = (flags) => {
    if (!files.length) { push(line("(no files loaded — use 'open')", "muted")); return; }
    push(blank());
    for (const f of files) {
      if (flags.scores && f.resultLocal) {
        const s = f.resultLocal.overallScore ?? "—";
        push(line(`  ${String(s).padStart(3)}  ${f.name}`, typeof s === "number" ? scoreTone(s) : "muted"));
      } else {
        push(line(`  ${f.name}`, "default"));
      }
    }
    push(line(`  (${files.length} file${files.length !== 1 ? "s" : ""})`, "dim"), blank());
  };

  // ── export ────────────────────────────────────────────────────────────────────
  const cmdExport = () => {
    if (!allFindings.length) { push(line("no findings to export — run analysis first", "warning")); return; }
    const payload = {
      exported: new Date().toISOString(),
      stack: stackId,
      fileCount: files.length,
      totalFindings: allFindings.length,
      findings: allFindings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cqs-report-${stackId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    push(line(`  ✓ downloaded cqs-report-${stackId}.json  (${allFindings.length} findings)`, "success"));
  };

  // ── command dispatcher ────────────────────────────────────────────────────────
  const handle = async (raw) => {
    const { cmd, flags, positional } = parseArgs(raw);
    push(line(`❯ ${raw}`, "prompt"));
    if (!cmd) return;
    setHistory((h) => [...h, raw]);
    setHistIdx(-1);

    switch (cmd) {
      case "run":
      case "scan":
        await runScan();
        break;
      case "test":
        await runTest(positional);
        break;
      case "score":
      case "scores":
        cmdScore(positional);
        break;
      case "summary":
        cmdSummary();
        break;
      case "findings":
      case "issues":
        cmdFindings(flags);
        break;
      case "rules":
        cmdRules(flags);
        break;
      case "skipped":
        cmdSkipped();
        break;
      case "ls":
      case "list":
        cmdLs(flags);
        break;
      case "open":
        onAddFiles?.();
        push(line("  opening file picker…", "muted"));
        break;
      case "export":
        cmdExport();
        break;
      case "clear":
        setLines([]);
        break;
      case "help": {
        const topic = positional[0]?.toLowerCase();
        if (topic && HELP_CMD[topic]) push(...HELP_CMD[topic]);
        else push(...HELP_ALL);
        break;
      }
      default:
        push(line(`command not found: ${cmd}  —  type 'help' to see all commands`, "danger"));
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      const v = input;
      setInput("");
      handle(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const idx = histIdx + 1;
      if (idx >= history.length) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(idx); setInput(history[idx]); }
    } else if (e.key === "Tab") {
      // basic tab-complete: file names
      e.preventDefault();
      const parts = input.split(/\s+/);
      if (parts.length >= 2) {
        const partial = parts[parts.length - 1].toLowerCase();
        const match = files.find((f) => f.name.toLowerCase().includes(partial));
        if (match) setInput(parts.slice(0, -1).join(" ") + " " + match.name);
      }
    }
  };

  return (
    <div
      style={{
        background: "#0b1220",
        border: "1px solid #1e293b",
        borderRadius: theme.radius.lg,
        overflow: "hidden",
        boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
        fontFamily: theme.fontMono,
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "#111827", borderBottom: "1px solid #1e293b" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: "#94a3b8" }}>
          cqs — rules terminal · {files.length} file{files.length !== 1 ? "s" : ""} loaded
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); runScan(); }}
          style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: "1px solid #334155", background: busy ? "#1e293b" : "#0d9488", color: "#fff", cursor: busy ? "not-allowed" : "pointer" }}
        >
          {busy ? "running…" : "▶ Run scan"}
        </button>
      </div>

      {/* output */}
      <div ref={outRef} style={{ height: 260, overflowY: "auto", padding: "10px 12px", fontSize: 12, lineHeight: 1.6 }}>
        {lines.map((l) => (
          <div key={l.id} style={{ color: COLORS[l.tone] || COLORS.default, whiteSpace: "pre-wrap" }}>
            {l.text}
          </div>
        ))}
      </div>

      {/* input */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid #1e293b" }}>
        <span style={{ color: COLORS.prompt, fontSize: 13 }}>❯</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          autoFocus
          spellCheck={false}
          placeholder={busy ? "running…" : "help"}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontFamily: theme.fontMono, fontSize: 12 }}
        />
      </div>
    </div>
  );
}
