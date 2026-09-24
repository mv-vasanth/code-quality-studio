# AI settings

## Top-bar switch

- **AI** switch: off = standard rules only; on = scans use your configured provider.
- If you turn AI **on** without saved credentials, a **Connect AI provider** popup opens. After you save valid keys, AI turns on automatically.
- **⚙** opens the same form anytime to change provider, model, or keys.

## Local storage

Provider choice, models, and API keys are saved in **browser localStorage** (`cqs-ai-settings-v1`) on this device so you do not re-enter them each visit.

- Not written to the git repo or project `.env`.
- **Clear saved credentials** in the modal removes keys from storage and turns AI off.
- Anyone with access to this browser profile can read localStorage — use only on trusted machines.

## Re-run all (AI)

**Re-run all (AI)** uses stored credentials even when the switch is off; configure keys once via the popup or ⚙.

## Security notes

- Do not commit API keys to source control.
- This app calls providers from the browser; avoid shared screens while keys are in use.
- Provider errors are sanitized via `sanitizeClientError()` before display.
