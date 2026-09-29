# Adding cqs to Cursor — step by step

Five minutes. No prior knowledge of MCP needed.

---

## What you're setting up

Cursor's AI agent can normally only read your code and talk about it. **MCP**
(Model Context Protocol) lets it run real tools on your machine. After this
setup you can type things like *"audit my tests and show me a report"* and the
agent does it — running the audit locally, reading the results, explaining
them.

Nothing is uploaded. The audit runs on your machine, on your files.

---

## Step 1 — Install cqs

Open a terminal:

```bash
npm install -g cqs-audit
```

Check it worked:

```bash
cqs --help
```

You should see help text with a version number. If you get
`command not found`, see [Troubleshooting](#troubleshooting).

> **Requires Node.js 18+.** Check with `node --version`.

---

## Step 2 — Find the two paths you need

Cursor needs to know **which Node to use** and **where the server file is**.
Print both:

```bash
echo "command: $(which node)"
echo "args:    $(npm root -g)/cqs-audit/dist/cqs-mcp.js"
```

Example output — **yours will differ, use your own**:

```
command: /Users/you/.nvm/versions/node/v24.20.0/bin/node
args:    /Users/you/.nvm/versions/node/v24.20.0/lib/node_modules/cqs-audit/dist/cqs-mcp.js
```

Copy both lines somewhere handy.

> **Why full paths, not just `"node"`?** Cursor launched from the Dock or
> Finder does not inherit your terminal's `PATH`. A bare `"node"` often cannot
> be found, and if you use `nvm` it may pick a different Node version than
> your terminal — which can silently give you an older cqs. Full paths remove
> both problems.

### Make sure you copied the path npm actually uses

`npm root -g` is the reliable answer, but it is worth understanding why, because
this trap costs people an hour.

If npm has a **prefix** configured, every `npm install -g` goes to that one
directory no matter which Node version you run it with:

```bash
npm config get prefix
```

If that prints a path containing a *specific* Node version — for example
`.../node/v22.22.0` — then installs always land there, even when you are
running Node 24. Any `cqs-audit` folder sitting in another Node version's tree
is a leftover that npm no longer updates.

Point Cursor at the managed location, never at a leftover:

```bash
echo "$(npm root -g)/cqs-audit/dist/cqs-mcp.js"
```

**How to tell you have a stale copy:** the version Cursor reports differs from
`cqs --help` in your terminal, or a tool you expect is missing. Check directly:

```bash
cat "$(npm root -g)/cqs-audit/package.json" | grep '"version"'
```

Compare it with `cqs --help`. If they disagree, you have more than one copy and
something is reading the wrong one. Delete the leftover:

```bash
# only the one NOT under `npm root -g`
rm -rf /path/to/other/node/version/lib/node_modules/cqs-audit
```

---

## Step 3 — Add it to Cursor's config

Open (or create) `~/.cursor/mcp.json` and add a `cqs` entry:

```json
{
  "mcpServers": {
    "cqs": {
      "command": "PASTE_YOUR_COMMAND_PATH_HERE",
      "args": ["PASTE_YOUR_ARGS_PATH_HERE"]
    }
  }
}
```

Filled in, it looks like this:

```json
{
  "mcpServers": {
    "cqs": {
      "command": "/Users/you/.nvm/versions/node/v24.20.0/bin/node",
      "args": ["/Users/you/.nvm/versions/node/v24.20.0/lib/node_modules/cqs-audit/dist/cqs-mcp.js"]
    }
  }
}
```

> **If the file already has other servers in it, do not replace it.** Add
> `"cqs": { … }` inside the existing `"mcpServers"` block, with a comma
> between entries. One misplaced comma makes the JSON invalid and then *none*
> of your servers load — not just this one.

Check it parses before moving on:

```bash
python3 -m json.tool ~/.cursor/mcp.json
```

If that prints your config, it's valid. If it prints an error, fix the comma.

### Global or per project?

The file above is global — `cqs` appears in every project you open. To scope
it to one repository instead, put the same JSON in `.cursor/mcp.json` inside
that project.

Be aware that a project file usually gets committed, and it contains absolute
paths from *your* machine which will not exist on a teammate's. Global is the
safer default.

---

## Step 4 — Restart Cursor properly

**Quit Cursor completely — Cmd+Q on a Mac.** Closing the window is not enough;
the config is only read when the app starts.

Then open **Cursor Settings → MCP**. You should see `cqs` listed with a green
indicator and **7 tools**.

If it is red, open it — Cursor shows the specific error there. See
[Troubleshooting](#troubleshooting).

---

## Step 5 — Use it

Open a project and ask the agent in chat. You never name the tools; the agent
picks them.

| Ask this | What happens |
|---|---|
| "Audit the tests in ./tests and give me the five worst problems." | Runs the audit, summarises the worst findings |
| "Generate a cqs report for ./tests and give me the file path." | Writes a self-contained HTML report you can open and share |
| "Which of my test files have no assertions?" | Filters to that specific rule |
| "What rules does cqs check for Playwright reliability?" | Lists the rules in that category |
| "Is my cqs-rules.json valid?" | Validates your custom rules file |

### The seven tools

| Tool | Purpose |
|---|---|
| `cqs_audit` | Find quality problems in a file or folder |
| `cqs_report` | Write a full visual HTML report |
| `cqs_list_stacks` | List the 18 supported frameworks |
| `cqs_list_rules` | List the rules for a framework |
| `cqs_validate_rules` | Check a custom rules file |
| `cqs_test_rule` | Try a rule before committing it |
| `cqs_read_report` | Summarise a saved JSON report |

---

## Troubleshooting

**`command not found: cqs` after installing**

Global npm packages install per Node version *unless* npm has a prefix set. If
you use `nvm` and switch versions, `cqs` may not be there. Check both:

```bash
node --version
npm config get prefix
npm install -g cqs-audit@latest
```

**Cursor reports a different version than my terminal**

You have two copies and Cursor is reading the stale one. See
[Make sure you copied the path npm actually uses](#make-sure-you-copied-the-path-npm-actually-uses).

**`ERR_MODULE_NOT_FOUND` when running cqs**

Upgrade: `npm install -g cqs-audit@latest`. Versions before 2.3.3 shipped a
bundle with an unresolvable import and fail on every command, including
`--help`.

**Cursor shows `cqs` in red / "error"**

Work through these in order:

1. **Did you fully quit and reopen?** Cmd+Q, not just closing the window.
2. **Is Cursor mid-update?** An interrupted or in-progress update can make
   servers fail to start. Let it finish, then relaunch.
3. **Do the paths resolve?** Run these — both must succeed:
   ```bash
   ls -l "$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.cursor/mcp.json')))['mcpServers']['cqs']['command'])")"
   ls -l "$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.cursor/mcp.json')))['mcpServers']['cqs']['args'][0])")"
   ```
4. **Is the JSON valid?** `python3 -m json.tool ~/.cursor/mcp.json`
5. **Read Cursor's own error.** Settings → MCP → click the server. It names
   the reason, which beats guessing.

**Test the server without Cursor**

This proves the server works, independently of any editor. It deliberately
runs with an empty environment, the same way Cursor launches it:

```bash
env -i /path/to/node /path/to/cqs-mcp.js <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

A wall of JSON containing `cqs_audit` and `cqs_report` means the server is
healthy and the problem is in Cursor's config or restart — not in cqs.

**The agent can see the tools but says it cannot find files**

Use paths relative to the open project, or give an absolute path. The server
resolves paths from where it was started, which is not always where you think.

---

## Frequently asked

**Does my code leave my machine?**
No. The rules are local pattern matching — no network, no API key, no account.

**Do I need an API key?**
Not for any of this. Keys are only needed for the optional AI review and the
fix agents, which are separate features.

**Does this slow Cursor down?**
No. The server is idle until the agent calls it, and an audit of a hundred
files takes well under a second.

**How do I remove it?**
Delete the `"cqs"` block from `~/.cursor/mcp.json` and restart Cursor. To
uninstall entirely: `npm uninstall -g cqs-audit`.

**Does this work in other editors?**
Yes — the same server works in Claude Desktop, Claude Code and any MCP client.
Only the config file location differs.
