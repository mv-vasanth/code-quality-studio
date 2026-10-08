# Renaming to Code Quality Zone (`cqz`)

The product was **Code Quality Studio / `cqs-audit`** and is now **Code Quality Zone /
`cqz-audit`**. This is what changed, what deliberately did *not*, and what still has to be
done by hand on npmjs.com.

It is the second rename — `pqs` → `cqs` happened before — which is why the storage migration
is a list rather than a special case.

---

## The rule that shaped all of it

A name appearing in the codebase is one of two things, and they cannot be treated alike:

- **Branding** — titles, help text, docs. Rename freely.
- **A contract** — a filename in someone's repository, a localStorage key in their browser, a
  tool name in their agent config, an HTTP header. Renaming these does not fail loudly; it
  silently stops finding their data.

Everything below follows from that.

---

## Done, and safe

| Was | Now | Note |
|---|---|---|
| Code Quality Studio | Code Quality Zone | 47 occurrences, 33 files |
| `cqs-audit` | `cqz-audit` | package name |
| `cqs` / `cqs-mcp` | `cqz` / `cqz-mcp` | **`cqs` and `cqs-mcp` still work** — both are declared in `bin`, so existing scripts and CI do not break on upgrade |
| `dist/cqs.js` | `dist/cqz.js` | build output + `files` |
| `cqs-cheatsheet.*` | `cqz-cheatsheet.*` | |
| `~/.cqs/addons` | `~/.cqz/addons` | add-on install root |
| `__CQS_*`, `CQS_VERSION` | `__CQZ_*`, `CQZ_VERSION` | build-time only, never persisted |
| `x-cqs-token` | `x-cqz-token` | **server accepts both** for one release — a browser tab left open across an upgrade still sends the old header |

## Done, with a compatibility path

| Contract | Handling |
|---|---|
| `cqs-rules.json` | `cqz-rules.json` preferred; **the old name is still discovered**. Checked per directory, so a `cqs-rules.json` beside the tests still beats a `cqz-rules.json` further up. |
| `cqs-baseline.json` | Both names excluded from auditing, so an un-migrated repo does not get its baseline audited as a Postman collection. |
| `localStorage` keys | `migrateLegacyStorage` walks `pqs-` → `cqs-` → `cqz-` before the app mounts, **copying** (not moving) anything not already present under the newer name. A downgrade still finds the old data. |
| MCP tools `cqs_*` | Renamed to `cqz_*`. `tools/list` advertises only the new names, but the dispatcher still accepts `cqs_*`, so a saved agent prompt naming `cqs_audit` keeps working. |

## Deliberately NOT renamed

- **IndexedDB `cqs-workspace-v1`.** Renaming means writing a store-to-store migration or
  discarding saved workspaces. The name is never surfaced to anyone. A cosmetic rename is not
  worth a migration that can lose a session.

---

## Still to do by hand — npm

This is the part no commit can do.

**1. The first `cqz-audit` publish cannot use trusted publishing.** npm configures a Trusted
Publisher per package, and a package that does not exist has no settings page. Options, best
first:

- `npm publish` from a machine logged in with a **granular access token** scoped to publish
  `cqz-audit`. Works with a security-key-only account, because a granular token is not a 2FA
  bypass.
- Or publish a `0.0.0` placeholder by whatever means works, configure the Trusted Publisher,
  then let CI take over.

**2. Add the Trusted Publisher** — npmjs.com → `cqz-audit` → Settings → Trusted Publisher:

```
Provider:    GitHub Actions
Owner:       mv-vasanth
Repository:  code-quality-studio
Workflow:    publish.yml
Environment: (blank)
```

and the same for `cqz-ai` with `Workflow: publish-ai.yml`.

**3. Point the old package at the new one.** Do not unpublish — it breaks everyone who depends
on it:

```bash
npm deprecate cqs-audit "Renamed to cqz-audit (Code Quality Zone) — install that instead"
```

Keep `cqs-audit` installable. People find it from old links and blog posts for years.

**4. If you rename the GitHub repository**, the OIDC subject changes and **every** Trusted
Publisher entry pointing at `code-quality-studio` stops working — publishing fails with a 404
that reads like a missing package. Update the entries first, or rename the repo and expect to
fix them immediately after. Given how long trusted publishing took to get working, do the repo
rename as its own deliberate step, never folded into a release.

---

## What a user sees

Already on `cqs-audit`:

```bash
npm install -g cqz-audit     # cqs and cqz both work afterwards
npm uninstall -g cqs-audit   # when they are ready
```

Their `cqs-rules.json` keeps working. Their saved settings, checklists and custom rules migrate
on first load. Their MCP config keeps working until they re-run `cqz mcp-config`.

Nothing about this rename requires a user to do anything on the day it ships. That was the
point.
