import { describe, it, expect, vi, beforeEach } from 'vitest';

const setPendingOperationsTracker = vi.fn();
const registerTools = vi.fn(async () => undefined);

vi.mock('../../src/omnifocus/OmniAutomation.js', () => ({ setPendingOperationsTracker }));
vi.mock('../../src/tools/index.js', () => ({ registerTools }));
vi.mock('../../src/prompts/index.js', () => ({ registerPrompts: vi.fn() }));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const { SessionManager } = await import('../../src/session-manager.js');

// OMN-347: `new SessionManager()` used to call setPendingOperationsTracker with
// its own private Set, replacing the tracker index.ts installed. osascript,
// tool, and cache-warm promises then went into a set nothing drained at exit.
describe('SessionManager pending-operations tracker (OMN-347)', () => {
  beforeEach(() => {
    setPendingOperationsTracker.mockClear();
    registerTools.mockClear();
  });

  it('does not replace the global tracker', () => {
    const manager = new SessionManager({} as never, new Set());
    expect(manager.getSessionCount()).toBe(0);
    expect(setPendingOperationsTracker).not.toHaveBeenCalled();
  });

  it("registers each session's tools against the tracker it was given", async () => {
    const tracker = new Set<Promise<unknown>>();
    const manager = new SessionManager({} as never, tracker);

    await manager.createSession('s1');

    expect(registerTools).toHaveBeenCalledTimes(1);
    expect((registerTools.mock.calls[0] as unknown[])[2]).toBe(tracker);
    await manager.closeAllSessions();
  });
});
