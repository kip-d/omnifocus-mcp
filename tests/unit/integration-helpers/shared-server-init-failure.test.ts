import { describe, it, expect, vi, beforeEach } from 'vitest';

const startServerMock = vi.fn();

vi.mock('../../integration/helpers/mcp-test-client.js', () => {
  return {
    MCPTestClient: vi.fn().mockImplementation(() => ({
      pid: 1234,
      startServer: startServerMock,
      clearCache: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      thoroughCleanup: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockImplementation((tool: string, args: unknown) => {
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
      }),
    })),
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
  });
});
