import { describe, it, expect, vi } from 'vitest';
import { createHttpShutdown, drainPendingOperations } from '../../../src/utils/shutdown.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const never = () => new Promise<void>(() => {});

// OMN-347: HTTP shutdown ran stop(); closeAllSessions(); exit(0) with no
// drain of pending operations, no single-exit guard, and no bound. stop()
// went first, and httpServer.close waits for open connections, so an open
// SSE stream could block shutdown indefinitely.
function deps(overrides: Partial<Parameters<typeof createHttpShutdown>[0]> = {}) {
  const order: string[] = [];
  const d = {
    sessionManager: { closeAllSessions: vi.fn(async () => void order.push('closeSessions')) },
    httpServerManager: { stop: vi.fn(async () => void order.push('stop')) },
    pendingOperations: new Set<Promise<unknown>>(),
    exit: vi.fn((code: number) => void order.push(`exit:${code}`)),
    drainTimeoutMs: 50,
    closeTimeoutMs: 50,
    ...overrides,
  };
  return { d, order };
}

describe('createHttpShutdown (OMN-347)', () => {
  it('awaits pending operations, then closes sessions, then stops the listener, then exits 0', async () => {
    const { d, order } = deps();
    let release!: () => void;
    const op = new Promise<void>((r) => (release = r)).then(() => void order.push('op-settled'));
    d.pendingOperations.add(op);

    const done = createHttpShutdown(d)('SIGTERM');
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]); // still draining
    release();
    await done;

    expect(order).toEqual(['op-settled', 'closeSessions', 'stop', 'exit:0']);
  });

  it('a pending operation that never settles is bounded: exits 1 after the drain timeout', async () => {
    const { d, order } = deps();
    d.pendingOperations.add(never());

    await createHttpShutdown(d)('SIGTERM');

    expect(order).toEqual(['closeSessions', 'stop', 'exit:1']);
  });

  it('a hung stop() (open SSE stream) cannot block exit', async () => {
    const { d, order } = deps({ httpServerManager: { stop: vi.fn(never) } });

    await createHttpShutdown(d)('SIGINT');

    expect(order).toEqual(['closeSessions', 'exit:0']);
  });

  it('a throwing closeAllSessions still stops and exits', async () => {
    const { d, order } = deps({
      sessionManager: {
        closeAllSessions: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });

    await createHttpShutdown(d)('SIGTERM');

    expect(order).toEqual(['stop', 'exit:0']);
  });

  it('a second signal during shutdown is a no-op (one exit only)', async () => {
    const { d } = deps();
    const shutdown = createHttpShutdown(d);

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(d.exit).toHaveBeenCalledTimes(1);
    expect(d.sessionManager.closeAllSessions).toHaveBeenCalledTimes(1);
  });
});

describe('drainPendingOperations', () => {
  it('returns true immediately for an empty set', async () => {
    await expect(drainPendingOperations(new Set(), 10)).resolves.toBe(true);
  });

  it('a rejected operation counts as settled', async () => {
    const failing = Promise.reject(new Error('x'));
    failing.catch(() => undefined);
    await expect(drainPendingOperations(new Set([failing]), 50)).resolves.toBe(true);
  });
});
