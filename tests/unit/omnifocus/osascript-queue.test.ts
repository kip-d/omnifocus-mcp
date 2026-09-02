import { describe, it, expect } from 'vitest';
import { runSerialized } from '../../../src/omnifocus/osascript-queue.js';

/**
 * OMN-321: process-wide FIFO serialization of osascript spawns. Two concurrent
 * multi-second bridge calls from one server previously raced on OmniFocus's
 * single automation channel; the latecomer's spawn timeout ran while it sat
 * in OF's queue. runSerialized() makes the wait happen BEFORE the spawn.
 */
describe('runSerialized (OMN-321)', () => {
  it('runs a single task and returns its value', async () => {
    await expect(runSerialized(async () => 42)).resolves.toBe(42);
  });

  it('does not start the second task until the first has settled', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((r) => (releaseFirst = r));

    const first = runSerialized(async () => {
      events.push('first:start');
      await firstDone;
      events.push('first:end');
      return 'a';
    });
    const second = runSerialized(async () => {
      events.push('second:start');
      return 'b';
    });

    // Let microtasks drain: the second task must NOT have started.
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['first:start']);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('preserves FIFO order across several queued tasks', async () => {
    const order: number[] = [];
    const tasks = [3, 1, 2].map((n) =>
      runSerialized(async () => {
        await new Promise((r) => setTimeout(r, n));
        order.push(n);
        return n;
      }),
    );
    await Promise.all(tasks);
    expect(order).toEqual([3, 1, 2]);
  });

  it('releases the queue when a task rejects, so the next task still runs', async () => {
    const failing = runSerialized(async () => {
      throw new Error('boom');
    });
    const next = runSerialized(async () => 'ran');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ran');
  });

  it('propagates a synchronous throw from the task factory without wedging the queue', async () => {
    const failing = runSerialized(() => {
      throw new Error('sync boom');
    });
    const next = runSerialized(async () => 'ran');
    await expect(failing).rejects.toThrow('sync boom');
    await expect(next).resolves.toBe('ran');
  });
});
