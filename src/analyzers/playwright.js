import { analysePlaywrightLocally } from "../localAnalyzer.js";

export function analysePlaywright(filename, content) {
  return analysePlaywrightLocally(filename, content);
}
