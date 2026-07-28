import { DEFAULT_AI_SETTINGS, migrateAiSettings } from "./aiSettingsDefaults.js";
import { googleSettingsForStorage } from "./googleAuth.js";

const STORAGE_KEY = "pqs-ai-settings-v1";

function cloneDefaults() {
  return {
    ...DEFAULT_AI_SETTINGS,
    enabledProviders: { ...DEFAULT_AI_SETTINGS.enabledProviders },
    anthropic: { ...DEFAULT_AI_SETTINGS.anthropic },
    bedrock: { ...DEFAULT_AI_SETTINGS.bedrock },
    google: { ...DEFAULT_AI_SETTINGS.google },
  };
}

export function mergeAiSettings(partial) {
  const base = cloneDefaults();
  if (!partial || typeof partial !== "object") return base;
  return migrateAiSettings({
    ...base,
    ...partial,
    enabledProviders: { ...base.enabledProviders, ...(partial.enabledProviders || {}) },
    anthropic: { ...base.anthropic, ...(partial.anthropic || {}) },
    bedrock: { ...base.bedrock, ...(partial.bedrock || {}) },
    google: {
      ...base.google,
      ...(partial.google || {}),
      authMode: partial.google?.authMode || base.google.authMode,
      vertexLocation: partial.google?.vertexLocation || base.google.vertexLocation,
      serviceAccountJson: "",
    },
  });
}

export function loadStoredAiSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return mergeAiSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredAiSettings(settings) {
  try {
    const payload = {
      useAi: Boolean(settings.useAi),
      provider: settings.provider,
      enabledProviders: { ...settings.enabledProviders },
      anthropic: { ...settings.anthropic },
      bedrock: { ...settings.bedrock },
      google: googleSettingsForStorage(settings.google),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearStoredAiSecrets() {
  try {
    const current = loadStoredAiSettings() ?? cloneDefaults();
    const cleared = {
      ...current,
      enabledProviders: { anthropic: false, bedrock: false, google: false },
      anthropic: { ...current.anthropic, apiKey: "" },
      bedrock: { ...current.bedrock, accessKeyId: "", secretAccessKey: "" },
      google: { ...current.google, apiKey: "" },
    };
    saveStoredAiSettings(cleared);
    return cleared;
  } catch {
    return cloneDefaults();
  }
}
