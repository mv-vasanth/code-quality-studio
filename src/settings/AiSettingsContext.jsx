import { createContext, useContext, useMemo, useState, useCallback } from "react";
import { DEFAULT_AI_SETTINGS } from "./aiSettingsDefaults.js";
import {
  loadStoredAiSettings,
  saveStoredAiSettings,
  mergeAiSettings,
} from "./aiSettingsStorage.js";

const AiSettingsContext = createContext(null);

function initialSettings() {
  return loadStoredAiSettings() ?? mergeAiSettings(DEFAULT_AI_SETTINGS);
}

export function AiSettingsProvider({ children }) {
  const [settings, setSettings] = useState(initialSettings);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        ...patch,
        enabledProviders: { ...prev.enabledProviders, ...(patch.enabledProviders || {}) },
        anthropic: { ...prev.anthropic, ...(patch.anthropic || {}) },
        bedrock: { ...prev.bedrock, ...(patch.bedrock || {}) },
        google: { ...prev.google, ...(patch.google || {}) },
      };
      saveStoredAiSettings(next);
      return next;
    });
  }, []);

  const clearSecrets = useCallback(() => {
    setSettings((prev) => {
      const next = {
        ...prev,
        useAi: false,
        enabledProviders: { anthropic: false, bedrock: false, google: false },
        anthropic: { ...prev.anthropic, apiKey: "" },
        bedrock: { ...prev.bedrock, accessKeyId: "", secretAccessKey: "" },
        google: { ...prev.google, apiKey: "", serviceAccountJson: "" },
      };
      saveStoredAiSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, setSettings, updateSettings, clearSecrets }),
    [settings, updateSettings, clearSecrets],
  );

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>;
}

export function useAiSettings() {
  const ctx = useContext(AiSettingsContext);
  if (!ctx) throw new Error("useAiSettings must be used within AiSettingsProvider");
  return ctx;
}
