import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { defaultCacheDir } from "./backend.js";

export const MODEL_REGISTRY = [
  {
    id: "deberta-xsmall",
    name: "DeBERTa v3 xsmall",
    hf: "Xenova/nli-deberta-v3-xsmall",
    size: "104 MB",
    approach: "nli",
    note: "balanced accuracy and size",
    default: true,
  },
  {
    id: "distilbert",
    name: "DistilBERT MNLI",
    hf: "Xenova/distilbert-base-uncased-mnli",
    size: "67 MB",
    approach: "nli",
    note: "slightly smaller, similar accuracy",
  },
  {
    id: "mobilebert",
    name: "MobileBERT MNLI",
    hf: "Xenova/mobilebert-uncased-mnli",
    size: "28 MB",
    approach: "nli",
    note: "lightest NLI option, noticeably blunter",
  },
  {
    id: "minilm",
    name: "MiniLM L6",
    hf: "Xenova/all-MiniLM-L6-v2",
    size: "23 MB",
    approach: "embeddings",
    note: "fastest — embedding-based classifier",
  },
];

function configPath() {
  return join(homedir(), ".cqz", "ai-config.json");
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  const dir = join(homedir(), ".cqz");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(), JSON.stringify(data, null, 2));
}

export function getActiveModelId() {
  return readConfig().activeModel ?? null;
}

export function getActiveModelHf() {
  const id = getActiveModelId();
  if (!id) return null;
  return MODEL_REGISTRY.find(m => m.id === id)?.hf ?? null;
}

export function setActiveModel(id) {
  const model = MODEL_REGISTRY.find(m => m.id === id);
  if (!model) throw new Error(`Unknown model id "${id}". Run \`cqz-ai model list\` to see available ids.`);
  const config = readConfig();
  config.activeModel = id;
  writeConfig(config);
  return model;
}

export function isInstalled(hfId) {
  const modelDir = join(defaultCacheDir(), ...hfId.split("/"));
  return existsSync(modelDir);
}

export function removeModel(id) {
  const model = MODEL_REGISTRY.find(m => m.id === id);
  if (!model) throw new Error(`Unknown model id "${id}".`);
  const modelDir = join(defaultCacheDir(), ...model.hf.split("/"));
  if (!existsSync(modelDir)) return { removed: false, model };
  rmSync(modelDir, { recursive: true, force: true });
  return { removed: true, model };
}
