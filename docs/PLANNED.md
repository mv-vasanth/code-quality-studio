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
