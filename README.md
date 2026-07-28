# Code Quality Studio

A single-page React app (Vite) that audits **Playwright**, **Java API**, and **TypeScript**
code against a catalog of standard rules, with optional **multi-provider AI review**
(Anthropic, AWS Bedrock, Google AI Studio, Google Vertex) and exportable HTML/Markdown reports.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Standard rule analysis runs entirely in the browser with no network calls.
AI review and report export are optional layers on top.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (required for Vertex Gemini via the local `/api/vertex/audit` route) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |

## How it works

1. Load source files into the studio and pick a stack (Playwright / Java / TypeScript).
2. `services/runFileAnalysis.js` runs the deterministic local analyzers for that stack.
3. Optionally, enable one or more AI providers to get a second opinion per file.
4. Review findings across tabs (Overview · Files · Findings · Radar · Roadmap · Guide) and export a report.

## Documentation

| Doc | Topic |
|-----|-------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System context, layers, data flow, security boundaries |
| [docs/SOURCE_LAYOUT.md](docs/SOURCE_LAYOUT.md) | Where feature code lives in `src/` |
| [docs/MULTI_STACK.md](docs/MULTI_STACK.md) | Stack plug-in model + how to add a stack |
| [docs/AI_SETTINGS.md](docs/AI_SETTINGS.md) | Provider configuration and key storage |
| [docs/VERTEX_AI.md](docs/VERTEX_AI.md) | Google Vertex dev-server route |

## Security notes

- API keys are stored in `localStorage`; the Vertex service-account JSON lives in tab memory only
  and is stripped before any `localStorage` save.
- Source files and findings stay in-memory unless you explicitly export a report.
- `.env` is git-ignored — never commit provider credentials.
