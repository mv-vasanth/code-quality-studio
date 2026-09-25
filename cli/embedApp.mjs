/**
 * Read the built web app so the CLI can inline it into `cqs --open` reports.
 *
 * Shared by build.mjs and build-binary.mjs — both need the identical defines,
 * and a binary that silently shipped without the app would be hard to spot.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function readBuiltApp({ quiet = false } = {}) {
  const assets = join(__dirname, "..", "dist", "assets");
  const warn = (msg) => { if (!quiet) console.log(msg); };

  if (!existsSync(assets)) {
    warn("\n  ! dist/assets not found — run `npm run build` at the repo root first.");
    warn("    Building without the embedded app; --open will fall back to the flat report.\n");
    return { js: "", css: "" };
  }
  const files = readdirSync(assets);
  const entryJs = files.find((f) => /^index-.*\.js$/.test(f));
  const entryCss = files.find((f) => /^index-.*\.css$/.test(f));
  if (!entryJs) {
    warn("\n  ! No index-*.js in dist/assets; --open will fall back to the flat report.\n");
    return { js: "", css: "" };
  }
  return {
    js: readFileSync(join(assets, entryJs), "utf8"),
    css: entryCss ? readFileSync(join(assets, entryCss), "utf8") : "",
  };
}

/** esbuild `define` entries for the embedded app. */
export function appDefines(app) {
  return {
    __CQS_APP_JS__: JSON.stringify(app.js),
    __CQS_APP_CSS__: JSON.stringify(app.css),
  };
}
