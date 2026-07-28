import { parseAuditJsonFromModel } from "./parseAuditJson.js";
import { safeProviderError } from "./safeErrors.js";
import { parseServiceAccountJson } from "../../settings/googleAuth.js";

/**
 * Vertex AI via local Vite dev server (Node). Service account is sent only to same-origin /api/vertex/audit.
 */
export async function invokeGoogleVertex({ settings, systemPrompt, userContent }) {
  const g = settings?.google;
  const parsed = parseServiceAccountJson(g?.serviceAccountJson);
  if (!parsed.ok) {
    throw new Error(
      "Paste a valid Vertex service account JSON in Gemini settings (session only — not saved to disk).",
    );
  }

  const projectId = (g.vertexProjectId || parsed.projectId || "").trim();
  const location = (g.vertexLocation || "us-central1").trim();
  const model = (g.vertexModel || g.model || "gemini-1.5-flash").trim();

  if (!projectId) {
    throw new Error("Set Vertex project ID (or use a JSON file that includes project_id).");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(g.serviceAccountJson);
  } catch {
    throw new Error("Invalid service account JSON.");
  }

  const res = await fetch("/api/vertex/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      location,
      model,
      systemPrompt,
      userContent,
      serviceAccount,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof payload.error === "string" ? payload.error : "Vertex request failed";
    throw new Error(safeProviderError("Vertex AI error", res.status, msg.slice(0, 200)));
  }

  const text = payload.text ?? "";
  if (!text) throw new Error("Vertex AI returned empty response");
  return parseAuditJsonFromModel(text);
}
