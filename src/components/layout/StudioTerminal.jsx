import { useState, useRef, useEffect } from "react";
import { theme } from "../../shared/theme.js";
import { runLocalAnalysis } from "../../analyzers/index.js";

const COLORS = {
  default: "#e2e8f0",
  muted: "#94a3b8",
  prompt: "#2dd4bf",
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  accent: "#7dd3fc",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let LINE_SEQ = 0;
const line = (text, tone = "default") => ({ id: `${Date.now()}-${LINE_SEQ++}`, text, tone });

const HELP = [
  line("Available commands:", "accent"),
  line("  run, scan   run the standard rules on all loaded files", "muted"),
  line("  ls          list loaded files", "muted"),
  line("  clear       clear the terminal", "muted"),
  line("  help        show this help", "muted"),
];

/**
 * A small terminal that runs the local rule engine on the loaded files and streams
 * the results — giving a real "executed on the code" feel from the footer.
 */
export default function StudioTerminal({ files = [], stackId, onRunRules }) {
  const [lines, setLines] = useState(() => [
    line(`Code Quality Studio — rules terminal (stack: ${stackId})`, "accent"),
    line("Type 'run' to scan loaded files, or 'help' for commands.", "muted"),
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

  const runScan = async () => {
    if (busy) return;
    if (!files.length) {
      push(line("no files loaded — add files or a folder first.", "warning"));
      return;
    }
    setBusy(true);
    onRunRules?.(); // keep the app's Findings/scores in sync with the terminal run
    push(line(`$ pqs scan --stack=${stackId} --files=${files.length}`, "prompt"));
    await wait(120);

    let scoreSum = 0;
    let crit = 0;
    let warn = 0;
    let info = 0;
    for (const f of files) {
      push(line(`▶ scanning ${f.name} …`, "muted"));
      await wait(140);
      const res = runLocalAnalysis(stackId, f.name, f.content ?? "");
      const fs = res.findings || [];
      const c = fs.filter((x) => x.severity === "critical").length;
      const w = fs.filter((x) => x.severity === "warning").length;
      const i = fs.filter((x) => x.severity === "info").length;
      scoreSum += res.overallScore ?? 0;
      crit += c;
      warn += w;
      info += i;
      const tone = c > 0 ? "danger" : w > 0 ? "warning" : "success";
      const mark = c > 0 ? "✗" : "✓";
      push(
        line(
          `${mark} ${f.name}  score ${res.overallScore}  ·  ${fs.length} findings (${c} critical, ${w} warning, ${i} info)`,
          tone,
        ),
      );
      await wait(60);
    }

    const avg = Math.round(scoreSum / files.length);
    push(
      line(
        `── done · ${files.length} file(s) · avg ${avg} · ${crit} critical, ${warn} warning, ${info} info`,
        crit > 0 ? "danger" : "success",
      ),
    );
    setBusy(false);
  };

  const handle = async (raw) => {
    const cmd = raw.trim();
    push(line(`❯ ${cmd}`, "prompt"));
    if (!cmd) return;
    setHistory((h) => [...h, cmd]);
    setHistIdx(-1);

    const [name] = cmd.toLowerCase().split(/\s+/);
    switch (name) {
      case "run":
      case "scan":
        await runScan();
        break;
      case "ls":
        if (!files.length) push(line("(no files loaded)", "muted"));
        else files.forEach((f) => push(line(`  ${f.name}`, "default")));
        break;
      case "clear":
        setLines([]);
        break;
      case "help":
        push(...HELP);
        break;
      default:
        push(line(`command not found: ${name} — type 'help'`, "danger"));
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
      if (idx >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
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
        <span style={{ marginLeft: 8, fontSize: 11, color: "#94a3b8" }}>pqs — rules terminal</span>
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
      <div ref={outRef} style={{ height: 240, overflowY: "auto", padding: "10px 12px", fontSize: 12, lineHeight: 1.55 }}>
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
          placeholder={busy ? "running…" : "run"}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontFamily: theme.fontMono, fontSize: 12 }}
        />
      </div>
    </div>
  );
}
