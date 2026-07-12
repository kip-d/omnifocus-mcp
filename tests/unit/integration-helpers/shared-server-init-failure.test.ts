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
        thoroughCleanup: vi.fn().mockResolvedValue(undefined),
        callTool: callToolMock,
      };
      return instance;
    }),
  };
});

// OMN-261 review: the shared-server state lives on a globalThis-keyed slot
// (see global-singleton.ts) specifically so it survives vitest's per-file
// module reset — which means it does NOT reset between tests in THIS file
// on its own. Clear it manually so each test starts fresh.
const SHARED_SERVER_STATE_KEY = Symbol.for('omnifocus-mcp:shared-server-state');

describe('getSharedClient init-failure recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    startServerMock.mockReset();
    stopMock.mockReset().mockResolvedValue(undefined);
    callToolMock.mockReset().mockImplementation(defaultCallToolImpl);
    delete (globalThis as unknown as Record<symbol, unknown>)[SHARED_SERVER_STATE_KEY];
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
});
