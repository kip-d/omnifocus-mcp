import { describe, it, expect, vi, beforeEach } from 'vitest';

const startServerMock = vi.fn();
const stopMock = vi.fn();
const defaultCallToolImpl = (tool: string, args: unknown) => {
  if (tool === 'omnifocus_read') {
    return { success: true, data: { tasks: [] } };
  }
  if (tool === 'omnifocus_write') {
    const operation = (args as { mutation?: { operation?: string } })?.mutation?.operation;
    if (operation === 'create') {
      return { success: true, data: { task: { taskId: 'mock-task-id' } } };
    }
    return { success: true, data: {} };
  }
  return { success: true, data: {} };
};
const callToolMock = vi.fn().mockImplementation(defaultCallToolImpl);

vi.mock('../../integration/helpers/mcp-test-client.js', () => {
  return {
    // pid mirrors the real MCPTestClient: undefined until startServer()
    // actually spawns the child, so tests can distinguish "startServer
    // itself rejected" (pid stays undefined) from "startServer succeeded but
    // warmup failed afterward" (pid is set).
    MCPTestClient: vi.fn().mockImplementation(() => {
      const instance = {
        pid: undefined as number | undefined,
        startServer: async (...args: unknown[]) => {
          const result = await startServerMock(...args);
          instance.pid = 1234;
          return result;
        },
        clearCache: vi.fn().mockResolvedValue(undefined),
        stop: stopMock,
        callTool: callToolMock,
      };
      return instance;
    }),
  };
});

// OMN-261 review: the shared-server state lives on a globalThis-keyed slot
// (see global-singleton.ts) specifically so it survives vitest's per-file
// module reset — which means it does NOT reset between tests in THIS file
// on its own. Clear it manually so each test starts fresh. Import the slot
// key from the module under test rather than re-typing the literal, so a
// rename can't silently make clearGlobalSlot a no-op.
describe('getSharedClient init-failure recovery', () => {
  beforeEach(async () => {
    vi.resetModules();
    startServerMock.mockReset();
    stopMock.mockReset().mockResolvedValue(undefined);
    callToolMock.mockReset().mockImplementation(defaultCallToolImpl);
    const { clearGlobalSlot } = await import('../../integration/helpers/global-singleton.js');
    const { SHARED_SERVER_STATE_SLOT } = await import('../../integration/helpers/shared-server.js');
    clearGlobalSlot(SHARED_SERVER_STATE_SLOT);
  });

  it('resets shared state after an init failure so the next call retries fresh instead of inheriting the broken client forever', async () => {
    startServerMock.mockRejectedValueOnce(new Error('cold OmniFocus, simulated failure'));
    startServerMock.mockResolvedValue(undefined);

    const { getSharedClient } = await import('../../integration/helpers/shared-server.js');

    await expect(getSharedClient()).rejects.toThrow('cold OmniFocus, simulated failure');

    // Before the fix, the first call's broken client/rejected promise would
    // be permanently stuck in the shared globalThis state, and this second
    // call would immediately return/reject with the SAME broken state
    // instead of attempting a fresh init.
    const client = await getSharedClient();
    expect(client).toBeDefined();
    expect(startServerMock).toHaveBeenCalledTimes(2);
    // startServer() rejected outright — no child was ever spawned, so there's
    // nothing to stop.
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('stops the spawned client when warmupOmniFocus fails after startServer already succeeded, instead of leaking an orphaned process', async () => {
    vi.useFakeTimers();
    try {
      startServerMock.mockResolvedValue(undefined);
      // Every warmup read attempt fails, forcing warmupOmniFocus's 15s
      // read-phase retry loop to run out the clock and throw.
      callToolMock.mockImplementation((tool: string) => {
        if (tool === 'omnifocus_read') {
          return { success: false, error: 'simulated cold OmniFocus read failure' };
        }
        return { success: true, data: {} };
      });

      const { getSharedClient } = await import('../../integration/helpers/shared-server.js');

      const pending = getSharedClient();
      const assertion = expect(pending).rejects.toThrow(/warm-up/i);
      await vi.advanceTimersByTimeAsync(20000);
      await assertion;

      // Before the fix: the catch block reset in-memory state but never
      // called client.stop(), leaking the already-spawned child process.
      expect(stopMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a second concurrent call waits for the same in-flight startServer() instead of reusing an unstarted client', async () => {
    let resolveStartServer!: () => void;
    startServerMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStartServer = resolve;
        }),
    );

    const { getSharedClient } = await import('../../integration/helpers/shared-server.js');

    let secondResolved = false;
    const first = getSharedClient();
    const second = getSharedClient().then((client) => {
      secondResolved = true;
      return client;
    });

    // OMN-261 review: before the fix, state.client was published BEFORE
    // startServer() resolved, so this second call's synchronous
    // `if (state.client)` check took the "reuse" branch immediately and
    // returned the not-yet-started client here, instead of waiting on
    // `state.initPromise` like this first call is. Flush via a macrotask
    // (not just a couple of microtask ticks) so this is robust regardless of
    // how many promise-chain links sit between the reuse branch and here —
    // a microtask-only flush passed even against the buggy ordering because
    // it didn't wait out the whole chain.
    await new Promise((resolve) => setImmediate(resolve));
    expect(secondResolved).toBe(false);

    resolveStartServer();
    const [clientA, clientB] = await Promise.all([first, second]);

    expect(clientB).toBe(clientA);
    expect(startServerMock).toHaveBeenCalledTimes(1);
  });

  it('a second call that arrives during the warmup window does not reuse the not-yet-warmed client', async () => {
    startServerMock.mockResolvedValue(undefined);
    // Block warmupOmniFocus's phase-1 read so the FIRST init parks in the
    // startServer-resolved-but-warmup-pending state. resolveRead being set is
    // our signal that we've reached that window.
    let resolveRead: (() => void) | undefined;
    callToolMock.mockImplementation((tool: string, args: unknown) => {
      if (tool === 'omnifocus_read') {
        return new Promise((resolve) => {
          resolveRead = () => resolve({ success: true, data: { tasks: [] } });
        });
      }
      return defaultCallToolImpl(tool, args);
    });

    const { getSharedClient } = await import('../../integration/helpers/shared-server.js');

    const first = getSharedClient();

    // Wait until the first init has actually reached the warmup window
    // (startServer resolved, phase-1 read pending). The SECOND call must
    // arrive HERE — not synchronously before startServer resolves — for this
    // to exercise the window: publishing state.client before warmup lets this
    // late arrival take the `if (state.client)` reuse fast-path.
    while (!resolveRead) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    let secondResolved = false;
    const second = getSharedClient().then((client) => {
      secondResolved = true;
      return client;
    });

    await new Promise((resolve) => setImmediate(resolve));
    // Fixed: state.client is still null through warmup, so `second` is parked
    // on initPromise. Buggy: `second` reused the un-warmed client and already
    // resolved.
    expect(secondResolved).toBe(false);

    resolveRead();
    const [clientA, clientB] = await Promise.all([first, second]);

    expect(clientB).toBe(clientA);
    expect(startServerMock).toHaveBeenCalledTimes(1);
  });
});
