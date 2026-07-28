import {
  AI_PROVIDERS,
  MODEL_PLACEHOLDERS,
} from "../../settings/aiSettingsDefaults.js";
import { hasProviderCredentials } from "../../settings/aiSettingsDefaults.js";
import { parseServiceAccountJson } from "../../settings/googleAuth.js";

export const fieldStyle = {
  width: "100%",
  fontSize: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 10px",
  boxSizing: "border-box",
};

export const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 4,
  display: "block",
};

const helpLinkStyle = {
  fontSize: 10.5,
  fontWeight: 600,
  color: "#0d9488",
  textDecoration: "none",
};

/** Label row with an optional right-aligned "get a key" link. */
function FieldLabel({ children, helpHref, helpText }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
      <span style={{ ...labelStyle, marginBottom: 0 }}>{children}</span>
      {helpHref && (
        <a href={helpHref} target="_blank" rel="noreferrer" style={helpLinkStyle}>
          {helpText} ↗
        </a>
      )}
    </div>
  );
}

function ModelDatalist({ id, provider, value, onChange }) {
  const options = MODEL_PLACEHOLDERS[provider] ?? [];
  return (
    <>
      <input
        list={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={fieldStyle}
        placeholder={options[0] ?? "model-id"}
      />
      <datalist id={id}>
        {options.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}

export default function AiProviderFields({ settings, updateSettings, showSecrets }) {
  const configured = hasProviderCredentials(settings, settings.provider);

  return (
    <>
      <div>
        <span style={labelStyle}>Provider</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {AI_PROVIDERS.map((p) => (
            <label
              key={p.id}
              style={{
                display: "flex",
                gap: 10,
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${settings.provider === p.id ? "#14b8a6" : "#e5e7eb"}`,
                background: settings.provider === p.id ? "#f0fdfa" : "#fafafa",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="ai-provider"
                checked={settings.provider === p.id}
                onChange={() => updateSettings({ provider: p.id })}
              />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111" }}>{p.label}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{p.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {settings.provider === "anthropic" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <FieldLabel helpHref="https://console.anthropic.com/settings/keys" helpText="Get a key">
              API key
            </FieldLabel>
            <input
              type={showSecrets ? "text" : "password"}
              autoComplete="off"
              value={settings.anthropic.apiKey}
              onChange={(e) => updateSettings({ anthropic: { apiKey: e.target.value } })}
              placeholder="sk-ant-…"
              style={fieldStyle}
            />
            <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "#6b7280", lineHeight: 1.45 }}>
              Create the key at console.anthropic.com → API Keys, then add billing credit. Stored only in this browser.
            </p>
          </div>
          <div>
            <span style={labelStyle}>Model</span>
            <ModelDatalist
              id="anthropic-models"
              provider="anthropic"
              value={settings.anthropic.model}
              onChange={(model) => updateSettings({ anthropic: { model } })}
            />
          </div>
        </div>
      )}

      {settings.provider === "bedrock" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <span style={labelStyle}>AWS access key ID</span>
            <input
              type={showSecrets ? "text" : "password"}
              autoComplete="off"
              value={settings.bedrock.accessKeyId}
              onChange={(e) => updateSettings({ bedrock: { accessKeyId: e.target.value } })}
              placeholder="AKIA…"
              style={fieldStyle}
            />
          </div>
          <div>
            <span style={labelStyle}>AWS secret access key</span>
            <input
              type={showSecrets ? "text" : "password"}
              autoComplete="off"
              value={settings.bedrock.secretAccessKey}
              onChange={(e) => updateSettings({ bedrock: { secretAccessKey: e.target.value } })}
              placeholder="••••••••"
              style={fieldStyle}
            />
          </div>
          <div>
            <span style={labelStyle}>Region</span>
            <input
              value={settings.bedrock.region}
              onChange={(e) => updateSettings({ bedrock: { region: e.target.value } })}
              placeholder="us-east-1"
              style={fieldStyle}
            />
          </div>
          <div>
            <span style={labelStyle}>Model ID</span>
            <ModelDatalist
              id="bedrock-models"
              provider="bedrock"
              value={settings.bedrock.modelId}
              onChange={(modelId) => updateSettings({ bedrock: { modelId } })}
            />
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "#b45309", lineHeight: 1.45 }}>
            Bedrock calls run from your browser with the keys above. Prefer IAM roles on a backend for
            production; this UI is for local / personal audits only.
          </p>
        </div>
      )}

      {settings.provider === "google" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <span style={labelStyle}>Google auth</span>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="google-auth"
                  checked={(settings.google.authMode || "api_key") === "api_key"}
                  onChange={() => updateSettings({ google: { authMode: "api_key" } })}
                />
                AI Studio API key
              </label>
              <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="google-auth"
                  checked={settings.google.authMode === "vertex"}
                  onChange={() => updateSettings({ google: { authMode: "vertex" } })}
                />
                Vertex AI (service account)
              </label>
            </div>
          </div>

          {(settings.google.authMode || "api_key") === "api_key" && (
            <>
              <div>
                <FieldLabel helpHref="https://aistudio.google.com/apikey" helpText="Get a key">
                  API key (Google AI Studio)
                </FieldLabel>
                <input
                  type={showSecrets ? "text" : "password"}
                  autoComplete="off"
                  value={settings.google.apiKey}
                  onChange={(e) => updateSettings({ google: { apiKey: e.target.value } })}
                  placeholder="AIza…"
                  style={fieldStyle}
                />
              </div>
              <div>
                <span style={labelStyle}>Model</span>
                <ModelDatalist
                  id="google-models"
                  provider="google"
                  value={settings.google.model}
                  onChange={(model) => updateSettings({ google: { model } })}
                />
              </div>
            </>
          )}

          {settings.google.authMode === "vertex" && (
            <>
              <p style={{ margin: 0, fontSize: 11, color: "#b45309", lineHeight: 1.45 }}>
                Vertex uses <code>@google-cloud/vertexai</code> on your machine via <code>npm run dev</code> only.
                Service account JSON stays in this browser tab&apos;s memory — it is <strong>not</strong> written to
                localStorage or the repo. Re-paste after refresh. Clear with &quot;Clear saved credentials&quot;.
              </p>
              <div>
                <span style={labelStyle}>Service account JSON (session only)</span>
                <textarea
                  value={settings.google.serviceAccountJson || ""}
                  onChange={(e) => updateSettings({ google: { serviceAccountJson: e.target.value } })}
                  placeholder='{"type":"service_account","project_id":"your-project",...}'
                  rows={5}
                  autoComplete="off"
                  spellCheck={false}
                  style={{ ...fieldStyle, fontFamily: "monospace", fontSize: 10 }}
                />
                {parseServiceAccountJson(settings.google.serviceAccountJson || "").ok && (
                  <div style={{ fontSize: 11, color: "#15803d", marginTop: 4 }}>Valid service account shape detected.</div>
                )}
              </div>
              <div>
                <span style={labelStyle}>GCP project ID (optional if in JSON)</span>
                <input
                  value={settings.google.vertexProjectId || ""}
                  onChange={(e) => updateSettings({ google: { vertexProjectId: e.target.value } })}
                  placeholder="my-gcp-project"
                  style={fieldStyle}
                />
              </div>
              <div>
                <span style={labelStyle}>Region</span>
                <input
                  value={settings.google.vertexLocation || "us-central1"}
                  onChange={(e) => updateSettings({ google: { vertexLocation: e.target.value } })}
                  placeholder="us-central1"
                  style={fieldStyle}
                />
              </div>
              <div>
                <span style={labelStyle}>Vertex model ID</span>
                <ModelDatalist
                  id="google-vertex-models"
                  provider="google"
                  value={settings.google.vertexModel || settings.google.model}
                  onChange={(vertexModel) => updateSettings({ google: { vertexModel } })}
                />
              </div>
            </>
          )}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          padding: 10,
          borderRadius: 8,
          background: configured ? "#f0fdf4" : "#fffbeb",
          color: configured ? "#15803d" : "#b45309",
          border: `1px solid ${configured ? "#86efac" : "#fcd34d"}`,
        }}
      >
        {configured
          ? "Saved on this device. New scans can use AI when the switch is on."
          : "Enter the required fields for your provider — they will be saved in this browser for reuse."}
      </div>
    </>
  );
}
