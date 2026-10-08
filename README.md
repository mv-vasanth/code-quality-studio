# Code Quality Studio

A single-page React app (Vite) that audits **Playwright**, **Java API**, and **TypeScript**
code against a catalog of standard rules, with optional **multi-provider AI review**
(Anthropic, AWS Bedrock, Google AI Studio, Google Vertex) and exportable HTML/Markdown reports.

## Quick start

Installed from npm, one command gives you the whole studio:

```bash
npm install -g cqs-audit
cqs serve --open
```

That starts a local companion on `http://127.0.0.1:4000` and opens the app it
serves. The page comes with its own session token, so there is nothing to copy
and paste, and because it is served from the same origin as the API there is no
CORS to configure. Scanning a folder from the UI reads it from disk directly,
rather than making you pick files through the browser.

To work on the app itself:

```bash
npm install
npm run dev      # http://localhost:4001
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
| [ai/README.md](ai/README.md) | `cqs-ai` — the optional offline AI layer (separate package) |
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
