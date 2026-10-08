# Planned — not built yet

Ideas with enough thinking behind them to be worth keeping, but deliberately
not started. Each records why it matters and what would make it wrong, so
whoever picks it up inherits the reasoning rather than just the title.

---

## Unfinished-code rule pack ("vibe-coded apps")

**Status:** planned. Partially seeded by `PW-STD-006` (Playwright only) and the
`Unresolved TODO/FIXME` rules in several stacks.

### The constraint that shapes it

You cannot detect that code was written by an AI, and the pack must never
claim to. `PW-STD-006` already words this correctly:

> "This flags stubs and leftover assistant text, **not proof of AI
> authorship**."

Keep that framing. The first time a rule tells someone their hand-written code
is "AI-generated", the tool loses credibility and gets switched off. What is
detectable, and what actually causes harm, is **code shipped before it was
finished** — regardless of who or what wrote it.

### Signals worth rules

| Signal | Confidence | Notes |
|---|---|---|
| Placeholder values (`your-api-key`, `example.com`, `foo`) outside tests | high | Unambiguous when not in a fixture |
| Mock or stub returned from a non-test path (`return mockData`) | high | Usually a real bug, not a style issue |
| Empty `catch {}` blocks | high | Swallows failures silently |
| `TODO: implement` / `FIXME` in shipped code | high | Unfinished by definition |
| `any` proliferation in TypeScript | medium | Count-based; one `any` is not a finding |
| Near-identical duplicated blocks | medium | Needs a similarity threshold, not a regex |
| Unused imports and unreferenced functions | medium | Cross-file analysis; currently out of scope |
| Comments restating the code (`// increment i`) | low | Weak alone; only meaningful in volume |

### How to build it

Cross-stack, not Playwright-only — the symptoms appear in application code
more than in tests. Every rule needs a vulnerable/safe fixture pair in
`test/security-rules.mjs` style: proven to fire on the symptom **and** stay
silent on legitimate code. The false-positive half is the one that matters;
a rule that flags a legitimate `catch {}` with a comment explaining why it is
empty will get the whole pack disabled.

### On making it a paid feature

Tempting, but weak. Rules are regexes in a public npm package — anyone can
read them and reimplement in an afternoon. A rule pack is a good marketing
hook ("audit your AI-generated code") and a poor moat.

If this is ever monetised, the defensible part is the server side: history,
trend over time, policy across repositories, dashboards. Rules attract
people; the server retains them. Recommend shipping this free.

---

## Deterministic hard-wait codemod

**Status:** planned.

One real suite has 824 `waitForTimeout` calls across 61 page objects. The
`remediate` agent can fix them with a model, but at that volume it is slow,
costs money, and every fix needs reviewing.

Many are mechanically removable: Playwright auto-waits before actions, so a
`waitForTimeout` immediately followed by a click or fill on a locator is
usually just deletable. A codemod could handle that provable shape with no
model at all, re-auditing each file afterwards exactly as `remediate` already
does, and leave the ambiguous cases to the AI agent.

Keep it conservative. A codemod that removes a wait which was load-bearing
turns a slow test into a flaky one, which is worse.

---

## One combined HTML report for a polyglot repo

**Status:** planned. Mitigated, not solved.

A repo with several stacks produces one report per stack. Today only the
largest opens in a browser and the rest print their paths, named by stack —
which stops six tabs appearing but still leaves six files.

The obstacle is structural rather than cosmetic. The report embeds the web
app, and the app's workspace carries a single `stackId`; its category rows,
coverage radar, roadmap and practices checklist all come from that one
stack's category set. Two stacks in one workspace would render blank
category rows for whichever files do not match — the same failure that
stopped per-file stack routing being silent in the app.

Doing it properly means either:

- the workspace holds several stacks and the app gains a stack switcher, with
  each view scoped to the selected one; or
- the report renders one section per stack, each with its own categories, and
  the overview aggregates across them.

The second is less invasive and probably right: a report is a document, and
documents can repeat a section. The first is better if the app itself should
ever open a polyglot workspace.

Not urgent. It only affects repos with more than one stack, and the per-stack
reports are each complete and correct.

---

## Suppressing a finding from the code

Every linter eventually needs an escape hatch, because every rule eventually
meets the case it was wrong about. The usual shape, and the one people will
expect here:

```ts
// cqs-ignore-next-line PW-REL-001 — third-party widget animates on a timer
await page.waitForTimeout(500);

// cqs-ignore-file PW-A11Y-002 — covered by the separate axe suite
```

Three things make this more than a regex:

- **It must be a rule id, never a bare `cqs-ignore`.** A blanket suppression
  silences rules written after it was added, which is how a file quietly
  stops being audited at all.
- **The reason should be required.** A suppression without one is
  indistinguishable from a suppression nobody remembers the reason for, and
  the second kind is permanent.
- **Suppressions belong in the report**, counted and listed. A score that
  improves because findings were suppressed is not an improvement, and the
  baseline (`cqz-baseline.json`) already makes the honest version of that
  trade-off available.

Worth pairing with a `--no-suppressions` flag so CI can see the unsuppressed
truth, and an age or count report so a growing pile is visible.

Blocked on the same work as the item below: the matcher has to understand
where comments are before it can read directives out of them.

## Comments are matched as if they were code

`lineMatches` and `countMatches` run regexes over the raw file, so a rule
cannot tell live code from code someone commented out. A spec whose only
`waitForTimeout` calls are commented out reports two criticals today —
verified, not theoretical.

The fix is a comment mask: rewrite the source with comment bodies replaced by
spaces, keeping every line and column so reported line numbers stay correct,
then match against the mask. It cannot be a naive `//` strip — `'//div[@id]'`
is an XPath and `https://…` is a URL, so the mask has to know when it is
inside a string literal.

About fourteen rules match comments deliberately (TODO/FIXME, commented-out
Tosca steps); those keep the raw text through a `lineMatchesRaw` variant.

This changes almost every number the tool reports, so it needs the golden
master re-baselined in the same change.
