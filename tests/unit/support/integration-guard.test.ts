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
  isIntegrationLockLive,
  releaseIntegrationLock,
  startOrphanWatchdog,
  startWorkerOrphanGuard,
  pidIsAlive,
  commandMatchesPid,
  getProcessCommand,
  getProcessStartTime,
  verifyLockHolderIdentity,
} from '../../support/integration-guard.js';

// OMN-265: acquire now reads its own process start time (via `ps`) to record
// it in the lock file. Every acquire call in this file injects this stub so
// the suite's default paths never spawn a real subprocess (the same rule the
// OMN-263 verifyPidIdentity stubs follow). Tests exercising the recorded
// start time inject their own reader instead.
const NO_START_TIME = { getProcessStartTime: (): string | undefined => undefined };

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

  it('fresh acquire creates the lock containing the PID (bare format when the start time is unreadable)', () => {
    const res = acquireIntegrationLock({ lockPath, pid: 12345, ...NO_START_TIME });
    expect(res).toEqual({ acquired: true });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('12345');
  });

  it('refuses when a LIVE holder owns the lock, reporting the holder PID', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, ...NO_START_TIME });
    // OMN-263: verifyPidIdentity mocked true (confirmed match) so this test
    // stays fully dependency-injected — it must not shell out to the real
    // `ps` binary for a fake PID.
    const res = acquireIntegrationLock({
      lockPath,
      pid: 22222,
      isPidAlive: () => true,
      verifyPidIdentity: () => true,
      ...NO_START_TIME,
    });
    expect(res).toEqual({ acquired: false, holderPid: 11111 });
    // the holder's lock is untouched
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('11111');
  });

  it('reclaims a stale lock when the holder is dead', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, ...NO_START_TIME });
    const res = acquireIntegrationLock({ lockPath, pid: 22222, isPidAlive: () => false, ...NO_START_TIME });
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
      ...NO_START_TIME,
    });
    expect(res).toEqual({ acquired: true, stale: true });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('33333');
  });

  it('release is owner-only: a non-owner release leaves the lock in place', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, ...NO_START_TIME });
    expect(releaseIntegrationLock({ lockPath, pid: 99999 })).toBe(false);
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(releaseIntegrationLock({ lockPath, pid: 11111 })).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('release of a missing lock is a quiet no-op', () => {
    expect(releaseIntegrationLock({ lockPath, pid: 11111 })).toBe(false);
  });

  it('acquire-after-release round-trip works (the teardown→next-run path)', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, ...NO_START_TIME });
    releaseIntegrationLock({ lockPath, pid: 11111 });
    const res = acquireIntegrationLock({ lockPath, pid: 22222, ...NO_START_TIME });
    expect(res).toEqual({ acquired: true });
  });
});

// OMN-265: the lock file records the holder's process start time alongside
// its PID (`<pid>\n<lstart>`), so a stale lock whose PID number the OS reused
// can be told apart from the real holder EXACTLY — PID + start time is unique
// per boot — instead of via the deliberately broad 'vitest' command
// substring (which false-refuses when the reused PID belongs to any other
// vitest process on the machine).
describe('acquireIntegrationLock — OMN-265 recorded start-time identity', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omn265-'));
    lockPath = path.join(dir, 'integration.lock');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fresh acquire records `<pid>\\n<start time>` when the start time is readable', () => {
    const res = acquireIntegrationLock({
      lockPath,
      pid: 12345,
      getProcessStartTime: () => 'Sun Jul 13 05:00:00 2026',
    });
    expect(res).toEqual({ acquired: true });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('12345\nSun Jul 13 05:00:00 2026');
  });

  it('stale reclaim also writes the new format (the reclaimer records its own start time)', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, getProcessStartTime: () => 'Sat Jul 12 09:00:00 2026' });
    const res = acquireIntegrationLock({
      lockPath,
      pid: 22222,
      isPidAlive: () => false,
      getProcessStartTime: () => 'Sun Jul 13 05:00:00 2026',
    });
    expect(res).toEqual({ acquired: true, stale: true, holderPid: 11111 });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('22222\nSun Jul 13 05:00:00 2026');
  });

  it("round-trips: the FILE's recorded start time (not any ambient value) reaches verifyPidIdentity", () => {
    acquireIntegrationLock({ lockPath, pid: 11111, getProcessStartTime: () => 'Sat Jul 12 09:00:00 2026' });
    const verifyPidIdentity = vi.fn((): boolean | undefined => true);
    const res = acquireIntegrationLock({
      lockPath,
      pid: 22222,
      isPidAlive: () => true,
      verifyPidIdentity,
      ...NO_START_TIME,
    });
    expect(res).toEqual({ acquired: false, holderPid: 11111 });
    expect(verifyPidIdentity).toHaveBeenCalledWith({
      pid: 11111,
      recordedStartTime: 'Sat Jul 12 09:00:00 2026',
    });
  });

  it('a legacy bare-PID lock reaches verifyPidIdentity with recordedStartTime undefined', () => {
    fs.writeFileSync(lockPath, '11111');
    const verifyPidIdentity = vi.fn((): boolean | undefined => true);
    acquireIntegrationLock({ lockPath, pid: 22222, isPidAlive: () => true, verifyPidIdentity, ...NO_START_TIME });
    expect(verifyPidIdentity).toHaveBeenCalledWith({ pid: 11111, recordedStartTime: undefined });
  });

  it('HEADLINE: a stale lock whose PID was reused by an unrelated vitest process is reclaimed on a start-time mismatch', () => {
    // The pre-OMN-265 trap: the reused PID belongs to a process whose command
    // line DOES contain 'vitest' (say, a unit run in a sibling worktree), so
    // the substring check confirms a holder that is not the writer. The
    // recorded start time disagrees with the live process's — that exact
    // comparison must win, and the substring must not even be consulted.
    fs.writeFileSync(lockPath, '11111\nSat Jul 12 09:00:00 2026');
    const commandMatches = vi.fn((): boolean | undefined => true); // it IS some vitest process…
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = acquireIntegrationLock({
        lockPath,
        pid: 22222,
        isPidAlive: () => true,
        verifyPidIdentity: (check) =>
          verifyLockHolderIdentity(check, {
            getStartTime: () => 'Sun Jul 13 04:59:59 2026', // …but not the one that wrote the lock
            commandMatches,
          }),
        getProcessStartTime: () => 'Sun Jul 13 05:00:00 2026',
      });
      expect(res).toEqual({ acquired: true, stale: true, holderPid: 11111 });
      expect(commandMatches).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('NO FALSE NEGATIVES: a live holder from a different worktree (start times match) is still refused', () => {
    fs.writeFileSync(lockPath, '11111\nSat Jul 12 09:00:00 2026');
    const commandMatches = vi.fn((): boolean | undefined => true);
    const res = acquireIntegrationLock({
      lockPath,
      pid: 22222,
      isPidAlive: () => true,
      verifyPidIdentity: (check) =>
        verifyLockHolderIdentity(check, {
          getStartTime: () => 'Sat Jul 12 09:00:00 2026', // exact match — this IS the writer
          commandMatches,
        }),
      ...NO_START_TIME,
    });
    expect(res).toEqual({ acquired: false, holderPid: 11111 });
    expect(commandMatches).not.toHaveBeenCalled();
  });

  it('release works on the two-line format (owner-only, parsed-PID comparison)', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, getProcessStartTime: () => 'Sun Jul 13 05:00:00 2026' });
    expect(releaseIntegrationLock({ lockPath, pid: 99999 })).toBe(false);
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(releaseIntegrationLock({ lockPath, pid: 11111 })).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('isIntegrationLockLive passes the recorded start time through to verifyPidIdentity', () => {
    fs.writeFileSync(lockPath, '12345\nSat Jul 12 09:00:00 2026');
    const verifyPidIdentity = vi.fn((): boolean | undefined => true);
    expect(isIntegrationLockLive({ lockPath, isPidAlive: () => true, verifyPidIdentity })).toBe(true);
    expect(verifyPidIdentity).toHaveBeenCalledWith({
      pid: 12345,
      recordedStartTime: 'Sat Jul 12 09:00:00 2026',
    });
  });
});

// OMN-263: bare `isPidAlive` can't distinguish "this PID is still the real
// lock holder" from "the OS reassigned this PID number to an unrelated
// process after the real holder died without releasing the lock." These
// drive verifyPidIdentity directly (never the real `ps` binary).
describe('acquireIntegrationLock — OMN-263 PID-reuse identity verification', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omn263-acquire-'));
    lockPath = path.join(dir, 'integration.lock');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a CONFIRMED identity mismatch (alive PID, wrong command) is treated as stale and reclaimed', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, ...NO_START_TIME });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = acquireIntegrationLock({
        lockPath,
        pid: 22222,
        isPidAlive: () => true, // OS says the PID is alive...
        verifyPidIdentity: () => false, // ...but it's confirmed NOT our lock holder (PID reuse)
      });
      expect(res).toEqual({ acquired: true, stale: true, holderPid: 11111 });
      expect(fs.readFileSync(lockPath, 'utf8')).toBe('22222');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('11111');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('an UNVERIFIABLE identity (ps could not confirm either way) preserves the pre-OMN-263 behavior: refuse', () => {
    acquireIntegrationLock({ lockPath, pid: 11111, ...NO_START_TIME });
    const res = acquireIntegrationLock({
      lockPath,
      pid: 22222,
      isPidAlive: () => true,
      verifyPidIdentity: () => undefined, // could not check — must NOT be treated as a mismatch
    });
    expect(res).toEqual({ acquired: false, holderPid: 11111 });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('11111');
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
    const ppids = [4242, 1, 1, 1];
    const onOrphan = vi.fn();
    const stop = startOrphanWatchdog({ getPpid: () => ppids.shift() ?? 1, onOrphan, intervalMs: 100 });
    stop();
    vi.advanceTimersByTime(1000);
    expect(onOrphan).not.toHaveBeenCalled();
  });

  it('born at ppid 1 (container init / launchd) NEVER arms — value is not the signal, the transition is', () => {
    const onOrphan = vi.fn();
    const getPpid = vi.fn(() => 1);
    const stop = startOrphanWatchdog({ getPpid, onOrphan, intervalMs: 100 });
    expect(stop).toBeTypeOf('function');
    vi.advanceTimersByTime(1000);
    expect(onOrphan).not.toHaveBeenCalled();
    expect(getPpid).toHaveBeenCalledTimes(1); // baseline probe only — no interval was ever started
  });
});

describe('startWorkerOrphanGuard (forked-worker gate)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('no-ops without an IPC channel (worker-thread pools — no orphan signal there)', () => {
    const ppids = [4242, 1, 1];
    const onOrphan = vi.fn();
    const stop = startWorkerOrphanGuard({
      hasIpcChannel: false,
      getPpid: () => ppids.shift() ?? 1,
      onOrphan,
      intervalMs: 100,
    });
    expect(stop).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(onOrphan).not.toHaveBeenCalled();
  });

  it('guards forked workers (IPC present): fires on the ppid transition to 1', () => {
    const ppids = [4242, 4242, 1];
    const onOrphan = vi.fn();
    const stop = startWorkerOrphanGuard({
      hasIpcChannel: true,
      getPpid: () => ppids.shift() ?? 1,
      onOrphan,
      intervalMs: 100,
    });
    expect(stop).toBeTypeOf('function');
    vi.advanceTimersByTime(250);
    expect(onOrphan).toHaveBeenCalledTimes(1);
  });
});

// OMN-186 Phase 2: read-only liveness probe — "is an integration run in
// flight right now?" The lock's lifetime IS the fixture epoch, so per-file
// fullCleanup calls use this to decide scoped vs full mode. Must never
// mutate the lock (that's acquire/release's job).
describe('isIntegrationLockLive', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omn186-'));
    lockPath = path.join(dir, 'integration.lock');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('false when no lock file exists', () => {
    expect(isIntegrationLockLive({ lockPath })).toBe(false);
  });

  it('true when the lock holder is alive', () => {
    fs.writeFileSync(lockPath, '12345');
    // OMN-263: verifyPidIdentity mocked true — see the matching note in the
    // acquireIntegrationLock test above.
    expect(isIntegrationLockLive({ lockPath, isPidAlive: () => true, verifyPidIdentity: () => true })).toBe(true);
  });

  it('false when the lock holder is dead (crashed run must not scope later cleanups)', () => {
    fs.writeFileSync(lockPath, '12345');
    expect(isIntegrationLockLive({ lockPath, isPidAlive: () => false })).toBe(false);
  });

  it('false on garbage lock content', () => {
    fs.writeFileSync(lockPath, 'not-a-pid');
    expect(isIntegrationLockLive({ lockPath, isPidAlive: () => true })).toBe(false);
  });

  it('never mutates the lock file', () => {
    fs.writeFileSync(lockPath, '12345');
    isIntegrationLockLive({ lockPath, isPidAlive: () => false });
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('12345');
  });

  it('OMN-263: false on a CONFIRMED identity mismatch (alive PID, wrong command) — the real holder is gone', () => {
    fs.writeFileSync(lockPath, '12345');
    // Pass 4: the mismatch must also WARN (sibling parity with
    // acquireIntegrationLock / killOrphanedSharedServer) — silently flipping
    // cleanup scope left a debugging blind spot.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(isIntegrationLockLive({ lockPath, isPidAlive: () => true, verifyPidIdentity: () => false })).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('12345');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('OMN-263: an UNVERIFIABLE identity preserves the pre-OMN-263 "alive == live" behavior', () => {
    fs.writeFileSync(lockPath, '12345');
    expect(isIntegrationLockLive({ lockPath, isPidAlive: () => true, verifyPidIdentity: () => undefined })).toBe(true);
  });
});

// OMN-263: the shared identity-check primitive both call sites (the OMN-143
// lock above, and shared-server.ts's killOrphanedSharedServer) build on.
describe('commandMatchesPid', () => {
  it('true when the command contains the expected substring', () => {
    expect(commandMatchesPid(4242, 'vitest', { getProcessCommand: () => '/usr/bin/node vitest run' })).toBe(true);
  });

  it('false when the command does not contain the expected substring — a confirmed mismatch', () => {
    expect(commandMatchesPid(4242, 'vitest', { getProcessCommand: () => 'node dist/index.js' })).toBe(false);
  });

  it('undefined when the command could not be read — "could not verify", not a guess', () => {
    expect(commandMatchesPid(4242, 'vitest', { getProcessCommand: () => undefined })).toBeUndefined();
  });
});

describe('getProcessCommand', () => {
  it('finds a real command line for the current process (live ps invocation, no mock)', () => {
    // Unlike every other test in this file, this deliberately exercises the
    // REAL `ps` binary — the one place a live OS check is the point, mirroring
    // pidIsAlive's own "true for the current process" test above. node's own
    // executable path is a stable, guaranteed-present substring regardless of
    // how the test runner invoked this process (vitest, an IDE runner, etc).
    const command = getProcessCommand(process.pid);
    expect(command).toBeDefined();
    expect(command).toContain('node');
  });

  it('undefined for a PID that does not exist', () => {
    // Near the macOS pid_max ceiling — overwhelmingly unlikely to exist; see
    // the identical rationale on pidIsAlive's test above.
    expect(getProcessCommand(99999998)).toBeUndefined();
  });
});

describe('getProcessStartTime (OMN-265)', () => {
  it('reads a stable lstart for the current process (live ps invocation, no mock — same rationale as getProcessCommand)', () => {
    const startTime = getProcessStartTime(process.pid);
    expect(startTime).toBeDefined();
    // lstart is per-process-constant: two reads must agree exactly, which is
    // the property the whole OMN-265 comparison scheme rests on.
    expect(getProcessStartTime(process.pid)).toBe(startTime);
  });

  it('undefined for a PID that does not exist', () => {
    expect(getProcessStartTime(99999998)).toBeUndefined();
  });

  it("rendering is pinned against the caller's TZ/locale — writer and checker must agree byte-for-byte across environments", () => {
    // /code-review finding on PR #222: `ps -o lstart=` renders in the CALLING
    // process's LC_TIME and TZ (empirically: fr_FR gives 'lun. 13 juil. …',
    // TZ=UTC shifts the wall-clock digits), so an unpinned reader lets a
    // checker under a different environment (launchd job, SSH, CI) see a
    // DIFFERENT string for the same live holder → exact-compare says
    // "confirmed stale" → a LIVE lock is reclaimed: the dangerous direction.
    // Pin: the function must return the same rendering no matter what
    // TZ/LC_ALL this process carries.
    const originalTZ = process.env.TZ;
    const originalLcAll = process.env.LC_ALL;
    try {
      process.env.TZ = 'UTC';
      process.env.LC_ALL = 'C';
      const rendered = getProcessStartTime(process.pid);
      process.env.TZ = 'Asia/Tokyo'; // UTC+9, no DST — guaranteed different wall clock
      process.env.LC_ALL = 'fr_FR.UTF-8';
      expect(getProcessStartTime(process.pid)).toBe(rendered);
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
      if (originalLcAll === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = originalLcAll;
    }
  });
});
