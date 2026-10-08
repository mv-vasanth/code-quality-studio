/**
 * The hybrid audit: deterministic rules first, a small local classifier second.
 *
 *   auditTestCode(code) → { findings, static: {...}, model: {...} }
 *
 * The model never overrules the rules and never invents a finding type. It
 * answers a fixed list of questions (src/ai/local/questions.js) and each answer
 * becomes a finding only when it clears a threshold — so every AI finding is
 * reproducible from a probability you can see, argue with, and tune.
 *
 * By default the model runs in a child process (see isolated.js): measured
 * here, disposing it in-process returns 119 MB of the 470 MB it took, while
 * killing the process returns all of it. Pass `inProcess: true` if you would
 * rather have one process and can live with that.
 */
import { getClassifier, clip } from "./backend.js";
import { auditIsolated } from "./isolated.js";
import { AUDIT_QUESTIONS } from "./questions.js";
import { runStaticChecks } from "./staticChecks.js";

/**
 * How sure the model has to be before we are willing to put it in front of a
 * human. Set from how these questions behave rather than from taste: a
 * zero-shot NLI head is confidently right well above this and roughly a coin
 * toss below it, and a wrong "AI finding" costs more trust than a missed one
 * gains.
 */
const DEFAULT_THRESHOLD = 0.65;

/**
 * @param {string} codeText
 * @param {object} [opts]
 * @param {(code: string) => {findings: Array, passed: boolean}} [opts.staticChecker]
 *        Defaults to the built-in gate. Pass the real analyzer to use all 500+ rules.
 * @param {boolean} [opts.alwaysRunModel]  Run the model even when static checks fail.
 * @param {number}  [opts.threshold]
 * @param {string}  [opts.model]
 * @param {string}  [opts.cacheDir]
 * @param {string[]} [opts.only]           Restrict to these question ids.
 * @param {boolean} [opts.inProcess]       Skip the child process. Simpler, but
 *                                         the model's memory is not fully
 *                                         reclaimable until the process exits.
 */
export async function auditTestCode(codeText, opts = {}) {
  // Isolation is a property of *where* this runs, so it is decided before any
  // work: the child re-enters this function with inProcess set and does the
  // real audit there.
  if (!opts.inProcess) return auditIsolated(codeText, opts);

  const started = Date.now();
  const code = clip(codeText);
  const checker = opts.staticChecker ?? runStaticChecks;
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  const staticResult = checker(code);
  const findings = [...(staticResult.findings ?? [])];

  // The contract you asked for: the model is the *second* opinion, consulted
  // when the cheap pass found nothing to say. `alwaysRunModel` exists because
  // when you are tuning thresholds you want both halves on the same file.
  const shouldAsk = staticResult.passed || opts.alwaysRunModel;
  if (!shouldAsk) {
    return result(findings, staticResult, null, started, "skipped: static checks failed");
  }
  if (!code.trim()) {
    return result(findings, staticResult, null, started, "skipped: empty input");
  }

  let pipe;
  try {
    pipe = await getClassifier({ model: opts.model, cacheDir: opts.cacheDir, onProgress: opts.onProgress });
  } catch (e) {
    // A missing optional dependency is a configuration state, not a failure of
    // the audit. The static findings are still real and still returned.
    return result(findings, staticResult, null, started, e.code === "CQS_LOCAL_AI_MISSING" ? e.message : `model unavailable: ${e.message}`);
  }

  const questions = opts.only?.length
    ? AUDIT_QUESTIONS.filter((q) => opts.only.includes(q.id))
    : AUDIT_QUESTIONS;

  const answers = {};
  for (const q of questions) {
    try {
      const answer = await ask(pipe, code, q);
      answers[q.id] = answer;
      const f = toFinding(q, answer, threshold);
      if (f) findings.push(f);
    } catch (e) {
      answers[q.id] = { error: e.message };
    }
  }

  return result(findings, staticResult, { answers, questions: questions.length }, started, null);
}

/** One question → one answer, in the shape the question declared. */
async function ask(pipe, code, q) {
  if (q.type === "boolean") {
    // Zero-shot with a complementary pair rather than a single label: a
    // one-label run normalises to 1.0 and tells you nothing.
    const out = await pipe(code, [q.hypothesis, negate(q.hypothesis)]);
    const probability = out.scores[out.labels.indexOf(q.hypothesis)] ?? 0;
    return { type: "boolean", probability };
  }

  if (q.type === "choice") {
    const out = await pipe(code, q.labels);
    const probabilities = Object.fromEntries(out.labels.map((l, i) => [l, out.scores[i]]));
    return {
      type: "choice",
      choice: out.labels[0],
      confidence: out.scores[0],
      probabilities,
    };
  }

  // score: ordered levels, reported as the expected level so that a model
  // split between "exists" and "specific" lands between them rather than
  // picking one and discarding the doubt.
  const out = await pipe(code, q.labels);
  const byLabel = Object.fromEntries(out.labels.map((l, i) => [l, out.scores[i]]));
  const expected = q.labels.reduce((sum, label, i) => sum + i * (byLabel[label] ?? 0), 0);
  const nearest = q.labels[Math.round(expected)] ?? q.labels[0];
  return {
    type: "score",
    score: expected,
    levels: q.labels.length,
    level: nearest,
    probabilities: byLabel,
  };
}

/** An answer becomes a finding only when it is both bad and confident. */
function toFinding(q, a, threshold) {
  const base = {
    ruleId: `LOCAL-AI-${q.id.toUpperCase()}`,
    category: q.category,
    severity: q.severity,
    title: q.title,
    source: "local-model",
    answer: a,
  };

  if (a.type === "boolean") {
    if (a.probability < threshold) return null;
    return { ...base, description: q.describe(a), confidence: a.probability };
  }

  if (a.type === "choice") {
    // Convention: the last label is the bad one. Keeping the ordering
    // meaningful is what lets this stay generic across questions.
    const worst = q.labels[q.labels.length - 1];
    if (a.choice !== worst || a.confidence < threshold) return null;
    return { ...base, description: q.describe(a), confidence: a.confidence };
  }

  // score: flag when the expected level sits in the bottom half.
  const midpoint = (q.labels.length - 1) / 2;
  if (a.score >= midpoint) return null;
  const confidence = 1 - a.score / midpoint;
  if (confidence < threshold) return null;
  return { ...base, description: q.describe(a), confidence };
}

/** Turn a hypothesis into its opposite for the boolean pair. */
function negate(hypothesis) {
  return `It is not true that ${hypothesis.charAt(0).toLowerCase()}${hypothesis.slice(1)}`;
}

function result(findings, staticResult, model, started, note) {
  return {
    findings,
    static: { count: staticResult.findings?.length ?? 0, passed: staticResult.passed },
    model: model ? { ...model, ran: true } : { ran: false, note },
    note: note ?? undefined,
    ms: Date.now() - started,
  };
}
