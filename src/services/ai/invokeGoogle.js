import { parseAuditJsonFromModel } from "./parseAuditJson.js";
import { safeProviderError } from "./safeErrors.js";
import { hasGoogleApiKeyCredentials } from "../../settings/googleAuth.js";
import { invokeGoogleVertex } from "./invokeGoogleVertex.js";

export async function invokeGoogle({ settings, systemPrompt, userContent }) {
  if (!settings?.useAi) throw new Error("AI review is disabled.");

  const g = settings.google || {};
  if (g.authMode === "vertex") {
    return invokeGoogleVertex({ settings, systemPrompt, userContent });
  }

  if (!hasGoogleApiKeyCredentials(g)) {
    throw new Error("Google AI Studio API key is missing.");
  }

  const { apiKey, model } = g;
  const modelId = model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(safeProviderError("Google AI error", res.status, errBody.slice(0, 200)));
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) throw new Error("Google AI returned empty response");
  return parseAuditJsonFromModel(text);
}
