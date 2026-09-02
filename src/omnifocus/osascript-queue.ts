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
 *
 * Deadlock note: this is a plain mutex, not a gate on the startup cache warm.
 * No caller holds it while awaiting another runSerialized() — each task is a
 * leaf spawn — so the warm's own calls simply queue behind one another.
 */

let tail: Promise<void> = Promise.resolve();

/**
 * Run `task` after every previously queued task has settled. Rejections
 * propagate to the caller and never wedge the queue.
 */
export function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  return previous.then(async () => {
    try {
      return await task();
    } finally {
      release();
    }
  });
}
