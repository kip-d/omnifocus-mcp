// OMN-263: proves the self-PID / parent-PID fast paths in
// verifyLockHolderIdentity short-circuit BEFORE any command-line lookup —
// these are what keep every per-file teardown (worker checking the vitest
// main's lock via ppid) and the global setup/teardown sweeps (main checking
// its own lock via pid) free of `ps` shellouts.
//
// Review pass 4 found the previous version of this file NON-DISCRIMINATING:
// it mocked 'child_process' module-wide, but the mock never intercepted
// integration-guard.ts's import (a module-loading quirk), and the real-`ps`
// fallback happened to return identical outcomes (a vitest worker's own
// command line contains 'vitest') — empirically, deleting both fast paths
// left every test green. This rewrite tests the exported function directly
// with an injected, THROWING fallback: if a fast path ever stops
// short-circuiting, the fallback fires and the test fails loudly. No module
// mock, no interception quirk, no vacuous zero-call assertion.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyLockHolderIdentity } from '../../support/integration-guard.js';

describe('verifyLockHolderIdentity fast paths (no command-line lookup for in-run checks)', () => {
  const forbidden = vi.fn((): boolean | undefined => {
    throw new Error('command-line lookup must not run for the pid/ppid fast paths');
  });

  beforeEach(() => {
    forbidden.mockClear();
  });

  it('our own pid short-circuits true (vitest main examining the lock it wrote)', () => {
    expect(verifyLockHolderIdentity(process.pid, { commandMatches: forbidden })).toBe(true);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("our parent's pid short-circuits true (forked worker examining the vitest main's lock)", () => {
    // This test process is itself a vitest fork worker, so process.ppid IS
    // the live worker→main relationship the fast path exists for — not a
    // simulation of it.
    expect(verifyLockHolderIdentity(process.ppid, { commandMatches: forbidden })).toBe(true);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('any other pid goes to the injected fallback, whose verdict is returned as-is', () => {
    const commandMatches = vi.fn((): boolean | undefined => false);
    const otherPid = process.pid + 424242; // matches neither pid nor ppid

    expect(verifyLockHolderIdentity(otherPid, { commandMatches })).toBe(false);
    expect(commandMatches).toHaveBeenCalledTimes(1);
    expect(commandMatches).toHaveBeenCalledWith(otherPid);
  });
});
