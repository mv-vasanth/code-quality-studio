import { parseAuditJsonFromModel } from "./parseAuditJson.js";
import { safeProviderError } from "./safeErrors.js";

export async function invokeAnthropic({ settings, systemPrompt, userContent }) {
  if (!settings?.useAi) throw new Error("AI review is disabled.");
  const { apiKey, model } = settings.anthropic;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(safeProviderError("Anthropic API error", res.status, errBody.slice(0, 200)));
  }
  const data = await res.json();
  const raw = data.content?.map((b) => b.text || "").join("") || "";
  return parseAuditJsonFromModel(raw);
}
