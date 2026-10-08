/**
 * How many built-in rules there are, counted rather than typed.
 *
 * The number was hardcoded in eight places — help text, two cheatsheets, the
 * README, three docs — and had drifted to "530" and "533" while the real
 * figure moved past both. A marketing number nobody can reproduce is worse
 * than no number, so this derives it from the analyzers themselves at build
 * time and the places that quote it read it from here.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

/** Every `ruleId: "..."` literal under a directory, de-duplicated. */
export function collectRuleIds(root) {
  const ids = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      // node_modules has its own "ruleId" strings; test fixtures are deliberate
      // fakes. Counting either would inflate the number.
      if (name === "node_modules" || name === "dist" || name === "test") continue;
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) { walk(p); continue; }
      if (![".js", ".jsx", ".mjs"].includes(extname(name))) continue;
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/ruleId:\s*"([A-Z][A-Z0-9-]{4,})"/g)) ids.add(m[1]);
    }
  };
  walk(root);
  return ids;
}

export function countRules(root) {
  return collectRuleIds(root).size;
}
