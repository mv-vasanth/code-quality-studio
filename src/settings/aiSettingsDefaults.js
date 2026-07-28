import { hasGoogleCredentials } from "./googleAuth.js";

/** Default AI settings — persisted in browser localStorage via AiSettingsContext. */

export const AI_PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic (direct)",
    shortLabel: "Claude",
    description: "api.anthropic.com from the browser",
  },
  {
    id: "bedrock",
    label: "AWS Bedrock",
    shortLabel: "Bedrock",
    description: "Claude / other models via Bedrock Runtime",
  },
  {
    id: "google",
    label: "Google AI (Gemini)",
    shortLabel: "Gemini",
    description: "AI Studio API key or Vertex AI (local dev)",
  },
];

export const AI_PROVIDER_IDS = AI_PROVIDERS.map((p) => p.id);

export const DEFAULT_AI_SETTINGS = {
  useAi: false,
  provider: "anthropic",
  enabledProviders: {
    anthropic: false,
    bedrock: false,
    google: false,
  },
  anthropic: {
    apiKey: "",
    model: "claude-sonnet-4-6",
  },
  bedrock: {
    accessKeyId: "",
    secretAccessKey: "",
    region: "us-east-1",
    modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
  },
  google: {
    authMode: "api_key",
    apiKey: "",
    model: "gemini-1.5-flash",
    vertexProjectId: "",
    vertexLocation: "us-central1",
    vertexModel: "gemini-1.5-flash",
    serviceAccountJson: "",
  },
};

export const MODEL_PLACEHOLDERS = {
  anthropic: [
    "claude-sonnet-4-6",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
  ],
  bedrock: [
    "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "amazon.titan-text-express-v1",
    "meta.llama3-70b-instruct-v1:0",
  ],
  google: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash-002"],
};

export function providerShortLabel(providerId) {
  return AI_PROVIDERS.find((p) => p.id === providerId)?.shortLabel ?? providerId;
}

export function hasProviderCredentials(settings, providerId) {
  if (!settings || !providerId) return false;
  switch (providerId) {
    case "anthropic":
      return Boolean(settings.anthropic?.apiKey?.trim());
    case "bedrock":
      return Boolean(
        settings.bedrock?.accessKeyId?.trim() && settings.bedrock?.secretAccessKey?.trim(),
      );
    case "google":
      return hasGoogleCredentials(settings.google);
    default:
      return false;
  }
}

export function hasAiCredentials(settings) {
  return AI_PROVIDER_IDS.some((id) => hasProviderCredentials(settings, id));
}

export function isProviderEnabled(settings, providerId) {
  return Boolean(settings?.enabledProviders?.[providerId]);
}

export function setProviderEnabled(settings, providerId, enabled) {
  return {
    ...settings.enabledProviders,
    [providerId]: enabled,
  };
}

export function getRunnableAiProviders(settings) {
  return AI_PROVIDERS.filter(
    (p) => isProviderEnabled(settings, p.id) && hasProviderCredentials(settings, p.id),
  );
}

export function anyProviderEnabled(settings) {
  return AI_PROVIDER_IDS.some((id) => isProviderEnabled(settings, id));
}

export function isAiConfigured(settings) {
  return getRunnableAiProviders(settings).length > 0;
}

export function getAnalysisModeLabel(settings) {
  const runnable = getRunnableAiProviders(settings);
  if (!runnable.length) {
    if (anyProviderEnabled(settings)) return "Standard rules · AI on, finish setup";
    return "Standard rules";
  }
  if (runnable.length === 1) return `AI · ${runnable[0].shortLabel}`;
  return `AI · ${runnable.map((p) => p.shortLabel).join(" + ")}`;
}

export function migrateAiSettings(stored) {
  const base = { ...stored };
  if (!base.enabledProviders) {
    base.enabledProviders = { anthropic: false, bedrock: false, google: false };
    if (base.useAi && base.provider) {
      base.enabledProviders[base.provider] = true;
    }
  }
  if (base.google && !base.google.authMode) {
    base.google = {
      authMode: "api_key",
      vertexProjectId: "",
      vertexLocation: "us-central1",
      vertexModel: base.google.model || "gemini-1.5-flash",
      serviceAccountJson: "",
      ...base.google,
    };
  }
  return base;
}
