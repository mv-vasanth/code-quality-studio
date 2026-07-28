# How scores are calculated

This is the single source of truth for the numbers shown in the studio (Overview, Files,
Coverage Radar, and reports). It applies to **Rules** results. AI results carry their own scores.

## Rules scoring (deterministic)

Implemented in `src/analyzers/analyzerUtils.js` (`scoreFromFindings` + `buildAuditResult`);
the Playwright analyzer uses an identical copy in `src/localAnalyzer.js`.

1. **Every category starts at 100.**
2. For each finding in that category, subtract points by severity:

   | Severity | Points |
   |----------|--------|
   | Critical | −18 |
   | Warning  | −10 |
   | Info     | −4 |

3. A category score is **clamped to the 0–100 range** (`Math.max(0, Math.min(100, s))`), so it
   never goes negative no matter how many findings land in it.
4. **Overall score = the rounded average of all category scores** for the active stack
   (`Math.round(sum / categoryCount)`). Each stack defines its own categories in
   `src/stacks/definitions.js` (Playwright, Java, and TypeScript each have 10).

### Worked example (one category)

Starting at 100, a category with 1 critical + 2 warnings scores:
`100 − 18 − 10 − 10 = 62`.

### What "100" means

A category shows **100** when the standard rules found nothing to flag there. Rules are
**heuristic** (regex/pattern checks), so 100 means *"nothing flagged,"* not *"provably perfect."*
Deeper judgment is what the optional AI review adds.

## Grades

From `scoreGrade` in `src/shared/theme.js`:

| Grade | Range | Label |
|-------|-------|-------|
| A | 90–100 | Excellent |
| B | 80–89  | Good |
| C | 70–79  | Acceptable |
| D | 55–69  | Needs work |
| F | 0–54   | Poor |

## AI scoring

When you view a provider (Claude / Bedrock / Gemini) or **Compare all**, the `overallScore` and
`categoryScores` come from the **model's own assessment** in its JSON response — not the formula
above. That's why an AI score can differ from the Rules score for the same file. The provider is
prompted with the same stack best practices (`src/constants/stackAiPrompts.js`), but it is not
bound to the −18/−10/−4 weighting.

## Where it surfaces

- **Overview** — average quality score stat, per-file score rings, and an in-app
  "How are scores calculated?" explainer (`src/components/analysis/ScoringExplainer.jsx`).
- **Coverage Radar** — per-category averages across analysed files.
- **Reports** — `src/report/buildPayload.js` averages `overallScore` across analysed files for the
  report summary and grade.
