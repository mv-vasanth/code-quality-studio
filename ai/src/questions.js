/**
 * What we ask the local model about a piece of test code.
 *
 * The static rules already catch everything with a reliable textual signature —
 * `waitForTimeout`, a missing `expect`, an XPath string. What they cannot judge
 * is the fuzzy half: whether a selector is *fragile*, whether a test does one
 * thing or five, whether the file looks like a page object or like a script
 * with page-object naming. Those are judgements, and a small classifier is a
 * better judge of them than another regex.
 *
 * Three question shapes, deliberately narrow:
 *
 *   boolean  — "is this true of the code?"            → probability
 *   choice   — "which of these describes it best?"    → label + distribution
 *   score    — ordered levels, lowest first           → expected level
 *
 * Nothing here asks the model to *write* anything. A classifier that returns a
 * label and a probability can be thresholded, calibrated and tested; free text
 * cannot, and it is the part of "AI review" that makes findings untrustworthy.
 */

/** @typedef {{ id: string, type: "boolean"|"choice"|"score", category: string, severity: string, hypothesis?: string, labels?: string[], title: string, describe: (a: any) => string }} LocalQuestion */

/** @type {LocalQuestion[]} */
export const AUDIT_QUESTIONS = [
  {
    id: "fragile-selectors",
    type: "boolean",
    category: "selectors",
    severity: "warning",
    title: "Selectors look fragile",
    // Phrased as an NLI hypothesis: the model scores how well this entails
    // the code. Short, concrete hypotheses score far better than long ones.
    hypothesis:
      "This test finds elements by their position, deep CSS path or generated class names, which break when the page markup changes.",
    describe: (a) =>
      `The locators in this file look positional or markup-coupled (${pct(a.probability)} confidence). ` +
      `Prefer role, label or test-id based locators that survive a refactor.`,
  },
  {
    id: "test-scope",
    type: "choice",
    category: "structure",
    severity: "warning",
    title: "Test does several unrelated things",
    labels: [
      "a single focused scenario",
      "one scenario with its setup",
      "several unrelated scenarios in one test",
    ],
    describe: (a) =>
      `Reads as ${a.choice} (${pct(a.confidence)} confidence). ` +
      `A test that covers several scenarios cannot tell you which one broke.`,
  },
  {
    id: "page-object-adherence",
    type: "boolean",
    category: "structure",
    severity: "info",
    title: "Page interaction mixed into the test",
    hypothesis:
      "This test drives the page directly with selectors and low-level actions instead of calling methods on a page object.",
    describe: (a) =>
      `Selectors and page mechanics appear inline rather than behind a page object (${pct(a.probability)} confidence). ` +
      `Moving them keeps the test readable as a scenario.`,
  },
  {
    id: "assertion-strength",
    type: "score",
    category: "assertions",
    severity: "warning",
    title: "Assertions are weak",
    // index 0 = worst. The expected level is what gets reported.
    labels: [
      "the test asserts almost nothing meaningful",
      "the test checks that something exists",
      "the test checks specific expected values",
    ],
    describe: (a) =>
      `Assertion strength scored ${a.score.toFixed(1)} of ${a.levels - 1} — "${a.level}". ` +
      `Checking presence alone passes even when the value is wrong.`,
  },
];

function pct(n) {
  return `${Math.round(n * 100)}%`;
}
