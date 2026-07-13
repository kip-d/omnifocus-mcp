// OMN-263: proves the self-PID / parent-PID fast paths in
// verifyLockHolderIdentity short-circuit BEFORE any process lookup —
// these are what keep every per-file teardown (worker checking the vitest
// main's lock via ppid) and the global setup/teardown sweeps (main checking
// its own lock via pid) free of `ps` shellouts. OMN-265 added a recorded
// start-time comparison AFTER the fast paths; the fast-path pins below now
// forbid BOTH lookups (command line AND start time), so neither check can
// silently creep onto the hot path.
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

describe('verifyLockHolderIdentity fast paths (no process lookups for in-run checks)', () => {
  const forbiddenCommandMatches = vi.fn((): boolean | undefined => {
    throw new Error('command-line lookup must not run for the pid/ppid fast paths');
  });
  const forbiddenGetStartTime = vi.fn((): string | undefined => {
    throw new Error('start-time lookup must not run for the pid/ppid fast paths');
  });
  const forbidden = { commandMatches: forbiddenCommandMatches, getStartTime: forbiddenGetStartTime };

  beforeEach(() => {
    forbiddenCommandMatches.mockClear();
    forbiddenGetStartTime.mockClear();
  });

  it('our own pid short-circuits true (vitest main examining the lock it wrote)', () => {
    expect(verifyLockHolderIdentity({ pid: process.pid, recordedStartTime: undefined }, forbidden)).toBe(true);
    expect(forbiddenCommandMatches).not.toHaveBeenCalled();
    expect(forbiddenGetStartTime).not.toHaveBeenCalled();
  });

  it("our parent's pid short-circuits true (forked worker examining the vitest main's lock)", () => {
    // This test process is itself a vitest fork worker, so process.ppid IS
    // the live worker→main relationship the fast path exists for — not a
    // simulation of it.
    expect(verifyLockHolderIdentity({ pid: process.ppid, recordedStartTime: undefined }, forbidden)).toBe(true);
    expect(forbiddenCommandMatches).not.toHaveBeenCalled();
    expect(forbiddenGetStartTime).not.toHaveBeenCalled();
  });

  it('the fast paths short-circuit even when a recorded start time is present (per-file teardowns stay two integer compares)', () => {
    // Post-OMN-265 every in-run lock DOES carry a start time — the hot
    // per-file path must still never pay a shellout for it.
    expect(
      verifyLockHolderIdentity({ pid: process.ppid, recordedStartTime: 'Sun Jul 13 05:00:00 2026' }, forbidden),
    ).toBe(true);
    expect(forbiddenCommandMatches).not.toHaveBeenCalled();
    expect(forbiddenGetStartTime).not.toHaveBeenCalled();
  });

  it('any other pid goes to the injected fallback, whose verdict is returned as-is', () => {
    const commandMatches = vi.fn((): boolean | undefined => false);
    const otherPid = process.pid + 424242; // matches neither pid nor ppid

    expect(
      verifyLockHolderIdentity(
        { pid: otherPid, recordedStartTime: undefined },
        { commandMatches, getStartTime: forbiddenGetStartTime },
      ),
    ).toBe(false);
    expect(commandMatches).toHaveBeenCalledTimes(1);
    expect(commandMatches).toHaveBeenCalledWith(otherPid);
    // No recorded start time (legacy lock) — nothing to compare against.
    expect(forbiddenGetStartTime).not.toHaveBeenCalled();
  });
});

// OMN-265: for a genuine cross-process check (neither self nor parent), a
// recorded start time is an EXACT identity — PID + start time is unique per
// boot — so a readable live start time decides the question outright and the
// broad 'vitest' command substring is never consulted. Only an unreadable
// start time (or a legacy bare-PID lock) falls back to the OMN-263 chain.
describe('verifyLockHolderIdentity recorded start-time comparison (OMN-265)', () => {
  const otherPid = process.pid + 424242; // matches neither pid nor ppid
  const RECORDED = 'Sat Jul 12 09:00:00 2026';

  it('live start time MATCHES the record → confirmed holder (true), substring never consulted', () => {
    const commandMatches = vi.fn((): boolean | undefined => false); // would say "not a holder" — must not matter
    expect(
      verifyLockHolderIdentity(
        { pid: otherPid, recordedStartTime: RECORDED },
        { getStartTime: () => RECORDED, commandMatches },
      ),
    ).toBe(true);
    expect(commandMatches).not.toHaveBeenCalled();
  });

  it('live start time DIFFERS from the record → confirmed PID reuse (false), substring never consulted', () => {
    const commandMatches = vi.fn((): boolean | undefined => true); // would say "holder" — the pre-OMN-265 false refusal
    expect(
      verifyLockHolderIdentity(
        { pid: otherPid, recordedStartTime: RECORDED },
        { getStartTime: () => 'Sun Jul 13 05:00:00 2026', commandMatches },
      ),
    ).toBe(false);
    expect(commandMatches).not.toHaveBeenCalled();
  });

  it('live start time UNREADABLE → falls back to the OMN-263 command-substring chain', () => {
    const commandMatches = vi.fn((): boolean | undefined => undefined);
    expect(
      verifyLockHolderIdentity(
        { pid: otherPid, recordedStartTime: RECORDED },
        { getStartTime: () => undefined, commandMatches },
      ),
    ).toBeUndefined();
    expect(commandMatches).toHaveBeenCalledTimes(1);
  });

  it('legacy bare-PID lock (no recorded start time) → straight to the substring chain, no start-time lookup', () => {
    const getStartTime = vi.fn((): string | undefined => {
      throw new Error('nothing recorded — must not look up a start time to compare against nothing');
    });
    const commandMatches = vi.fn((): boolean | undefined => true);
    expect(
      verifyLockHolderIdentity({ pid: otherPid, recordedStartTime: undefined }, { getStartTime, commandMatches }),
    ).toBe(true);
    expect(getStartTime).not.toHaveBeenCalled();
    expect(commandMatches).toHaveBeenCalledTimes(1);
  });
});
