const MIGRATION_FLAG = "cqs-storage-migrated-v1";

// The CLI and app were renamed pqs -> cqs, which changed every localStorage key.
// Without this, saved checklists, custom rules and AI settings would silently vanish.
export function migrateLegacyStorage() {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith("pqs-")) continue;
    const renamed = "cqs-" + key.slice(4);
    if (localStorage.getItem(renamed) === null) {
      localStorage.setItem(renamed, localStorage.getItem(key));
    }
  }

  localStorage.setItem(MIGRATION_FLAG, "1");
}
