# cqz-ai

> ## ⚠️ Not recommended. The model does not work for this.
>
> Published as 0.1.0, then measured. It is a natural-language entailment model
> and source code is out of distribution for it:
>
> | Test | Result |
> |---|---|
> | Clear selector contrast: `div:nth-child(3) > button.btn-x7f` vs `getByRole`/`getByTestId` | rated the **robust** version *more* fragile — 79% vs 76% |
> | Per-file scores, file head as input | identical for all 10 files — the 4000-char window was imports and interfaces, zero lines containing a locator or assertion |
> | Per-file scores, distilled excerpt | scores vary, but the ranking is not trustworthy |
> | Hand-written English test names, one-vs-several behaviours | 6/6 — the one thing it did well |
> | **Real test names from a production suite** | noise — `CustUpdatePCMCPCMA` classified as "several behaviours" |
>
> The one case it handled needs well-formed English sentences. Real test names
> are identifiers like `External_PCMA_Scheduled_Transfer`, which are not prose,
> so the signal disappears.
>
> It costs ~104 MB of weights and ~500 MB resident to produce that. The studio
> no longer offers it, and everything it was meant to judge — fragile
> selectors, vague test names, compound tests — turned out to be detectable by
> deterministic rules that are *right*, in an engine that already has 544 of
> them.
>
> The plumbing here is sound and stays: the child-process isolation, the
> memory accounting, the static gate and the excerpt extraction are all
> reusable. What is wrong is the choice of model. Anyone revisiting this
> should start by building a labelled fixture set and measuring accuracy
> **before** building anything on top.

---

An offline AI layer for [Code Quality Zone](https://npmjs.com/package/cqz-audit).
A ~100 MB classifier that runs on your machine, needs no API key, and answers a
fixed list of questions about a test file.

**A separate package on purpose.** `cqz-audit` is live and installed by people
who want 530 deterministic rules and a small download; nothing about adding a
classifier should be able to break that. This does not patch, wrap or re-export
it — it runs beside it. If this package fails to install, fails to load its
model, or is simply absent, `cqs` behaves exactly as it does today.

## What it is for

The 530-odd static rules catch everything with a reliable textual signature: a
`waitForTimeout`, a missing `expect`, an XPath string. What they cannot judge is
the fuzzy half — whether a selector is *fragile*, whether a test does one thing
or five, whether a file is a page object or a script with page-object naming.

Those are judgements. A small classifier is a better judge of them than another
regex, and unlike a hosted model it costs nothing, leaks nothing and works on a
plane.

## Install

```bash
npm install -g cqz-ai
```

Pulls `@huggingface/transformers` and `onnxruntime-node`. The 104 MB of model
weights are **not** part of the install — they download on first use.

## Use it

```bash
cqz-ai ./tests/checkout.spec.ts     # audit a file
cqz-ai warm                         # download the model now, not on first use
cqz-ai where                        # print the cache directory
cqz-ai serve                        # run beside `cqz serve` on port 4100
```

| | |
|---|---|
| Model | `Xenova/nli-deberta-v3-xsmall`, quantised (q8) |
| Download | 96 MB model + 8 MB tokenizer = **104 MB**, measured |
| Cache | `~/.cache/cqz-models` (`CQZ_MODEL_CACHE` to move it) |
| Resident | ~470 MB **in a child process**, not in your server |
| First call | ~15–20 s including download; ~700 ms warm |
| Keys | none, ever |

Smaller box? `CQS_LOCAL_MODEL=Xenova/mobilebert-uncased-mnli` is ~28 MB and
noticeably blunter.

## Using it from code

```js
import { auditTestCode } from "cqz-ai";

const { findings, static: staticPart, model } = await auditTestCode(sourceText);
```

```js
{
  findings: [
    { ruleId: "LOCAL-STATIC-001", severity: "critical", source: "static", ... },
    { ruleId: "LOCAL-AI-FRAGILE-SELECTORS", severity: "warning",
      source: "local-model", confidence: 0.81, ... },
  ],
  static: { count: 0, passed: true },
  model:  { ran: true, answers: { ... } },
  ms: 737,
}
```

Options: `threshold` (default 0.65), `only: ["fragile-selectors"]`,
`model`, `cacheDir`, `staticChecker` (inject the real 530-rule engine),
`alwaysRunModel`, `inProcess`.

## How the hybrid works

Static rules run first. **The model is only consulted when they find nothing**,
for two reasons — speed, and trust. If a `waitForTimeout` is sitting there in
plain sight, a deterministic rule should be what reports it; asking a classifier
to confirm what a regex already knows is how a tool starts producing findings
nobody can reproduce.

Every model answer is a label and a probability, and becomes a finding only
above a threshold you can see and tune. Nothing generates free text — a
probability can be calibrated and tested, prose cannot.

## Why it runs in a child process

Measured on a 2024 MacBook: loading the classifier in-process takes RSS from
40 MB to 509 MB. Calling the pipeline's own `dispose()` returns **119 MB of
that 470 MB** — ONNX Runtime's arena allocator holds native memory the JS heap
has no say over, so "unloaded" would mean "unreachable", not "returned".

In a child process:

```
server       45 MB  →  45 MB   (never touches it)
worker        —     → 531 MB
after kill    —     →  gone     all of it, every time
```

The worker exits when its parent disconnects, is killed after 5 minutes idle,
and is `SIGKILL`ed if it will not stop — a native addon wedged mid-inference
will not act on a message, and leaving 400 MB behind out of politeness is
exactly what this avoids. It respawns transparently on the next request.

It is never a background service. There is nothing to install, nothing to start
at boot, and nothing left running when `cqz serve` stops.

## Running beside the studio

```bash
cqz serve --open        # port 4000 — the audit engine and the studio
cqz-ai serve            # port 4100 — this, on its own
```

Two processes, two ports, no shared code. `cqz-ai serve` carries the same
protections as `cqz serve`: bound to 127.0.0.1 only, a random token per run on
every request except `/health`, and an origin allowlist that includes 4000 so
the studio can reach it.

```bash
curl -s -X POST http://127.0.0.1:4100/ai-audit \
  -H "x-cqz-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"path":"./tests/checkout.spec.ts"}'
```

`POST /unload` kills the model process without stopping the server.

## What it is not

It is not a code reviewer and will not explain itself. It answers four fixed
questions with probabilities. If you want prose, the existing `--ai` providers
(Anthropic, Bedrock, Gemini) do that — with a key, over the network.
