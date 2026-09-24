/**
 * suggestRules.js — AI-powered rule suggestion agent.
 * Analyses a sample of loaded files and suggests new custom rules
 * that could catch recurring patterns not covered by built-in rules.
 */
import { getRunnableAiProviders } from "../../settings/aiSettingsDefaults.js";
import { safeProviderError } from "./safeErrors.js";

const SYSTEM_PROMPT = `You are a senior test automation architect who specialises in code quality rules.
You will be shown samples from real test files. Your job is to identify recurring patterns, anti-patterns, or conventions that are NOT already covered by standard Playwright rules, and suggest them as new quality rules.

Respond ONLY with valid JSON — no markdown, no explanation outside the JSON:
[
  {
    "title": "Short rule title (max 60 chars)",
    "description": "One sentence explaining what this rule catches.",
    "severity": "critical" | "warning" | "info",
    "category": "coding_standards" | "reliability" | "selectors" | "assertions" | "structure" | "security" | "performance",
    "pattern": "The regex pattern string (without delimiters) that detects this issue in file content",
    "fix": "Short description of the fix",
    "rationale": "Why this pattern is problematic"
  }
]

Rules:
- Suggest 3 to 6 rules.
- Each rule must be specific enough to be matched by a simple regex or string search.
- Do NOT suggest rules that are already covered by: XPath locators, hard waits (waitForTimeout), hardcoded secrets, page.pause(), .only() tests, console.log, or missing assertions.
- Focus on TEAM-SPECIFIC patterns you see across multiple files.
- The "pattern" field must be a valid JavaScript regex string (no / / delimiters, escaped properly).`;

function sampleFiles(files, maxFiles = 8, maxCharsPerFile = 1500) {
  // Pick a representative sample: first 4 + random middle
  const sample = files.slice(0, Math.min(maxFiles, files.length));
  return sample
    .map((f) => {
      const content = (f.content || "").slice(0, maxCharsPerFile);
      return `=== ${f.name} ===\n${content}`;
    })
    .join("\n\n");
}

function buildUserContent(files, stackId) {
  const sample = sampleFiles(files);
  return `Stack: ${stackId}
I have loaded ${files.length} test file(s). Here is a sample:

${sample}

Based on these files, identify 3–6 recurring patterns, anti-patterns, or team conventions that could become quality rules. Return only a JSON array.`;
}

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
      max_tokens: 2048,
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
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
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
  try { sdk = await import("@aws-sdk/client-bedrock-runtime"); }
  catch { throw new Error("AWS Bedrock SDK not installed."); }
  const { BedrockRuntimeClient, InvokeModelCommand } = sdk;
  const { accessKeyId, secretAccessKey, region, modelId } = settings.bedrock;
  const client = new BedrockRuntimeClient({ region: region || "us-east-1", credentials: { accessKeyId, secretAccessKey } });
  const model = modelId || "anthropic.claude-3-5-sonnet-20240620-v1:0";
  const body = JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 2048, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userContent }] });
  const response = await client.send(new InvokeModelCommand({ modelId: model, contentType: "application/json", accept: "application/json", body }));
  const decoded = new TextDecoder().decode(response.body);
  return JSON.parse(decoded).content?.map((c) => c.text).join("") ?? "";
}

/**
 * Analyse a sample of loaded files and suggest new custom rules.
 * @param {{ settings: object, files: Array<{name,content}>, stackId: string }} opts
 * @returns {Promise<Array<{title,description,severity,category,pattern,fix,rationale}>>}
 */
export async function suggestRules({ settings, files, stackId }) {
  const runnable = getRunnableAiProviders(settings);
  if (!runnable.length) throw new Error("No AI provider configured. Enable Claude, Bedrock, or Gemini in Settings.");
  if (!files || files.length === 0) throw new Error("No files loaded. Load a test folder first.");

  const provider = runnable[0].id;
  const userContent = buildUserContent(files, stackId);

  let raw;
  switch (provider) {
    case "anthropic": raw = await callAnthropic(settings, userContent); break;
    case "google":    raw = await callGoogle(settings, userContent);    break;
    case "bedrock":   raw = await callBedrock(settings, userContent);   break;
    default:          throw new Error(`Unknown provider: ${provider}`);
  }

  // Parse JSON — strip any markdown code fences if present
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  let suggestions;
  try {
    suggestions = JSON.parse(cleaned);
  } catch {
    throw new Error("AI returned unexpected format. Try again.");
  }
  if (!Array.isArray(suggestions)) throw new Error("AI returned unexpected format. Try again.");
  return suggestions.slice(0, 6); // cap at 6
}
