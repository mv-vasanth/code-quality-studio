import { runLocalAnalysis } from "../analyzers/index.js";
import { getRunnableAiProviders } from "../settings/aiSettingsDefaults.js";
import { runAuditAiForProvider } from "./ai/runAuditAiForProvider.js";

/**
 * @param {"auto" | "local" | "ai"} [options.mode]
 * @param {string} [options.providerId] — required when mode is "ai" (except fallback to first runnable)
 */
export async function runFileAnalysis(file, stackId = "playwright", aiSettings, options = {}) {
  const mode = options.mode ?? "auto";
  const providerId = options.providerId;

  if (mode === "local") {
    await new Promise((r) => setTimeout(r, 200));
    return runLocalAnalysis(stackId, file.name, file.content);
  }

  if (mode === "ai") {
    const id = providerId || getRunnableAiProviders(aiSettings)[0]?.id;
    if (!id) {
      throw new Error("Turn on an AI provider in the header and add credentials.");
    }
    return runAuditAiForProvider(file, stackId, aiSettings, id);
  }

  const runnable = getRunnableAiProviders(aiSettings);
  if (!runnable.length) {
    await new Promise((r) => setTimeout(r, 200));
    return runLocalAnalysis(stackId, file.name, file.content);
  }
  return runAuditAiForProvider(file, stackId, aiSettings, runnable[0].id);
}
