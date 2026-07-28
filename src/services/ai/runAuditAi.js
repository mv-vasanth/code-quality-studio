import { hasProviderCredentials } from "../../settings/aiSettingsDefaults.js";
import { getAuditSystemPrompt } from "../../constants/stackAiPrompts.js";
import { invokeAnthropic } from "./invokeAnthropic.js";
import { invokeGoogle } from "./invokeGoogle.js";

export async function runAuditAi(file, stackId, settings) {
  const providerId = settings?.provider;
  if (!providerId) throw new Error("No AI provider selected.");
  if (!hasProviderCredentials(settings, providerId)) {
    throw new Error(`Configure ${providerId} credentials in header Settings before running.`);
  }

  const systemPrompt = getAuditSystemPrompt(stackId);
  const userContent = `Stack: ${stackId}\nFilename: ${file.name}\n\nCode:\n${file.content}`;

  switch (settings.provider) {
    case "anthropic":
      return invokeAnthropic({ settings, systemPrompt, userContent });
    case "bedrock": {
      const { invokeBedrock } = await import("./invokeBedrock.js");
      return invokeBedrock({ settings, systemPrompt, userContent });
    }
    case "google":
      return invokeGoogle({ settings, systemPrompt, userContent });
    default:
      throw new Error(`Unknown AI provider: ${settings.provider}`);
  }
}
