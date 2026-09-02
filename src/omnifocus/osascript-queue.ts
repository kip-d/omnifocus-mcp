/**
 * Process-wide FIFO serialization for osascript spawns (OMN-321).
 *
 * Why module state, not instance state: every tool constructs its own
 * OmniAutomation (src/tools/base.ts) and CacheWarmer builds one per warm op,
 * so an instance-level lock would serialize nothing. Every path that spawns
 * `osascript` against OmniFocus — OmniAutomation, DiagnosticOmniAutomation —
 * must run its spawn through runSerialized().
 *
 * Why serialize at all: OmniFocus runs automation scripts on one channel, so
 * two concurrent multi-second bridge calls from one server do not overlap —
 * the latecomer waits inside OmniFocus with its own spawn timeout already
 * ticking (the OMN-320 production crash class: a signal-killed sibling,
 * `code: null`). Queueing here moves that wait BEFORE the spawn, so the
 * timeout measures the script's own run, and no two children contend.
 * Live A/B 2026-09-02 (list_for_review + pattern_analysis fired together):
 * old build ran the second call 31.3s incl. ~13s waiting inside OmniFocus;
 * this build logged `waited 13411ms` then ran it in ~16s — same wall, wait
 * moved out of the timeout window. The startup warm measured 14.0s serialized
 * vs 15.4s parallel (OmniFocus already serialized it).
 *
 * Deadlock note: this is a plain mutex, not a gate on the startup cache warm.
 * No caller holds it while awaiting another runSerialized() — each task is a
 * leaf spawn — so the warm's own calls simply queue behind one another.
 *
 * No ceiling on the wait, by design: a queue-wait timeout would turn a slow
 * success back into the fast failure this queue exists to remove. Each MCP
 * caller is already bounded by its own client-side request timeout.
 */
import { createLogger } from '../utils/logger.js';

const logger = createLogger('osascript-queue');
const LOG_WAIT_THRESHOLD_MS = 100;

let tail: Promise<void> = Promise.resolve();

/**
 * Run `task` after every previously queued task has settled. Rejections
 * propagate to the caller and never wedge the queue. `label` names the caller
 * in the queue-wait log line (mirrors the startup-gate wait log in
 * src/tools/index.ts).
 */
export function runSerialized<T>(task: () => Promise<T>, label = 'osascript'): Promise<T> {
  const previous = tail;
  const queuedAt = Date.now();
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  return previous.then(async () => {
    const waitedMs = Date.now() - queuedAt;
    if (waitedMs > LOG_WAIT_THRESHOLD_MS) {
      logger.info(`${label} spawn waited ${waitedMs}ms for a preceding script to finish`);
    }
    try {
      return await task();
    } finally {
      release();
    }
  });
}
