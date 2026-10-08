/**
 * The model, in its own process.
 *
 * Why not in-process: measured on this machine, loading the classifier takes
 * RSS from 40 MB to 509 MB, and calling the pipeline's own dispose() gives
 * back 119 MB of it. The rest stays — ONNX Runtime's arena allocator holds
 * native memory that the JS heap has no say over, so "unloaded" would mean
 * "unreachable", not "returned". Killing a process returns all of it, every
 * time, with no dependence on how a native addon chooses to behave.
 *
 * Tightly bound: it speaks only to its parent over the fork IPC channel, it
 * exits when the channel closes, and it never becomes a service. If the parent
 * dies, 'disconnect' fires and this exits — no orphan holding 400 MB.
 */
import { auditTestCode } from "./auditTestCode.js";
import { getClassifier, shutdown } from "./backend.js";

// Belt and braces: if the parent vanishes without a clean disconnect, go too.
process.on("disconnect", () => process.exit(0));

process.on("message", async (msg) => {
  if (!msg || typeof msg !== "object") return;
  const { id, cmd, payload } = msg;

  try {
    if (cmd === "warm") {
      await getClassifier(payload ?? {});
      reply(id, { ok: true });
    } else if (cmd === "audit") {
      // inProcess: this *is* the isolated process; forking again would be absurd.
      reply(id, { ok: true, result: await auditTestCode(payload.code, { ...payload.opts, inProcess: true }) });
    } else if (cmd === "stop") {
      await shutdown("parent asked");
      reply(id, { ok: true });
      process.exit(0);
    } else {
      reply(id, { ok: false, error: `unknown command: ${cmd}` });
    }
  } catch (e) {
    reply(id, { ok: false, error: e?.message ?? String(e), code: e?.code });
  }
});

function reply(id, body) {
  try { process.send?.({ id, ...body }); } catch { /* parent already gone */ }
}

// Tell the parent we are ready to receive work.
process.send?.({ ready: true, pid: process.pid });
