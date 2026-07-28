import { SYSTEM_PROMPT } from "./aiSystemPrompt.js";

const STACK_HINTS = {
  playwright: "Playwright E2E tests (locators, flakiness, CI).",
  java_api: "Java API / services (REST, JDBC, security, concurrency, logging).",
  typescript: "TypeScript core / API clients (types, async I/O, validation, security).",
};

export function getAuditSystemPrompt(stackId) {
  const hint = STACK_HINTS[stackId] ?? STACK_HINTS.playwright;
  return `${SYSTEM_PROMPT}\n\nCurrent audit stack: ${stackId}. ${hint}`;
}
