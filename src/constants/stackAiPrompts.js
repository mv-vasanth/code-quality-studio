import { SYSTEM_PROMPT } from "./aiSystemPrompt.js";

const STACK_HINTS = {
  // Testers · UI automation
  playwright: "Playwright E2E tests in TS/JS (locators, flakiness, CI).",
  playwright_java: "Playwright for Java tests (AriaRole locators, web-first assertThat, waits, resource management).",
  playwright_python: "Playwright for Python tests (snake_case locators, expect(), fixtures, waits).",
  // Testers · API testing
  restassured: "REST Assured (Java) API tests (given/when/then, status/schema/body assertions, auth, config).",
  karate: "Karate API tests (Gherkin: Given url / When method / Then status & match; config; reuse).",
  pytest_api: "Python API tests with pytest + requests/httpx (status/body assertions, schema validation, fixtures, timeouts).",
  postman: "Postman / Newman collection (pm.test assertions, {{variables}} for URLs and secrets, clean scripts).",
  // Devs · app code
  java_api: "Java API / services (REST, JDBC, security, concurrency, logging).",
  java_frontend: "General Java code (correctness, error handling, idiomatic style).",
  typescript: "TypeScript core / API clients (types, async I/O, validation, security).",
  ts_frontend: "React/TypeScript frontend (safe rendering/XSS, hooks, accessibility, type safety).",
  python_api: "Python services/APIs (FastAPI/Flask/Django: SQL safety, secrets, validation, error handling, async).",
  python_frontend: "Django/Jinja templates (output escaping, CSRF, accessible markup).",
};

export function getAuditSystemPrompt(stackId) {
  const hint = STACK_HINTS[stackId] ?? STACK_HINTS.playwright;
  return `${SYSTEM_PROMPT}\n\nCurrent audit stack: ${stackId}. ${hint}`;
}
