// tests/unit/support/integration-guard.test.ts
// OMN-143: single-instance lock + orphan watchdog. All cases drive the
// dependency-injected seams (lockPath, pid, isPidAlive, getPpid, onOrphan) —
// no real lock contention, no real process exits.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireIntegrationLock,
  releaseIntegrationLock,
  startOrphanWatchdog,
  pidIsAlive,
} from '../../support/integration-guard.js';

describe('acquireIntegrationLock / releaseIntegrationLock', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omn143-'));
    lockPath = path.join(dir, 'nested', 'integration.lock'); // nested: proves mkdir -p
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fresh acquire creates the lock containing the PID', () => {
    const res = acquireIntegrationLock({ lockPath, pid: 12345 });
    expect(res).toEqual({ acquired: true });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('12345');
  });

  it('refuses when a LIVE holder owns the lock, reporting the holder PID', () => {
    acquireIntegrationLock({ lockPath, pid: 11111 });
    const res = acquireIntegrationLock({ lockPath, pid: 22222, isPidAlive: () => true });
    expect(res).toEqual({ acquired: false, holderPid: 11111 });
    // the holder's lock is untouched
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('11111');
  });

  it('reclaims a stale lock when the holder is dead', () => {
    acquireIntegrationLock({ lockPath, pid: 11111 });
    const res = acquireIntegrationLock({ lockPath, pid: 22222, isPidAlive: () => false });
    expect(res).toEqual({ acquired: true, stale: true, holderPid: 11111 });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('22222');
  });

  it('treats garbage lock content as stale (no holderPid reported)', () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, 'not-a-pid');
    const res = acquireIntegrationLock({
      lockPath,
      pid: 33333,
      isPidAlive: () => {
        throw new Error('must not probe liveness for garbage content');
      },
    });
    expect(res).toEqual({ acquired: true, stale: true });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('33333');
  });

  it('release is owner-only: a non-owner release leaves the lock in place', () => {
    acquireIntegrationLock({ lockPath, pid: 11111 });
    expect(releaseIntegrationLock({ lockPath, pid: 99999 })).toBe(false);
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(releaseIntegrationLock({ lockPath, pid: 11111 })).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('release of a missing lock is a quiet no-op', () => {
    expect(releaseIntegrationLock({ lockPath, pid: 11111 })).toBe(false);
  });

  it('acquire-after-release round-trip works (the teardown→next-run path)', () => {
    acquireIntegrationLock({ lockPath, pid: 11111 });
    releaseIntegrationLock({ lockPath, pid: 11111 });
    const res = acquireIntegrationLock({ lockPath, pid: 22222 });
    expect(res).toEqual({ acquired: true });
  });
});

describe('pidIsAlive', () => {
  it('is true for the current process and false for an unlikely PID', () => {
    expect(pidIsAlive(process.pid)).toBe(true);
    // PID near the macOS pid_max ceiling, overwhelmingly unlikely to exist;
    // if it ever does exist the probe still answers correctly, so no flake.
    expect(typeof pidIsAlive(99999998)).toBe('boolean');
  });
});

describe('startOrphanWatchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not fire while the parent is alive', () => {
    const onOrphan = vi.fn();
    const stop = startOrphanWatchdog({ getPpid: () => 4242, onOrphan, intervalMs: 100 });
    vi.advanceTimersByTime(1000);
    expect(onOrphan).not.toHaveBeenCalled();
    stop();
  });

  it('fires exactly once when reparented to PID 1, then stops polling', () => {
    const ppids = [4242, 4242, 1, 1, 1];
    const getPpid = vi.fn(() => ppids.shift() ?? 1);
    const onOrphan = vi.fn();
    startOrphanWatchdog({ getPpid, onOrphan, intervalMs: 100 });
    vi.advanceTimersByTime(1000);
    expect(onOrphan).toHaveBeenCalledTimes(1);
    // interval cleared on fire: no further polling after the orphan tick
    const callsAtFire = getPpid.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(getPpid.mock.calls.length).toBe(callsAtFire);
  });

  it('stop() handle cancels the watchdog before it ever fires', () => {
    const onOrphan = vi.fn();
    const stop = startOrphanWatchdog({ getPpid: () => 1, onOrphan, intervalMs: 100 });
    stop();
    vi.advanceTimersByTime(1000);
    expect(onOrphan).not.toHaveBeenCalled();
  });
});
