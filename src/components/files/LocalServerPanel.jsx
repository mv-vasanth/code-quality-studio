import { useState, useEffect, useCallback } from "react";
import { detect, auditPath, recall, forget } from "../../services/localServerClient.js";
import AddonsPanel from "./AddonsPanel.jsx";

/**
 * Scan a directory through `cqz serve`.
 *
 * Only rendered when a companion is actually listening — offering a control
 * that cannot work is worse than not offering it. Everything stays available
 * without it; this is a shortcut past the file picker, not a requirement.
 */
export default function LocalServerPanel({ stackId, onResults, offline, fileCount = 0, onRunLocalAi }) {
  const [server, setServer] = useState(null);
  const [token, setToken] = useState(() => recall()?.token ?? "");
  // Served by `cqz serve`: the token came with the page, so there is nothing
  // to ask for. Showing an empty field the user cannot usefully fill is worse
  // than showing no field at all.
  const injected = Boolean(server?.injected);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  useEffect(() => {
    if (offline) return;                 // no server behind a static report
    let cancelled = false;
    detect().then((s) => {
      if (cancelled) return;
      setServer(s);
      if (s?.injected && s.token) setToken(s.token);
    });
    return () => { cancelled = true; };
  }, [offline]);

  const run = useCallback(async () => {
    setBusy(true); setError(null); setLastRun(null);
    try {
      const res = await auditPath(path || ".", token.trim(), { stack: stackId, port: server?.port });
      const stacks = res.stacks ?? [];
      const total = stacks.reduce((n, s) => n + s.files, 0);
      if (!total) {
        setError("No supported files found at that path.");
        return;
      }
      setLastRun({ total, stacks: stacks.map((s) => `${s.stack.icon} ${s.stack.name} (${s.files})`) });
      onResults?.(res);
    } catch (e) {
      setError(e.message);
      if (/token/i.test(e.message)) forget();
    } finally {
      setBusy(false);
    }
  }, [path, token, stackId, server, onResults]);

  if (offline || !server) return null;

  return (
    <div style={{
      border: "1px solid #bae6fd", background: "#f0f9ff", borderRadius: 10,
      padding: "10px 14px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span aria-hidden>🖥️</span>
        <strong style={{ fontSize: 12.5, color: "#075985" }}>
          {injected ? "Connected to this machine" : "Local server connected"}
        </strong>
        <span style={{ fontSize: 11, color: "#0369a1" }}>
          cqz {server.version} · port {server.port}
          {server.allowWrite ? " · writes enabled" : ""}
        </span>
      </div>
      <p style={{ fontSize: 11, color: "#0c4a6e", margin: "0 0 8px" }}>
        Scan a folder on disk instead of picking files. Paths are relative to
        where <code>cqz serve</code> was started ({server.cwd}).
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={path} onChange={(e) => setPath(e.target.value)}
          placeholder="./tests"
          style={{ flex: "1 1 180px", minWidth: 140, fontSize: 12, padding: "6px 8px",
                   border: "1px solid #7dd3fc", borderRadius: 6 }}
        />
        {!injected && (
          <input
            value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="token from `cqz serve`" type="password"
            style={{ flex: "1 1 180px", minWidth: 140, fontSize: 12, padding: "6px 8px",
                     border: "1px solid #7dd3fc", borderRadius: 6 }}
          />
        )}
        <button
          type="button" onClick={run} disabled={busy || !token.trim()}
          style={{ fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 7,
                   border: "1px solid #0284c7", background: busy ? "#bae6fd" : "#0284c7",
                   color: busy ? "#075985" : "#fff",
                   cursor: busy || !token.trim() ? "not-allowed" : "pointer" }}
        >
          {busy ? "Scanning…" : "Scan folder"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "#b91c1c" }}>{error}</div>
      )}
      {lastRun && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "#065f46" }}>
          Scanned {lastRun.total} file(s) — {lastRun.stacks.join(", ")}
        </div>
      )}

      {/* Optional extras this server can install. Shares the detected server
          and its token rather than probing again. */}
      <div style={{ marginTop: 10 }}>
        <AddonsPanel
          server={{ ...server, token: token.trim() || server?.token }}
          fileCount={fileCount}
          onRun={onRunLocalAi}
        />
      </div>
    </div>
  );
}
