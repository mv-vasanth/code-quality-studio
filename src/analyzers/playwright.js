import { analysePlaywrightLocally } from "../localAnalyzer.js";

// options carries disabledRuleIds — dropping it silently ignored every rule
// the user turned off, for the one stack that gets used most.
export function analysePlaywright(filename, content, options = {}) {
  return analysePlaywrightLocally(filename, content, options);
}
