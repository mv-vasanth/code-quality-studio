/**
 * AI-powered fix generation for a single finding.
 * Returns raw text (explanation + code snippet), not an audit JSON object.
 */
import { getRunnableAiProviders } from "../../settings/aiSettingsDefaults.js";
import { safeProviderError } from "./safeErrors.js";

const SYSTEM_PROMPT = `You are a senior test automation engineer specialising in code quality.
When given a source file and a specific code issue, you provide a minimal, targeted fix.

Respond in this exact format:
EXPLANATION: <one concise sentence describing what you changed and why>
\`\`\`
<fixed code snippet — only the relevant lines, not the whole file>
\`\`\`

Rules:
- Keep the fix minimal — change only what is needed
- Do not rewrite the entire file
- If the issue is file-level (no specific line), show the recommended pattern
- Use the same language/style as the original file`;

function buildUserContent(fileContent, fileName, finding) {
  const trimmed =
    fileContent.length > 5000
      ? fileContent.slice(0, 5000) + "\n\n… (file truncated for brevity)"
      : fileContent;

  return `File: ${fileName}

Issue detected:
• Rule: ${finding.ruleId}
• Severity: ${finding.severity}
• Title: ${finding.title}
• Detail: ${finding.description}
• Line: ${finding.line != null ? finding.line : "file-level"}
• Fix guidance: ${finding.fix || finding.description}

Source file:
\`\`\`
${trimmed}
\`\`\`

Generate a targeted, minimal fix for this specific issue only.`;
}

// ── Provider-specific raw callers ──────────────────────────────────────────

async function callAnthropic(settings, userContent) {
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
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(safeProviderError("Anthropic API error", res.status, err.slice(0, 200)));
  }
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "";
}

async function callGoogle(settings, userContent) {
  const { apiKey, model } = settings.google;
  const modelId = model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(safeProviderError("Google AI error", res.status, err.slice(0, 200)));
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

async function callBedrock(settings, userContent) {
  let sdk;
  try {
    sdk = await import("@aws-sdk/client-bedrock-runtime");
  } catch {
    throw new Error("AWS Bedrock SDK not installed. Run: npm install @aws-sdk/client-bedrock-runtime");
  }
  const { BedrockRuntimeClient, InvokeModelCommand } = sdk;
  const { accessKeyId, secretAccessKey, region, modelId } = settings.bedrock;
  const client = new BedrockRuntimeClient({
    region: region || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
  });
  const model = modelId || "anthropic.claude-3-5-sonnet-20240620-v1:0";
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const command = new InvokeModelCommand({
    modelId: model,
    contentType: "application/json",
    accept: "application/json",
    body,
  });
  const response = await client.send(command);
  const decoded = new TextDecoder().decode(response.body);
  const json = JSON.parse(decoded);
  return json.content?.map((c) => c.text).join("") ?? "";
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Ask the first available AI provider for a targeted fix for a single finding.
 *
 * @param {{ settings: object, fileContent: string, fileName: string, finding: object }} opts
 * @returns {Promise<string>}  Raw text: "EXPLANATION: …\n```\n…\n```"
 */
export async function generateAiFix({ settings, fileContent, fileName, finding }) {
  const runnable = getRunnableAiProviders(settings);
  if (!runnable.length) {
    throw new Error("No AI provider configured. Enable Claude, Bedrock, or Gemini in Settings.");
  }

  const provider = runnable[0].id;
  const userContent = buildUserContent(fileContent, fileName, finding);

  switch (provider) {
    case "anthropic": return callAnthropic(settings, userContent);
    case "google":    return callGoogle(settings, userContent);
    case "bedrock":   return callBedrock(settings, userContent);
    default:          throw new Error(`Unknown provider: ${provider}`);
  }
}
