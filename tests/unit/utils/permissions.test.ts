import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionChecker } from '../../../src/utils/permissions.js';

// Mock child_process.execFile
const execFileMock = vi.fn();
vi.mock('child_process', () => ({
  execFile: (...args: any[]) => execFileMock(...args),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

function resolveWith(error: any) {
  execFileMock.mockImplementationOnce((_cmd: string, _args: string[], _opts: any, cb: Function) => {
    // node's execFile callback: (error, stdout, stderr)
    cb(error, '', '');
    return { on: () => {} } as any;
  });
}

describe('PermissionChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PermissionChecker.getInstance().resetCache();
  });

  it('returns hasPermission=true when osascript succeeds and caches result', async () => {
    resolveWith(null);
    const first = await PermissionChecker.getInstance().checkPermissions();
    expect(first.hasPermission).toBe(true);

    // cached within TTL; execFile not called again
    const calls = execFileMock.mock.calls.length;
    const second = await PermissionChecker.getInstance().checkPermissions();
    expect(second.hasPermission).toBe(true);
    expect(execFileMock.mock.calls.length).toBe(calls);
  });

  it('maps -1743 to permission denied with instructions', async () => {
    resolveWith(new Error('-1743 Not allowed to send Apple events'));
    const res = await PermissionChecker.getInstance().checkPermissions();
    expect(res.hasPermission).toBe(false);
    expect(res.error).toMatch(/Not authorized/i);
    expect(res.instructions).toMatch(/Automation/);
  });

  it('maps -600 / not running to helpful message', async () => {
    resolveWith(new Error("Application OmniFocus isn't running (-600)"));
    const res = await PermissionChecker.getInstance().checkPermissions();
    expect(res.hasPermission).toBe(false);
    expect(res.error).toMatch(/not running/i);
  });

  it('maps timeout to specific message', async () => {
    resolveWith(new Error('ETIMEDOUT: timeout'));
    const res = await PermissionChecker.getInstance().checkPermissions();
    expect(res.hasPermission).toBe(false);
    expect(res.error).toMatch(/Timed out/i);
  });

  it('resetCache forces a recheck', async () => {
    resolveWith(null);
    await PermissionChecker.getInstance().checkPermissions();
    const callsAfterFirst = execFileMock.mock.calls.length;

    PermissionChecker.getInstance().resetCache();
    resolveWith(null);
    await PermissionChecker.getInstance().checkPermissions();
    expect(execFileMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
