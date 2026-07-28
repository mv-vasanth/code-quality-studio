const DB_NAME = "pqs-workspace-v1";
const STORE = "meta";
const SESSION_KEY = "current";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txPut(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, SESSION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txGet(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(SESSION_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function txDelete(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(SESSION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Infer folder label from webkitRelativePath-style names. */
export function inferFolderHint(fileNames) {
  if (!fileNames?.length) return "";
  const first = fileNames[0];
  if (!first.includes("/")) return "";
  const parts = first.split("/");
  if (parts.length >= 2) return parts.slice(0, -1).join("/");
  return parts[0];
}

function serializeFile(f) {
  return {
    name: f.name,
    content: f.content,
    status: f.status === "analysing" ? "done" : f.status,
    resultLocal: f.resultLocal ?? null,
    resultsAi: f.resultsAi ?? {},
    errorsAi: f.errorsAi ?? {},
    error: f.error ?? null,
    lastAiError: f.lastAiError ?? null,
  };
}

/**
 * @param {{ stackId: string, projectName: string, folderHint: string, resultsView: string, files: object[] }} session
 */
export async function saveWorkspace(session) {
  if (!session?.files?.length) {
    await clearWorkspace();
    return;
  }
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    stackId: session.stackId,
    projectName: session.projectName,
    folderHint: session.folderHint || inferFolderHint(session.files.map((f) => f.name)),
    resultsView: session.resultsView,
    files: session.files.map(serializeFile),
  };
  const db = await openDb();
  await txPut(db, payload);
  db.close();
}

export async function loadWorkspace() {
  try {
    const db = await openDb();
    const data = await txGet(db);
    db.close();
    if (!data?.files?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export async function clearWorkspace() {
  try {
    const db = await openDb();
    await txDelete(db);
    db.close();
  } catch {
    /* ignore */
  }
}
