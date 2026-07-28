# Google Vertex AI (Gemini)

## When to use

- **AI Studio API key** — calls Google from the browser (current default).
- **Vertex AI** — uses `@google-cloud/vertexai` with a **service account** on your machine.

Vertex is only available while the app runs with **`npm run dev`** (Vite dev server exposes `POST /api/vertex/audit`). Production static builds do not include this route.

## Setup

1. `npm install` (includes `@google-cloud/vertexai`).
2. Open **⚙** → select **Google** → choose **Vertex AI (service account)**.
3. Paste your service account JSON once per browser session (not saved to localStorage).
4. Set region (e.g. `us-central1`) and model (e.g. `gemini-1.5-flash`).
5. Turn on the **Gemini** header switch and run scans.

## Security

- Never commit service account JSON to git.
- Do not paste real keys into chat, docs, or screenshots.
- Use **Clear saved credentials** when done; close the tab to drop session JSON.
- The dev API route accepts credentials in the request body only on localhost — do not expose that server to the network.

## Troubleshooting

- **404 on /api/vertex/audit** — run `npm run dev`, not `vite preview` alone.
- **Permission denied** — ensure the service account has Vertex AI User on the project.
