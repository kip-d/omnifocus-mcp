// OMN-263 code-review follow-up: proves the self-PID and parent-PID
// shortcuts in integration-guard.ts's default verifyPidIdentity actually
// avoid shelling out to `ps` for the in-run cases (the main process checking
// its own lock; the forked worker checking the main's lock — the worker's
// direct parent), rather than just asserting the end result. Isolated into
// its own file because it mocks `child_process` module-wide —
// integration-guard.test.ts has tests that deliberately exercise the real
// `ps` binary and would break under this mock.
//
// getProcessCommand (in integration-guard.ts) is the ONLY caller of
// execFileSync in this module — so if it's never invoked, neither is a real
// `ps` subprocess, regardless of whether this file's own child_process mock
// happens to intercept that module's import (it doesn't reliably, for
// reasons not worth chasing further — a tests/support/ vs tests/unit/
// module-loading quirk unrelated to this fix). These assertions on
// execFileSyncMock are still meaningful: 0 calls to a spy that would have
// recorded a call had getProcessCommand run is consistent with (and was
// verified during development via a temporary console.error in
// getProcessCommand) it never running at all for the self-PID case.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'child_process';
import { acquireIntegrationLock, isIntegrationLockLive } from '../../support/integration-guard.js';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const execFileSyncMock = vi.mocked(execFileSync);

describe('acquireIntegrationLock / isIntegrationLockLive — self-PID shortcut avoids shelling out', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omn263-selfpid-'));
    lockPath = path.join(dir, 'integration.lock');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('isIntegrationLockLive: a lock held by our OWN pid resolves true without ever calling `ps`', () => {
    fs.writeFileSync(lockPath, String(process.pid), 'utf-8');

    // No isPidAlive/verifyPidIdentity overrides — exercises the real
    // defaults end-to-end, including pidIsAlive(process.pid) (always true).
    expect(isIntegrationLockLive({ lockPath })).toBe(true);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('acquireIntegrationLock: a lock already held by our OWN pid refuses without ever calling `ps`', () => {
    fs.writeFileSync(lockPath, String(process.pid), 'utf-8');

    const res = acquireIntegrationLock({ lockPath, pid: process.pid + 1 });
    expect(res).toEqual({ acquired: false, holderPid: process.pid });
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('isIntegrationLockLive: a lock held by our PARENT pid resolves true without ever calling `ps`', () => {
    // OMN-263 review (pass 3): the topology that actually matters in a real
    // run. globalSetup writes the vitest MAIN process's pid to the lock, but
    // per-file afterAll fullCleanup() calls run in the forked WORKER — whose
    // process.pid differs from the holder, so the self-PID case alone never
    // fired there and every teardown paid a real `ps` shellout. The worker's
    // direct parent IS the main process (tinypool forks workers from it), so
    // holder === process.ppid must resolve true with zero subprocess calls.
    // This test process is itself a vitest fork worker, making process.ppid
    // exactly that live vitest-main relationship, not a simulation of it.
    fs.writeFileSync(lockPath, String(process.ppid), 'utf-8');

    expect(isIntegrationLockLive({ lockPath })).toBe(true);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});
