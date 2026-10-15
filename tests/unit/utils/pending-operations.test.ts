import { describe, it, expect, afterEach } from 'vitest';
import { trackPendingOperation } from '../../../src/utils/pending-operations.js';

describe('trackPendingOperation', () => {
  it('adds the promise to the set and removes it once it resolves', async () => {
    const set = new Set<Promise<unknown>>();
    let resolve!: () => void;
    const p = new Promise<void>((r) => {
      resolve = r;
    });

    const tracked = trackPendingOperation(set, p);
    expect(tracked).toBe(p);
    expect(set.has(p)).toBe(true);

    resolve();
    await p;
    // The removal runs in a .then() queued on the same promise — flush it.
    await Promise.resolve();
    expect(set.has(p)).toBe(false);
  });

  it('removes the promise from the set once it rejects, and still returns the original (rejecting) promise', async () => {
    const set = new Set<Promise<unknown>>();
    let reject!: (e: unknown) => void;
    const p = new Promise<void>((_resolve, r) => {
      reject = r;
    });

    const tracked = trackPendingOperation(set, p);
    expect(tracked).toBe(p);
    expect(set.has(p)).toBe(true);

    reject(new Error('boom'));
    await expect(tracked).rejects.toThrow('boom');
    await Promise.resolve();
    expect(set.has(p)).toBe(false);
  });

  describe('unhandledRejection guard (OMN-348)', () => {
    let unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);

    afterEach(() => {
      process.off('unhandledRejection', onUnhandled);
    });

    it('never fires unhandledRejection for a tracked promise that rejects, even if nothing else observes it', async () => {
      unhandled = [];
      process.on('unhandledRejection', onUnhandled);

      const set = new Set<Promise<unknown>>();
      let reject!: (e: unknown) => void;
      const p = new Promise<void>((_resolve, r) => {
        reject = r;
      });

      // Mirrors the real call sites: track it, but (deliberately, for this
      // test) never attach a .catch to the returned promise either — if
      // trackPendingOperation's internal bookkeeping promise were the old
      // `.finally()` shape, THIS is where it would surface.
      trackPendingOperation(set, p);
      reject(new Error('untracked rejection'));

      // Flush microtasks and a macrotask tick so any unhandledRejection the
      // event loop would schedule has a chance to fire before we assert.
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));

      expect(unhandled).toEqual([]);

      // Silence Node's own unhandledRejection detection for `p` itself (we
      // intentionally left it unobserved above to prove the GUARD works, not
      // to leave a real leak in this test run).
      await p.catch(() => undefined);
    });
  });
});
