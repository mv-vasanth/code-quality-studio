# Proposal: file-based custom rules

**Status:** proposal — nothing implemented yet.

## The problem

Custom rules already work, but only in the web app. `src/rules/customRulesStorage.js`
persists them to `localStorage` under `cqs-custom-rules-<stackId>`, and
`src/analyzers/index.js` applies them via `runCustomRules()`.

The CLI and MCP server import each analyzer **directly** (`cqs.entry.js` imports
`../../src/analyzers/playwright.js`, not `analyzers/index.js`), so they never call
`runCustomRules()`. That means a custom rule:

- does not run in CI, where rules matter most
- is invisible to the MCP server, so AI agents never see it
- cannot be shared with the team
- is not reviewable in a pull request
- disappears when browser storage is cleared

A rule that encodes a team standard belongs next to the code it governs, not in one
person's browser.

## Proposed solution

A `cqs-rules.json` file committed to the repo, discovered automatically by the CLI,
the MCP server and the web app.

### Discovery

Starting from the audited path, walk up to the filesystem root and use the **first**
`cqs-rules.json` found. Stop at a `.git` directory boundary. An explicit
`--rules <path>` flag overrides discovery entirely; `--no-rules` disables it.

This matches how developers already expect `.eslintrc` / `.prettierrc` to behave, so
there is nothing new to learn.

### Format

```jsonc
{
  "$schema": "https://unpkg.com/cqs-audit/schema/cqs-rules.schema.json",
  "version": 1,

  // Turn off built-in rules that do not apply to this repo
  "disabled": ["PW-SEL-002", "SEL-J-LOC-002"],

  // Raise or lower the severity of a built-in rule
  "severityOverrides": {
    "PW-STD-007": "warning"
  },

  "rules": [
    {
      "id": "ACME-001",
      "stacks": ["playwright", "cypress"],   // omit or "*" for every stack
      "category": "selectors",               // must be valid for each listed stack
      "severity": "critical",
      "title": "Use data-qa, not data-testid",
      "match": { "type": "regex", "pattern": "getByTestId\\(", "flags": "i" },
      "message": "This codebase standardised on data-qa.",
      "fix": "page.locator('[data-qa=\"submit\"]')",
      "reference": "https://wiki.acme.com/frontend/selectors"
    },
    {
      "id": "ACME-002",
      "stacks": ["*"],
      "category": "security",
      "severity": "critical",
      "title": "No internal hostnames in tests",
      "match": { "type": "regex", "pattern": "https?://[\\w.-]*\\.internal\\.acme\\.com" },
      "message": "Point at the environment via BASE_URL instead."
    }
  ]
}
```

The `match` object is deliberately an object rather than a bare string so
`{ "type": "notPresent" }` and other match kinds can be added later without a
breaking format change.

### Precedence

Later entries win, so a developer can always relax a rule locally:

1. built-in rules
2. `cqs-rules.json` found by discovery
3. `--rules <path>`
4. `--disable <id>` on the command line

### Validation

Invalid rules must **warn and skip**, never crash an audit — the existing
`runCustomRules()` already swallows bad regexes, and file-based rules should behave
the same way. Validate on load and print one clear line per problem:

```
cqs-rules.json: rule ACME-003 skipped — category "selectors" is not valid for stack
                java_api (valid: api_design, security, data_access, …)
```

A `cqs --validate-rules` subcommand would let CI fail fast on a malformed file.

### Migration from localStorage

Add an **Export to cqs-rules.json** button to the Rules tab that serialises the
current localStorage rules into this format. The web app then prefers the file when
one is present and shows a read-only banner explaining that rules are now
project-managed, with an explicit override to keep editing locally.

## Scope

Small, and mostly reuse:

| Change | Where | Notes |
|---|---|---|
| Loader + discovery walk | new `src/rules/fileRules.js` | ~80 lines |
| Wire into CLI | `cli/bin/cqs.entry.js` | load once, pass into each analyzer call |
| Wire into MCP | `cli/bin/cqs-mcp.entry.js` | plus a `rules_file` tool argument |
| Web app reads the same file | `src/rules/customRulesStorage.js` | keep localStorage as the fallback |
| `--rules` / `--no-rules` / `--validate-rules` | `cli/bin/cqs.entry.js` | flag parsing |
| JSON schema for editor autocomplete | new `schema/cqs-rules.schema.json` | ships in the npm package |

The matching engine itself already exists in `runCustomRules()` and can be reused
unchanged — the only real new work is discovery, validation and threading the rules
through the two entry points.

## Driving custom rules through MCP

A file-based format is what makes this possible — an agent cannot meaningfully
interact with rules trapped in someone's `localStorage`, but it can read, validate
and reason about a JSON file in the repo.

The loop this enables: the agent audits the suite, notices a recurring pattern the
built-in rules miss, drafts a rule, checks it against the codebase, and the team
commits it. The agent doing this already has full repo context, which is strictly
better input than the file samples `src/services/ai/suggestRules.js` currently ships
off to a separate provider.

### Proposed tools

| Tool | Kind | Purpose |
|---|---|---|
| `cqs_list_rules` | read | Built-in + custom rules for a stack, with enabled/disabled state. Lets the agent check whether a pattern is already covered before inventing a rule. |
| `cqs_validate_rules` | read | Validate `cqs-rules.json` — category valid for stack, regex compiles, no duplicate IDs. Returns per-rule errors. |
| `cqs_test_rule` | read | **The important one.** Takes a candidate rule and a path, runs it *without saving*, and returns what it would match. Turns "this regex looks right" into "this regex matches 4 real lines, and here they are". |
| `cqs_audit` (extend) | read | Add `rules_file` and `include_custom` arguments. |

### Deliberately no write tool

`cqs_add_rule` is the obvious fifth tool, and I think it is the wrong call.

The host agent — Claude Code, Cursor — already has file editing that runs through the
user's own approval and diff review. A write tool inside the MCP server would
duplicate that while bypassing the review, so a rule could land in the repo with less
scrutiny than any other code change. Rules are policy: they gate other people's
pull requests, and they deserve at least as much review as the code they govern.

So the flow is: the agent calls `cqs_test_rule` to prove the rule matches what it
claims, shows the user the JSON and the evidence, and then writes it with its normal
file-edit tool where the user sees a diff and approves.

`cqs_test_rule` is what makes this trustworthy — without it an agent is guessing at
regexes, and a plausible-looking rule that silently matches nothing is worse than no
rule, because the team believes they are covered.

### Example exchange

```
User:  Everyone keeps using cy.wait with a number. Make that a rule.

Agent: [cqs_list_rules stack=cypress]            -> not already covered
       [cqs_test_rule  pattern="cy\.wait\(\s*\d+" path=./cypress/e2e]
         -> 12 matches across 5 files, sample: checkout.cy.ts:44

       Found 12 real occurrences. Proposed rule:
         { "id": "ACME-010", "severity": "warning", "category": "commands", ... }
       Add it to cqs-rules.json?

User:  yes

Agent: [edits cqs-rules.json — user reviews the diff and approves]
```

## Open questions

1. **Per-rule file scoping.** Worth adding `"include": ["tests/e2e/**"]` so a rule
   can target part of a repo, or is stack-level targeting enough to start?
2. **Shareable rule packs.** Should `"extends": "@acme/cqs-rules"` resolve a rule
   pack from npm, so several repos share one standard? Useful, but it pulls package
   resolution into the CLI, which is currently dependency-free by design.
3. **One finding per rule per file.** `runCustomRules()` currently breaks after the
   first match to keep output readable. For file-based rules that run in CI, every
   occurrence is probably wanted — likely a per-rule `"reportAll": true`.
4. **What happens to `suggestRules.js`?** It solves the same problem from the web
   app by calling a configured AI provider directly. Once the MCP path exists there
   are two ways to get a suggested rule. Keep both (the web app has no agent
   attached), or retire it in favour of MCP and drop a provider dependency?
