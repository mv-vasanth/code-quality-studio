# Multi-stack Code Quality Studio

## Stacks

| Stack | Files | Focus |
|-------|--------|--------|
| **Playwright E2E** | `*.spec.ts`, `*.test.js`, … | Locators, flakiness, CI |
| **Java API / Core** | `*.java` | REST, JDBC, security, logging |
| **TypeScript Core / API** | `*.ts`, `*.tsx` | Types, fetch/axios, validation |

Switch stack in the **top bar** (Playwright | Java | TypeScript). Each stack has its own categories, rules, checklist, and report label.

## Architecture

```
stacks/definitions.js     → dimensions + file patterns per stack
analyzers/                → local rule engines (no API required)
services/runFileAnalysis  → dispatches by stackId
guides/                   → best-practice content per stack
studio/PlaywrightQualityStudio.jsx → shell (rename later if desired)
```

## Extending

1. Add entry to `AUDIT_STACKS` in `stacks/definitions.js`.
2. Implement `analyzers/yourStack.js` returning the same JSON shape as Playwright.
3. Register in `analyzers/index.js`.
4. Add practices in `guides/`.

AI mode (optional) sends `stackId` in the prompt; standard rules always run locally by default.
