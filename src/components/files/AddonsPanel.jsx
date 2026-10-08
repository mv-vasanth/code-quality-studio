import { useState, useEffect, useCallback } from "react";
import { theme } from "../../shared/theme.js";
import { elevation, fx } from "../../shared/motion.js";
import {
  listAddons, installAddon, removeAddon, enableAddon, disableAddon, unloadAddonModel,
} from "../../services/localServerClient.js";

/**
 * Optional extras, as a switch.
 *
 * The local AI is a separate package so that it cannot break the audit CLI —
 * but "separate package" should not become "read a README and run npm
 * yourself". The companion installs it into ~/.cqs/addons on request and can
 * take it away again.
 *
 * What it costs is on the card *before* you press anything. An install that
 * turns out to be 200 MB after you agreed to it is how people learn not to
 * trust a button.
 */
export default function AddonsPanel({ server, fileCount = 0, onRun }) {
  const [addons, setAddons] = useState([]);
  const [busy, setBusy] = useState(null);     // id currently working
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [progress, setProgress] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const refresh = useCallback(async () => {
    try { setAddons(await listAddons({ token: server?.token, port: server?.port })); }
    catch (e) { setError(e.message); }
  }, [server]);

  useEffect(() => {
    if (!server?.addons) return;
    let cancelled = false;
    listAddons({ token: server.token, port: server.port })
      .then((a) => { if (!cancelled) setAddons(a); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [server]);

  const run = useCallback(async (id, fn) => {
    setBusy(id); setError(null); setConfirming(null);
    try { await fn(); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }, [refresh]);

  // Nothing to show if the server is too old to have add-ons, or has none.
  if (!server?.addons || !addons.length) return null;

  const opts = { token: server.token, port: server.port };

  return (
    <div style={{
      marginBottom: 10, padding: "9px 10px", borderRadius: 10,
      background: "#faf5ff", border: "1px solid #e9d5ff",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.6)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <span aria-hidden>🧩</span>
        <strong style={{ fontSize: 11.5, color: "#6b21a8" }}>Add-ons</strong>
        <span
          title="Installed into ~/.cqs/addons by the local server. Nothing is installed globally, and removing one deletes that directory."
          style={{ marginLeft: "auto", cursor: "help", color: theme.color.textMuted, fontSize: 11 }}
        >ⓘ</span>
      </div>

      {addons.map((a) => {
        const working = busy === a.id;
        const confirm = confirming === a.id;
        return (
          <div key={a.id} className={fx.card} style={{
            background: theme.color.surface,
            border: `1px solid ${a.running ? "#c4b5fd" : theme.color.border}`,
            borderRadius: 8, padding: "8px 9px", marginBottom: 6,
            boxShadow: a.running ? elevation.raised : elevation.flat,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: a.running ? "#8b5cf6" : a.installed ? "#cbd5e1" : "transparent",
                border: a.installed ? "none" : `1px solid ${theme.color.borderStrong}`,
              }} />
              <strong style={{ fontSize: 11.5, color: theme.color.text }}>{a.label}</strong>
              {a.version && (
                <span style={{ fontSize: 9.5, color: theme.color.textMuted, fontFamily: theme.fontMono }}>
                  v{a.version}
                </span>
              )}
              <span style={{
                marginLeft: "auto", fontSize: 9.5, fontWeight: 700,
                color: a.running ? "#6d28d9" : theme.color.textMuted,
              }}>
                {a.running
                  ? (a.modelLoaded ? "MODEL LOADED" : "READY")
                  : a.installed ? "STOPPED" : "NOT INSTALLED"}
              </span>
            </div>

            <p style={{ margin: "5px 0 6px", fontSize: 10.5, color: theme.color.textSecondary, lineHeight: 1.45 }}>
              {a.blurb}
            </p>

            {/* The price, before the button — not after. */}
            {!a.installed && (
              <p style={{ margin: "0 0 7px", fontSize: 10, color: theme.color.textMuted }}>
                Downloads {a.installSize}. Model weights {a.modelSize}.
              </p>
            )}

            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {!a.installed && (
                <button
                  type="button" disabled={working}
                  onClick={() => run(a.id, () => installAddon(a.id, opts))}
                  className={`${fx.card} ${working ? fx.ring : fx.lift} ${fx.press}`}
                  style={primaryBtn(working)}
                >
                  {working ? "Installing…" : "＋ Install"}
                </button>
              )}

              {a.installed && (
                <button
                  type="button" disabled={working}
                  onClick={() => run(a.id, () => (a.running ? disableAddon : enableAddon)(a.id, opts))}
                  className={`${fx.card} ${fx.lift} ${fx.press}`}
                  style={{
                    ...ghostBtn,
                    borderColor: a.running ? "#c4b5fd" : theme.color.border,
                    color: a.running ? "#6d28d9" : theme.color.textSecondary,
                  }}
                  title={a.running
                    ? "Stop the add-on. This also releases the model's memory."
                    : "Start the add-on. The model loads on the first request."}
                >
                  {working ? "…" : a.running ? "⏸ Stop" : "▶ Start"}
                </button>
              )}

              {/* The point of installing it. Only offered once it can
                  actually run, and only when there is something to run on. */}
              {a.running && onRun && fileCount > 0 && (
                <button
                  type="button" disabled={working}
                  onClick={() => run(a.id, async () => {
                    setProgress({ done: 0, total: fileCount });
                    setLastRun(null);
                    try {
                      setLastRun(await onRun({
                        token: server?.token, port: server?.port,
                        onProgress: (done, total) => setProgress({ done, total }),
                      }));
                    } finally { setProgress(null); }
                  })}
                  title={`Run the offline model over the ${fileCount} loaded file(s)`}
                  className={`${fx.card} ${working ? fx.ring : fx.lift} ${fx.press}`}
                  style={primaryBtn(working)}
                >
                  {progress
                    ? `Analysing ${progress.done}/${progress.total}…`
                    : `▶ Run on ${fileCount} file${fileCount === 1 ? "" : "s"}`}
                </button>
              )}

              {/* Only while a model is actually resident. Stopping the add-on
                  frees it too, so this is for keeping the add-on and taking
                  the memory back. */}
              {a.running && a.modelLoaded && (
                <button
                  type="button" disabled={working}
                  onClick={() => run(a.id, () => unloadAddonModel(a.id, opts))}
                  title="Release the model's memory now. It reloads on the next request."
                  className={`${fx.card} ${fx.lift} ${fx.press}`}
                  style={{ ...ghostBtn, borderColor: "#fcd34d", color: "#b45309" }}
                >
                  ⏏ Free memory
                </button>
              )}

              {a.installed && !confirm && (
                <button
                  type="button" disabled={working}
                  onClick={() => setConfirming(a.id)}
                  className={`${fx.card} ${fx.lift} ${fx.press}`}
                  style={{ ...ghostBtn, color: theme.color.danger, borderColor: theme.color.dangerBorder }}
                >
                  Remove
                </button>
              )}

              {confirm && (
                <>
                  <button
                    type="button"
                    onClick={() => run(a.id, () => removeAddon(a.id, { ...opts, purgeModels: false }))}
                    style={{ ...ghostBtn, color: theme.color.danger, borderColor: theme.color.dangerBorder }}
                  >
                    Remove, keep model
                  </button>
                  <button
                    type="button"
                    onClick={() => run(a.id, () => removeAddon(a.id, { ...opts, purgeModels: true }))}
                    title="Also deletes the downloaded weights — re-installing will download them again"
                    style={{ ...ghostBtn, color: theme.color.danger, borderColor: theme.color.dangerBorder }}
                  >
                    Remove everything
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} style={ghostBtn}>Cancel</button>
                </>
              )}
            </div>

            {progress && (
              <p className={fx.fadeUp} style={{ margin: "6px 0 0", fontSize: 10, color: theme.color.textMuted }}>
                Results appear under the <strong>Local AI</strong> view in the results bar.
              </p>
            )}

            {lastRun && !progress && (
              <div className={fx.fadeUp} style={{ margin: "7px 0 0", fontSize: 10.5, color: theme.color.textSecondary, lineHeight: 1.5 }}>
                {lastRun.found > 0 ? (
                  <>Found <strong>{lastRun.found}</strong> thing{lastRun.found === 1 ? "" : "s"} across{" "}
                    {lastRun.analysed} file{lastRun.analysed === 1 ? "" : "s"} — see the <strong>Local AI</strong> view.</>
                ) : lastRun.analysed > 0 ? (
                  <>Looked at {lastRun.analysed} file{lastRun.analysed === 1 ? "" : "s"} and found nothing to add.</>
                ) : (
                  // The common case on a real suite, and the one that looks
                  // like a failure if nobody says what happened.
                  <>Skipped all {lastRun.skipped} file{lastRun.skipped === 1 ? "" : "s"}: the standard rules
                    already flagged them, so there was nothing for the model to judge. Fix those first.</>
                )}
                {lastRun.failed > 0 && (
                  <span style={{ color: theme.color.danger }}> · {lastRun.failed} failed</span>
                )}
              </div>
            )}

            {working && (
              <div className={fx.shimmer} style={{
                height: 3, borderRadius: 2, marginTop: 7,
                background: "#ede9fe",
              }} />
            )}
          </div>
        );
      })}

      {error && (
        <div className={fx.fadeUp} style={{ fontSize: 10.5, color: theme.color.danger, whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}
    </div>
  );
}

const ghostBtn = {
  fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 6,
  border: `1px solid ${theme.color.border}`, background: theme.color.surface,
  color: theme.color.textSecondary, cursor: "pointer", whiteSpace: "nowrap",
};

const primaryBtn = (busy) => ({
  ...ghostBtn,
  fontWeight: 700,
  border: "1px solid #a78bfa",
  background: busy ? "#ede9fe" : "linear-gradient(180deg,#8b5cf6,#7c3aed)",
  color: busy ? "#6d28d9" : "#fff",
  cursor: busy ? "progress" : "pointer",
});
