/**
 * Carry saved state across product renames.
 *
 * The prefix on every localStorage key is the product's short name, so each
 * rename invalidates all of them: saved checklists, custom rules, rule
 * toggles and AI settings would silently vanish and look like data loss.
 * This has happened twice — pqs → cqs, then cqs → cqz — so it is a list
 * rather than a special case.
 *
 * Copies rather than moves. A user who downgrades should still find their
 * data under the old name, and the cost is a few kilobytes of duplication.
 */
const RENAMES = [
  { from: "pqs-", to: "cqs-" },
  { from: "cqs-", to: "cqz-" },
];

const MIGRATION_FLAG = "cqz-storage-migrated-v1";

export function migrateLegacyStorage() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;

    // In order, so a key last written under "pqs-" reaches "cqz-" in one pass
    // rather than needing the user to open the app twice.
    for (const { from, to } of RENAMES) {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(from)) continue;
        const renamed = to + key.slice(from.length);
        // Never overwrite: anything already saved under the new name is newer
        // than whatever the old name holds.
        if (localStorage.getItem(renamed) === null) {
          localStorage.setItem(renamed, localStorage.getItem(key));
        }
      }
    }

    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // Private mode, or storage full. Losing the migration is survivable;
    // throwing here would stop the app booting at all.
  }
}
