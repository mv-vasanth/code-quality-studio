import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  getRunnableAiProviders,
  providerShortLabel,
} from "../settings/aiSettingsDefaults.js";

/** @typedef {'local' | 'compare-all' | 'anthropic' | 'bedrock' | 'google'} ResultsView */

function migrateLegacyAi(file, providerId) {
  if (file.resultsAi?.[providerId]) return file.resultsAi[providerId];
  if (file.resultAi && (!file._legacyAiProvider || file._legacyAiProvider === providerId)) {
    return file.resultAi;
  }
  return null;
}

export function getAiResult(file, providerId) {
  if (!file || !providerId) return null;
  return file.resultsAi?.[providerId] ?? migrateLegacyAi(file, providerId);
}

export function getStoredResult(file, view) {
  if (!file) return null;
  if (view === "local") return file.resultLocal ?? null;
  if (view === "ai") {
    for (const id of AI_PROVIDER_IDS) {
      const r = getAiResult(file, id);
      if (r) return r;
    }
    return file.resultAi ?? null;
  }
  if (AI_PROVIDER_IDS.includes(view)) return getAiResult(file, view);
  return null;
}

export function fileHasResult(file, view) {
  if (view === "compare-all") {
    return (
      Boolean(file.resultLocal) ||
      AI_PROVIDER_IDS.some((id) => getAiResult(file, id))
    );
  }
  return Boolean(getStoredResult(file, view));
}

export function listProvidersWithResults(files) {
  return AI_PROVIDERS.filter((p) => files.some((f) => getAiResult(f, p.id)));
}

export function resolveSlotForMode(mode, aiSettings) {
  if (mode === "local") return "local";
  if (mode === "ai") return "ai";
  return "auto";
}

export function fileResultForView(file, view) {
  if (view === "compare-all") {
    return getStoredResult(file, "local") || getStoredResult(file, "ai");
  }
  return getStoredResult(file, view);
}

export function filesWithViewResults(files, view) {
  const v = view === "compare-all" ? "local" : view;
  return files
    .map((f) => {
      const result = fileResultForView(f, v === "compare-all" ? "local" : v);
      return result ? { ...f, result } : null;
    })
    .filter(Boolean);
}

export function collectFindings(files, view) {
  const tag = (fi, analysisSource, fileName, sourcePath) => ({ ...fi, fileName, sourcePath, analysisSource });

  if (view === "compare-all") {
    return files.flatMap((f) => {
      const base = f.name.split("/").pop();
      const chunks = [];
      if (f.resultLocal) {
        chunks.push(
          ...(f.resultLocal.findings || []).map((fi) => tag(fi, "local", base, f.name)),
        );
      }
      for (const p of AI_PROVIDERS) {
        const r = getAiResult(f, p.id);
        if (r) {
          chunks.push(
            ...(r.findings || []).map((fi) => tag(fi, p.id, base, f.name)),
          );
        }
      }
      return chunks;
    });
  }

  const src = view === "ai" ? "ai" : view;
  return files.flatMap((f) => {
    const r = getStoredResult(f, src);
    if (!r) return [];
    const base = f.name.split("/").pop();
    const label = src === "local" ? "local" : src;
    return (r.findings || []).map((fi) => tag(fi, label, base, f.name));
  });
}

export function averageScore(files, view) {
  if (view === "compare-all") return null;
  const scores = files
    .map((f) => getStoredResult(f, view)?.overallScore)
    .filter((s) => typeof s === "number");
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function averageScoresBySource(files) {
  const out = { local: averageScore(files, "local") };
  for (const p of AI_PROVIDERS) {
    out[p.id] = averageScore(files, p.id);
  }
  return out;
}

export function countAnalysed(files, view) {
  if (view === "compare-all") {
    return files.filter((f) => fileHasResult(f, "compare-all")).length;
  }
  return files.filter((f) => fileHasResult(f, view)).length;
}

export function hasAnyAiResults(files) {
  return AI_PROVIDER_IDS.some((id) => files.some((f) => getAiResult(f, id)));
}

export function providersToRunOnUpload(aiSettings) {
  return getRunnableAiProviders(aiSettings).map((p) => p.id);
}

export { providerShortLabel };
