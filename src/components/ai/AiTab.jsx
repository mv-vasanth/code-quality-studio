import { useState, useEffect, useCallback } from "react";
import { listModels, switchModel, installModel, removeModel, unloadAddonModel, recall } from "../../services/localServerClient.js";
import AddonsPanel from "../files/AddonsPanel.jsx";

const S = {
  teal: "#0d9488", tealBg: "#f0fdfa", tealBorder: "#99f6e4",
  amber: "#b45309", amberBg: "#fffbeb", amberBorder: "#fde68a",
  red:   "#dc2626", redBg:   "#fef2f2", redBorder:   "#fecaca",
  gray:  "#6b7280", grayBg:  "#f9fafb", grayBorder:  "#e5e7eb",
  blue:  "#2563eb", blueBg:  "#eff6ff", blueBorder:  "#bfdbfe",
  text:  "#111827", muted:   "#6b7280", border: "#e5e7eb", white: "#fff",
};

const STATIC_MODELS = [
  { id: "deberta-xsmall", name: "CQZ Precision",  techName: "DeBERTa v3 xsmall",  hf: "Xenova/nli-deberta-v3-xsmall",            size: "104 MB", approach: "nli",        note: "Best accuracy — recommended for thorough audits",    default: true },
  { id: "distilbert",     name: "CQZ Balanced",   techName: "DistilBERT MNLI",    hf: "Xenova/distilbert-base-uncased-mnli",     size: "67 MB",  approach: "nli",        note: "Good accuracy at a smaller footprint" },
  { id: "mobilebert",     name: "CQZ Lite",       techName: "MobileBERT MNLI",    hf: "Xenova/mobilebert-uncased-mnli",          size: "28 MB",  approach: "nli",        note: "Smallest NLI option — fast on low-memory machines" },
  { id: "minilm",         name: "CQZ Swift",      techName: "MiniLM L6",          hf: "Xenova/all-MiniLM-L6-v2",                size: "23 MB",  approach: "embeddings", note: "Fastest — embedding-based, great for quick scans" },
];

function Tag({ children, color = S.gray, bg = S.grayBg, border = S.grayBorder }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
      color, background: bg, border: `1px solid ${border}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function StatusBar({ online, loaded, model, cacheDir }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 8, background: online ? S.tealBg : S.grayBg,
      border: `1px solid ${online ? S.tealBorder : S.grayBorder}`,
      fontSize: 13, marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: online ? S.teal : S.gray, display: "inline-block" }} />
        <span style={{ fontWeight: 600, color: online ? S.teal : S.gray }}>
          {online ? "cqz-ai running" : "cqz-ai offline"}
        </span>
      </div>
      {online && (
        <>
          <span style={{ color: S.grayBorder }}>|</span>
          <span style={{ color: S.muted }}>
            Model: <strong style={{ color: S.text }}>{model ?? "—"}</strong>
          </span>
          <span style={{ color: S.grayBorder }}>|</span>
          <span style={{ color: S.muted }}>
            Worker: <Tag color={loaded ? "#059669" : S.gray}
              bg={loaded ? "#f0fdf4" : S.grayBg}
              border={loaded ? "#a7f3d0" : S.grayBorder}>
              {loaded ? "loaded" : "idle"}
            </Tag>
          </span>
          {cacheDir && (
            <>
              <span style={{ color: S.grayBorder }}>|</span>
              <span style={{ fontSize: 11, color: S.muted, fontFamily: "monospace" }}>{cacheDir}</span>
            </>
          )}
        </>
      )}
      {!online && (
        <>
          <span style={{ color: S.grayBorder }}>|</span>
          <span style={{ fontSize: 12, color: S.muted }}>
            Start it: <code style={{ fontFamily: "monospace", fontSize: 11 }}>cqz-ai serve</code>
            {" "}(auto-starts with <code style={{ fontFamily: "monospace", fontSize: 11 }}>cqz serve</code>)
          </span>
        </>
      )}
    </div>
  );
}

function ModelCard({ model, online, busy, onUse, onInstall, onRemove }) {
  const isActive  = model.active;
  const installed = model.installed;
  const isBusy    = busy === model.id;
  const offline   = !online;

  return (
    <div style={{
      border: `1.5px solid ${isActive ? S.teal : S.border}`,
      borderRadius: 10, padding: "14px 16px",
      background: isActive ? S.tealBg : S.white,
      display: "flex", flexDirection: "column", gap: 10,
      opacity: isBusy ? 0.65 : 1, transition: "opacity 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: isActive ? S.teal : S.text }}>
            {model.name}
          </div>
          {model.techName && (
            <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{model.techName}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <Tag>{model.size}</Tag>
          <Tag color={model.approach === "embeddings" ? S.blue : S.amber}
               bg={model.approach === "embeddings" ? S.blueBg : S.amberBg}
               border={model.approach === "embeddings" ? S.blueBorder : S.amberBorder}>
            {model.approach}
          </Tag>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {isActive && <Tag color={S.teal} bg={S.tealBg} border={S.tealBorder}>▶ active</Tag>}
        {model.default && <Tag>default</Tag>}
        {online ? (
          installed
            ? <Tag color="#059669" bg="#f0fdf4" border="#a7f3d0">installed</Tag>
            : <Tag>not downloaded</Tag>
        ) : (
          <Tag color={S.gray}>status unknown</Tag>
        )}
      </div>

      {online && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!isActive && (
            <button onClick={() => onUse(model.id)} disabled={isBusy}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6,
                border: `1px solid ${S.teal}`, background: S.white,
                color: S.teal, cursor: "pointer", fontWeight: 600 }}>
              {isBusy ? "Switching…" : "Use this"}
            </button>
          )}
          {!installed && (
            <button onClick={() => onInstall(model.id)} disabled={isBusy}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6,
                border: `1px solid ${S.border}`, background: S.grayBg,
                color: S.text, cursor: "pointer" }}>
              {isBusy ? "Downloading…" : `Download (${model.size})`}
            </button>
          )}
          {installed && !isActive && (
            <button onClick={() => onRemove(model.id)} disabled={isBusy}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6,
                border: `1px solid ${S.redBorder}`, background: S.redBg,
                color: S.red, cursor: "pointer" }}>
              {isBusy ? "Removing…" : "Remove"}
            </button>
          )}
          {isActive && installed && (
            <span style={{ fontSize: 12, color: S.muted, padding: "5px 0" }}>
              Ready — switch using a different card above
            </span>
          )}
        </div>
      )}

      {offline && (
        <div style={{ fontSize: 11, color: S.muted }}>Start cqz-ai to manage</div>
      )}
    </div>
  );
}

function AiFindings({ findings }) {
  if (!findings?.length) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 2rem", color: S.muted, fontSize: 14,
        background: S.white, borderRadius: 10, border: `1px solid ${S.border}` }}>
        No AI findings yet. Run an audit with the Local AI add-on enabled.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {findings.map((f, i) => {
        const sevColor = f.severity === "critical" ? S.red : f.severity === "warning" ? S.amber : S.blue;
        const sevBg    = f.severity === "critical" ? S.redBg : f.severity === "warning" ? S.amberBg : S.blueBg;
        const sevBord  = f.severity === "critical" ? S.redBorder : f.severity === "warning" ? S.amberBorder : S.blueBorder;
        return (
          <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px",
            border: `1px solid ${S.border}`, borderRadius: 8, background: S.white,
            alignItems: "flex-start" }}>
            <Tag color={sevColor} bg={sevBg} border={sevBord}>
              {f.severity?.toUpperCase()}
            </Tag>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.title ?? f.ruleId}</div>
              <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>
                {f.sourcePath ?? f.fileName}{f.line ? `:${f.line}` : ""}
              </div>
              {f.description && (
                <div style={{ fontSize: 12, color: S.muted, marginTop: 4, lineHeight: 1.5 }}>
                  {f.description}
                </div>
              )}
            </div>
            {f.confidence != null && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>
                  {Math.round(f.confidence * 100)}%
                </div>
                <div style={{ fontSize: 10, color: S.muted }}>confidence</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CLOUD_PROVIDERS = [
  { id: "claude",   name: "Claude",          vendor: "Anthropic",  icon: "⚡", description: "Most accurate analysis — Claude 3.5/3 Sonnet via Anthropic API",              color: "#c77a30", bg: "#fef9f0", border: "#fde8c0" },
  { id: "openai",   name: "OpenAI / GPT",    vendor: "OpenAI",     icon: "🟢", description: "GPT-4o, GPT-4-turbo — configure your OpenAI API key to enable",               color: "#059669", bg: "#f0fdf4", border: "#a7f3d0" },
  { id: "gemini",   name: "Gemini",          vendor: "Google",     icon: "💎", description: "Google Gemini Pro / Ultra — configure your Google API key to enable",          color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  { id: "bedrock",  name: "AWS Bedrock",     vendor: "Amazon",     icon: "☁️", description: "Claude, Llama, Titan via AWS — uses your existing AWS credentials",            color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
];

export default function AiTab({ serverConn, aiResults = [], fileCount = 0, onRunLocalAi }) {
  const [models, setModels]       = useState(null);
  const [health, setHealth]       = useState(null);
  const [online, setOnline]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(null);
  const [toast, setToast]         = useState(null);
  const [subTab, setSubTab]       = useState("addons");

  const opts = useCallback(() => {
    const s = recall() ?? serverConn ?? {};
    return { port: s.port, token: s.token };
  }, [serverConn]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async () => {
    setLoading(true);

    // AI model list (requires cqz-ai running)
    try {
      const data = await listModels(opts());
      setModels(data.models ?? []);
      setOnline(true);
    } catch {
      setModels(STATIC_MODELS.map((m, i) => ({ ...m, installed: false, active: i === 0 })));
      setOnline(false);
    }

    // Health from cqz-ai directly
    try {
      const h = await fetch("http://127.0.0.1:4100/health").then(r => r.json());
      setHealth(h);
    } catch { setHealth(null); }

    setLoading(false);
  }, [opts]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUse = async (id) => {
    setBusy(id);
    try {
      const res = await switchModel(id, opts());
      if (!res.ok) throw new Error(res.error ?? "Failed to switch model");
      showToast(`Switched to ${res.model?.name ?? id}`);
      await refresh();
    } catch (e) { showToast(e.message, false); }
    finally { setBusy(null); }
  };

  const handleInstallModel = async (id) => {
    setBusy(id);
    showToast("Downloading… this may take a minute");
    try {
      const res = await installModel(id, opts());
      if (!res.ok) throw new Error(res.error ?? "Download failed");
      showToast(res.already ? "Already installed" : `Downloaded ${res.model?.name ?? id}`);
      await refresh();
    } catch (e) { showToast(e.message, false); }
    finally { setBusy(null); }
  };

  const handleRemoveModel = async (id) => {
    setBusy(id);
    try {
      const res = await removeModel(id, opts());
      if (!res.ok) throw new Error(res.error ?? "Remove failed");
      showToast(res.removed ? "Model removed from cache" : "Model was not installed");
      await refresh();
    } catch (e) { showToast(e.message, false); }
    finally { setBusy(null); }
  };

  const handleUnload = async () => {
    setBusy("unload");
    try {
      await unloadAddonModel("cqz-ai", opts());
      showToast("Model unloaded — memory freed");
      await refresh();
    } catch (e) { showToast(e.message, false); }
    finally { setBusy(null); }
  };


  const allAiFindings = aiResults.flatMap(r => r?.findings ?? [])
    .filter(f => f.source === "local-model");

  const displayModels = models ?? STATIC_MODELS.map((m, i) => ({
    ...m, installed: false, active: i === 0,
  }));

  const installedCount = displayModels.filter(m => m.installed).length;
  const activeModel    = displayModels.find(m => m.active);

  const tabs = [
    { id: "addons",   label: "Add-ons" },
    { id: "models",   label: "Models" },
    { id: "findings", label: `AI findings (${allAiFindings.length})` },
  ];

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "sticky", top: 0, zIndex: 10, marginBottom: 14,
          padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
          color: toast.ok ? "#065f46" : S.red,
          background: toast.ok ? "#d1fae5" : S.redBg,
          border: `1px solid ${toast.ok ? "#6ee7b7" : S.redBorder}` }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: S.text }}>
            <span style={{ color: S.teal }}>◆</span> AI Marketplace
          </div>
          <div style={{ fontSize: 13, color: S.muted, marginTop: 2 }}>
            Local models · Cloud providers · all in one place
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={refresh} disabled={loading}
            style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6,
              border: `1px solid ${S.border}`, background: S.white,
              color: S.text, cursor: "pointer" }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          {online && (
            <button onClick={handleUnload} disabled={busy === "unload"}
              style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6,
                border: `1px solid ${S.redBorder}`, background: S.redBg,
                color: S.red, cursor: "pointer" }}>
              {busy === "unload" ? "Unloading…" : "Unload model"}
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        online={online}
        loaded={health?.loaded ?? false}
        model={health?.model ?? activeModel?.hf ?? null}
        cacheDir={health?.cacheDir ?? null}
      />

      {/* Sub-tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${S.border}`, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ fontSize: 13, padding: "8px 18px", border: "none", background: "none",
              cursor: "pointer", fontWeight: subTab === t.id ? 700 : 400,
              color: subTab === t.id ? S.teal : S.muted,
              borderBottom: `2px solid ${subTab === t.id ? S.teal : "transparent"}`,
              marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Add-ons / Marketplace tab */}
      {subTab === "addons" && (
        <>
          {/* Cloud providers */}
          <div style={{ fontSize: 13, fontWeight: 700, color: S.text, marginBottom: 10 }}>
            ☁️ Cloud AI Providers
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
            {CLOUD_PROVIDERS.map(p => (
              <div key={p.id} style={{ border: `1.5px solid ${p.border}`, borderRadius: 10,
                padding: "12px 14px", background: p.bg,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: p.color }}>
                    {p.icon} {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{p.vendor}</div>
                </div>
                <Tag color={p.color} bg={p.bg} border={p.border}>top nav ↑</Tag>
              </div>
            ))}
          </div>

          {/* Local add-ons */}
          <div style={{ fontSize: 13, fontWeight: 700, color: S.text, marginBottom: 10 }}>
            ◆ Local Add-ons
          </div>
          <AddonsPanel
            server={recall() ?? serverConn}
            fileCount={fileCount}
            onRun={onRunLocalAi}
          />
        </>
      )}

      {/* Models tab */}
      {subTab === "models" && (
        <>
          {online && (
            <div style={{ fontSize: 13, color: S.muted, marginBottom: 14 }}>
              {installedCount} of {displayModels.length} downloaded ·
              active: <strong style={{ color: S.text }}>{activeModel?.name ?? "—"}</strong>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {displayModels.map(m => (
              <ModelCard key={m.id} model={m} online={online} busy={busy}
                onUse={handleUse} onInstall={handleInstallModel} onRemove={handleRemoveModel} />
            ))}
          </div>

        </>
      )}

      {/* Findings tab */}
      {subTab === "findings" && <AiFindings findings={allAiFindings} />}
    </div>
  );
}
