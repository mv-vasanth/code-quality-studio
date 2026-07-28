/** Strip patterns that might appear in provider error bodies (never log raw settings). */

const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[REDACTED]"],
  [/AKIA[A-Z0-9]{16}/g, "AKIA[REDACTED]"],
  [/AIza[A-Za-z0-9_-]{20,}/g, "AIza[REDACTED]"],
  [/key=[^&\s"']+/gi, "key=[REDACTED]"],
  [/x-api-key['":\s]+[^\s'"]+/gi, "x-api-key [REDACTED]"],
];

export function sanitizeClientError(message) {
  if (message == null || message === "") return "Analysis failed.";
  let out = String(message);
  for (const [re, repl] of PATTERNS) {
    out = out.replace(re, repl);
  }
  return out.slice(0, 500);
}

export function safeProviderError(prefix, status, bodySnippet) {
  return sanitizeClientError(`${prefix} (${status}): ${bodySnippet ?? ""}`);
}
