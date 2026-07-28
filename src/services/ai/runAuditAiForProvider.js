import { hasProviderCredentials } from "../../settings/aiSettingsDefaults.js";
import { runAuditAi } from "./runAuditAi.js";

export async function runAuditAiForProvider(file, stackId, settings, providerId) {
  if (!hasProviderCredentials(settings, providerId)) {
    throw new Error(
      `Configure ${providerId} API credentials in the header (⚙) before running.`,
    );
  }
  return runAuditAi(file, stackId, {
    ...settings,
    useAi: true,
    provider: providerId,
  });
}
