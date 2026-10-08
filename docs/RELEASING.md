# Releasing

> **First release of `cqz-audit` — read this before anything else.**
>
> npm configures trusted publishing **per package**, and a package that does not
> exist yet has no settings page to configure. So the very first publish of each
> cannot use OIDC: pushing a tag runs the workflow and fails at the publish step
> with a 404 that reads like a missing package.
>
> Both workflows therefore have a one-time **bootstrap** path. It is opt-in, so
> it can never be taken by accident, and it exists to be deleted.
>
> 1. **Create a granular access token** on npmjs.com — Access Tokens →
>    Generate New Token → Granular. Give it *Read and write* on `cqz-audit`.
>    A granular token is not a 2FA bypass, so it works
>    with a security-key-only account.
> 2. **Add it as a repository secret** — Settings → Secrets and variables →
>    Actions → New repository secret, named exactly `NPM_TOKEN`.
> 3. **Run the workflow once with bootstrap ticked** — Actions →
>    *Publish to npm* → Run workflow → tick **bootstrap** → Run. It fails early
>    with a clear message if the secret is missing, rather than halfway through.
>    (`cqz-ai` is already published and is **not** being released again — see
>    [ai/README.md](../ai/README.md).)
> 4. **Add the Trusted Publisher for each package** now that they exist —
>    npmjs.com → package → Settings → Trusted Publisher → GitHub Actions,
>    owner `mv-vasanth`, repository `code-quality-studio`, workflow
>    `publish.yml`, environment blank.
> 5. **Delete the `NPM_TOKEN` secret.** Every release after this goes out over
>    OIDC with no token stored anywhere. The bootstrap run prints a warning
>    reminding you to do exactly this.
>
> After that, releasing is a tag — `v2.6.1` — and nothing else.
>
> `cqs-audit` stays at 2.5.0 and is never published again. Deprecate it so
> people arriving from old links are pointed at the new name, but **do not
> unpublish** — that breaks everyone who already depends on it:
>
> ```bash
> npm deprecate cqs-audit "Renamed to cqz-audit (Code Quality Zone) — install that instead"
> ```

The package is live, so the default path puts changes in front of testers
before they reach anyone running `npm install -g cqz-audit`.

Three gates, each cheaper than the one after it.

---

## Gate 1 — before anything is published

`npm pack` produces the exact bytes `npm publish` would upload, so a tarball
is a genuine test of the release rather than an approximation of it.

```bash
cd cli
npm run build:all          # build the app at the repo root first
npm pack                   # cqz-audit-X.Y.Z.tgz
```

Install it somewhere clean and use it like a stranger would:

```bash
npm install --prefix /tmp/trycqz ./cqz-audit-X.Y.Z.tgz
/tmp/trycqz/node_modules/cqz-audit/dist/cqz.js --version
cd ~/your-suite && /tmp/trycqz/node_modules/cqz-audit/dist/cqz.js ./tests
```

Hand that `.tgz` to a colleague and they can do the same — no registry
involved, nothing published, nothing to undo.

---

## Gate 2 — UAT on npm, under the `next` tag

Publish a prerelease. It goes to the `next` dist-tag, so `npm install -g
cqz-audit` is completely unaffected and only people who ask for `@next`
receive it.

```bash
cd cli && npm version 2.7.0-rc.1 --no-git-tag-version && cd ..
git commit -am "Release candidate 2.7.0-rc.1"
git tag v2.7.0-rc.1 && git push && git push --tags
```

CI picks the dist-tag from the version: anything containing a hyphen
(`-rc.1`, `-beta.2`) publishes to `next`; a plain version publishes to
`latest`. Nothing to remember at release time.

Testers install it with:

```bash
npm install -g cqz-audit@next
```

And return to the stable build with:

```bash
npm install -g cqz-audit@latest
```

---

## Gate 3 — promote to everyone

Two ways, and the difference matters.

**Promote the exact build that was tested** — same bytes, no rebuild:

```bash
npm dist-tag add cqz-audit@2.7.0-rc.1 latest
```

The version keeps its `-rc.1` suffix, which some tooling treats as a
prerelease. Honest, but a little odd on the npm page.

**Or cut the stable version** — cleaner, but technically a different artifact
from the one under test:

```bash
cd cli && npm version 2.7.0 --no-git-tag-version && cd ..
git commit -am "Release 2.7.0"
git tag v2.7.0 && git push && git push --tags
```

Prefer the second when the gap is only the version number, and the first when
you want certainty that what you tested is what shipped.

---

## If a release turns out to be bad

```bash
npm dist-tag add cqz-audit@<last-good-version> latest
```

That repoints `latest` immediately; new installs get the good build. It is
much faster than publishing a fix, and reversible.

Then deprecate the bad one so nobody pins to it by accident:

```bash
npm deprecate cqz-audit@2.7.0 "Broken: <what breaks>. Use 2.6.0 or later."
```

Unpublishing only works within 72 hours of publishing and is rarely the right
answer — it breaks anyone who already depends on that version.

---

## What CI checks before it publishes anything

Every release, prerelease or not, must pass:

- the golden master across all 18 stacks
- the security rules, in both directions
- a smoke test of the **built artifacts** — `dist/cqz.js --version` matching
  package.json, and the MCP server answering a `tools/list` over stdio
- the tag matching `cli/package.json`, so `v2.7.0` cannot publish 2.6.0

The smoke test exists because a stray package import once shipped in three
consecutive releases and killed every command, including `--help`. Tests pass
against source; only the artifact test would have caught it.

---

## Dry run

To exercise the whole pipeline — build, test, smoke test, pack — without
publishing:

**Actions → Publish to npm → Run workflow → tick `dry_run`.**
