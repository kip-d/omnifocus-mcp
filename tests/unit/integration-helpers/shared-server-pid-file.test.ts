import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, chmodSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('killOrphanedSharedServer', () => {
  let dir: string;
  let pidFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omn261-pidfile-'));
    pidFilePath = join(dir, 'shared-server.pid');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when no PID file exists', async () => {
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    await expect(
      killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true,
        kill: () => {
          throw new Error('should not be called');
        },
      }),
    ).resolves.not.toThrow();
  });

  it('sends SIGTERM to a live PID, removes the file, and polls until it reports dead', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    const killed: Array<{ pid: number; signal: string }> = [];
    let alive = true;
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: (pid) => pid === 4242 && alive,
      // OMN-263: confirmed-match mock, so this stays fully dependency-injected
      // rather than shelling out to the real `ps` binary for a fake PID.
      verifyPidIdentity: () => true,
      kill: (pid, signal) => {
        killed.push({ pid, signal });
        alive = false; // simulate the process dying right after SIGTERM
      },
      reapTimeoutMs: 200,
      reapPollIntervalMs: 5,
    });

    expect(killed).toEqual([{ pid: 4242, signal: 'SIGTERM' }]);
    expect(existsSync(pidFilePath)).toBe(false);
  });

  it('escalates to SIGKILL when SIGTERM does not land within the reap timeout', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const killed: string[] = [];
      let alive = true;
      await killOrphanedSharedServer({
        pidFilePath,
        // survives SIGTERM, dies on SIGKILL
        isPidAlive: () => alive,
        verifyPidIdentity: () => true,
        kill: (_pid, signal) => {
          killed.push(signal);
          if (signal === 'SIGKILL') alive = false;
        },
        reapTimeoutMs: 30,
        sigkillReapTimeoutMs: 30,
        reapPollIntervalMs: 5,
      });

      expect(killed).toEqual(['SIGTERM', 'SIGKILL']);
      // it actually died on SIGKILL, so no leftover warning
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns instead of hanging when the PID survives even SIGKILL', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const killed: string[] = [];
      await killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true, // never reports dead, even after SIGKILL
        verifyPidIdentity: () => true,
        kill: (_pid, signal) => killed.push(signal),
        reapTimeoutMs: 30,
        sigkillReapTimeoutMs: 30,
        reapPollIntervalMs: 5,
      });

      expect(killed).toEqual(['SIGTERM', 'SIGKILL']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('4242');
      expect(String(warnSpy.mock.calls[0][0])).toContain('SIGKILL');
      // OMN-267: a SIGKILL survivor is still alive, so its record must be
      // KEPT — the next run's setup retries the escalation. (Kip's review
      // call: accept the repeated ~10s retry cost on an unkillable process;
      // it's loud, rare, and self-heals when the process finally dies.)
      expect(existsSync(pidFilePath)).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('waitForExit: false sends SIGTERM and returns immediately without polling or warning', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const killed: Array<{ pid: number; signal: string }> = [];
      await killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true, // stays "alive" throughout — would trigger the timeout warning if polled
        verifyPidIdentity: () => true,
        kill: (pid, signal) => killed.push({ pid, signal }),
        waitForExit: false,
        reapTimeoutMs: 60_000, // would make the test hang if the poll ran anyway
      });

      expect(killed).toEqual([{ pid: 4242, signal: 'SIGTERM' }]);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  // ── OMN-267: teardown's fire-and-forget SIGTERM must leave the PID record
  // behind. `waitForExit: false` never learns whether the SIGTERM landed
  // (polling there false-alarms on zombies — the OMN-261 pass-2 constraint),
  // so the unlink moves to the points where death IS confirmed. A wedged
  // survivor (event loop blocked in a sync osascript call; observed live
  // 2026-07-13) is then rediscovered and finished by the NEXT run's setup,
  // instead of becoming a permanent, unrecorded ppid-1 orphan.
  // Spec: Technical/specs/OMN-267-teardown-wedged-server-stranding.md

  it('waitForExit: false keeps the record when the process ignores SIGTERM (wedge), preserving its contents', async () => {
    const fs = await import('fs');
    const record = '4242\n/worktree-a/dist/index.js';
    fs.writeFileSync(pidFilePath, record, 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    const killed: string[] = [];
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => true, // wedged: still alive after SIGTERM
      verifyPidIdentity: () => true,
      kill: (_pid, signal) => {
        killed.push(signal); // no-op: the wedge ignores the signal
      },
      waitForExit: false,
    });

    expect(killed).toEqual(['SIGTERM']);
    expect(existsSync(pidFilePath)).toBe(true);
    expect(readFileSync(pidFilePath, 'utf-8')).toBe(record);
  });

  it('waitForExit: false keeps the record even when the process exits promptly (teardown cannot tell the cases apart)', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    let alive = true;
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => alive,
      verifyPidIdentity: () => true,
      kill: () => {
        alive = false; // normal case: SIGTERM lands immediately
      },
      waitForExit: false,
    });

    // The record stays either way; the next run's setup clears a dead-PID
    // record silently (see the silent-clear test below).
    expect(existsSync(pidFilePath)).toBe(true);
  });

  it('a record left by teardown is finished by the next setup: escalation runs, file unlinked on confirmed death', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242\n/worktree-a/dist/index.js', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    // Run 1's teardown: fire-and-forget against a wedge — record survives.
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => true,
      verifyPidIdentity: () => true,
      kill: () => {},
      waitForExit: false,
    });
    expect(existsSync(pidFilePath)).toBe(true);

    // Run 2's setup: awaited escalation finishes the wedged survivor.
    const killed: string[] = [];
    let alive = true;
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => alive,
      verifyPidIdentity: () => true,
      kill: (_pid, signal) => {
        killed.push(signal);
        if (signal === 'SIGKILL') alive = false; // still ignoring SIGTERM
      },
      reapTimeoutMs: 30,
      sigkillReapTimeoutMs: 30,
      reapPollIntervalMs: 5,
    });

    expect(killed).toEqual(['SIGTERM', 'SIGKILL']);
    expect(existsSync(pidFilePath)).toBe(false);
  });

  it('clears a dead-PID record silently: unlink, no signal, no warning', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242\n/worktree-a/dist/index.js', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => false, // the teardown-killed server exited normally
        kill: () => {
          throw new Error('should not be called');
        },
      });

      expect(existsSync(pidFilePath)).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('unlinks a garbage record without signaling', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, 'not-a-pid', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => true,
      kill: () => {
        throw new Error('should not be called');
      },
    });

    expect(existsSync(pidFilePath)).toBe(false);
  });

  // ── OMN-267 gate round 1: only ESRCH confirms death. EPERM (and any other
  // non-ESRCH error) means the process may well be alive but unsignalable —
  // deleting its record there reintroduces the unrecorded-orphan class.
  // pidIsAlive in integration-guard.ts encodes the same semantics (EPERM =
  // alive, "we must not steal its lock").

  it('keeps the record and warns when SIGTERM throws a non-ESRCH error (process alive but unsignalable)', async () => {
    const fs = await import('fs');
    const record = '4242\n/worktree-a/dist/index.js';
    fs.writeFileSync(pidFilePath, record, 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const killed: string[] = [];
      await killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true,
        verifyPidIdentity: () => true,
        kill: (_pid, signal) => {
          killed.push(signal);
          throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
        },
        reapTimeoutMs: 30,
        reapPollIntervalMs: 5,
      });

      // No SIGKILL escalation attempt — the same permission failure would
      // just repeat; the kept record lets a future run (possibly with
      // different privileges) retry.
      expect(killed).toEqual(['SIGTERM']);
      expect(existsSync(pidFilePath)).toBe(true);
      expect(readFileSync(pidFilePath, 'utf-8')).toBe(record);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('4242');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('keeps the record and warns when the SIGKILL escalation throws a non-ESRCH error', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242\n/worktree-a/dist/index.js', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const killed: string[] = [];
      await killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true, // survives SIGTERM, forcing the escalation
        verifyPidIdentity: () => true,
        kill: (_pid, signal) => {
          killed.push(signal);
          if (signal === 'SIGKILL') {
            throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
          }
        },
        reapTimeoutMs: 30,
        sigkillReapTimeoutMs: 30,
        reapPollIntervalMs: 5,
      });

      expect(killed).toEqual(['SIGTERM', 'SIGKILL']);
      expect(existsSync(pidFilePath)).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('4242');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('unlinks when the SIGKILL escalation throws ESRCH (died between the poll and the escalation)', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => true,
      verifyPidIdentity: () => true,
      kill: (_pid, signal) => {
        if (signal === 'SIGKILL') {
          throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
        }
      },
      reapTimeoutMs: 30,
      sigkillReapTimeoutMs: 30,
      reapPollIntervalMs: 5,
    });

    expect(existsSync(pidFilePath)).toBe(false);
  });

  // OMN-267 gate round 1: removeRecord must not silently swallow non-ENOENT
  // unlink failures — seven branches would proceed believing cleanup
  // succeeded while a stale record persists. (Warn, not throw: unlike the
  // integration-guard sibling, this runs inside setup/teardown, where a
  // throw would fail the whole run over a cleanup bookkeeping problem.)
  it('warns when the unlink fails for a reason other than ENOENT, instead of silently proceeding', async () => {
    const fs = await import('fs');
    const lockedDir = join(dir, 'locked');
    mkdirSync(lockedDir);
    const lockedPidPath = join(lockedDir, 'shared-server.pid');
    fs.writeFileSync(lockedPidPath, '4242', 'utf-8');
    chmodSync(lockedDir, 0o555); // unlink permission comes from the directory
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await killOrphanedSharedServer({
        pidFilePath: lockedPidPath,
        isPidAlive: () => false, // dead-PID branch → removeRecord()
        kill: () => {
          throw new Error('should not be called');
        },
      });

      expect(existsSync(lockedPidPath)).toBe(true); // the unlink really failed
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain(lockedPidPath);
    } finally {
      chmodSync(lockedDir, 0o755);
      warnSpy.mockRestore();
    }
  });

  it('unlinks when SIGTERM throws because the process died in the read-to-kill gap', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    await expect(
      killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true,
        verifyPidIdentity: () => true,
        kill: () => {
          throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
        },
      }),
    ).resolves.not.toThrow();

    expect(existsSync(pidFilePath)).toBe(false);
  });

  it('removes the file but does not kill when the recorded PID is no longer alive', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => false,
      kill: () => {
        throw new Error('should not be called');
      },
    });

    expect(existsSync(pidFilePath)).toBe(false);
  });

  // OMN-263: bare `isPidAlive` can't distinguish "still our orphaned server"
  // from "the OS reassigned this PID number to an unrelated process" (worst
  // case, a long-running production `dist/index.js` server, since that's the
  // same command this file spawns).
  it('a CONFIRMED identity mismatch (alive PID, wrong command) skips the kill and warns', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true, // OS says the PID is alive...
        verifyPidIdentity: () => false, // ...but confirmed NOT our spawned server (PID reuse)
        kill: () => {
          throw new Error('should not be called — identity mismatch must skip the kill');
        },
      });

      // the PID file is still removed (it's stale either way) — only the kill is skipped.
      expect(existsSync(pidFilePath)).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('4242');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('an UNVERIFIABLE identity (ps could not confirm either way) preserves the pre-OMN-263 behavior: kill proceeds', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    const killed: Array<{ pid: number; signal: string }> = [];
    let alive = true;
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => alive,
      verifyPidIdentity: () => undefined, // could not check — must NOT be treated as a mismatch
      kill: (pid, signal) => {
        killed.push({ pid, signal });
        alive = false;
      },
      reapTimeoutMs: 200,
      reapPollIntervalMs: 5,
    });

    expect(killed).toEqual([{ pid: 4242, signal: 'SIGTERM' }]);
  });

  // OMN-263 pass 4: the identity check must verify against the spawn path
  // RECORDED IN THE FILE (written by whichever worktree spawned the server),
  // never against the reaper's own checkout path — a machine-global PID file
  // can legitimately name a sibling worktree's orphan, which the reaper's
  // own SERVER_PATH would never match.
  it('passes the recorded spawn path from the PID file to the identity check', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242\n/worktree-a/dist/index.js', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    const verifyCalls: Array<{ pid: number; recordedCommand: string | undefined }> = [];
    const killed: string[] = [];
    let alive = true;
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => alive,
      verifyPidIdentity: ({ pid, recordedCommand }) => {
        verifyCalls.push({ pid, recordedCommand });
        return true;
      },
      kill: (_pid, signal) => {
        killed.push(signal);
        alive = false;
      },
      reapTimeoutMs: 200,
      reapPollIntervalMs: 5,
    });

    expect(verifyCalls).toEqual([{ pid: 4242, recordedCommand: '/worktree-a/dist/index.js' }]);
    expect(killed).toEqual(['SIGTERM']);
  });

  it('a legacy bare-PID file reaches the identity check with no recorded command', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    const verifyCalls: Array<{ pid: number; recordedCommand: string | undefined }> = [];
    let alive = true;
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => alive,
      verifyPidIdentity: ({ pid, recordedCommand }) => {
        verifyCalls.push({ pid, recordedCommand });
        return true;
      },
      kill: () => {
        alive = false;
      },
      reapTimeoutMs: 200,
      reapPollIntervalMs: 5,
    });

    expect(verifyCalls).toEqual([{ pid: 4242, recordedCommand: undefined }]);
  });

  it('round-trips: a path recorded by recordSharedServerPid is what the reaper verifies against', async () => {
    const { recordSharedServerPid, killOrphanedSharedServer } =
      await import('../../integration/helpers/shared-server.js');
    recordSharedServerPid(4242, pidFilePath, '/worktree-a/dist/index.js');

    let seenRecordedCommand: string | undefined;
    let alive = true;
    await killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: () => alive,
      verifyPidIdentity: ({ recordedCommand }) => {
        seenRecordedCommand = recordedCommand;
        return true;
      },
      kill: () => {
        alive = false;
      },
      reapTimeoutMs: 200,
      reapPollIntervalMs: 5,
    });

    expect(seenRecordedCommand).toBe('/worktree-a/dist/index.js');
  });
});

describe('recordSharedServerPid', () => {
  let dir: string;
  let readonlyParent: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omn261-pidfile-write-'));
    readonlyParent = join(dir, 'readonly');
    mkdirSync(readonlyParent);
    chmodSync(readonlyParent, 0o555); // read + execute, no write — blocks creating new entries
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    chmodSync(readonlyParent, 0o755); // restore so rmSync can clean up
    rmSync(dir, { recursive: true, force: true });
  });

  it('warns loudly instead of silently swallowing a write failure', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const pidFilePath = join(readonlyParent, 'nested', 'shared-server.pid');

    expect(() => recordSharedServerPid(4242, pidFilePath)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('4242');
  });

  it('writes the PID plus the recorded spawn path (OMN-263 pass 4 format)', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const pidFilePath = join(dir, 'shared-server.pid');

    recordSharedServerPid(4242, pidFilePath, '/worktree-a/dist/index.js');

    expect(existsSync(pidFilePath)).toBe(true);
    expect(readFileSync(pidFilePath, 'utf-8')).toBe('4242\n/worktree-a/dist/index.js');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('defaults the recorded spawn path to this checkout’s SERVER_PATH', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const { SERVER_PATH } = await import('../../integration/helpers/server-path.js');
    const pidFilePath = join(dir, 'shared-server.pid');

    recordSharedServerPid(4242, pidFilePath);

    expect(readFileSync(pidFilePath, 'utf-8')).toBe(`4242\n${SERVER_PATH}`);
  });

  it('does nothing when pid is undefined', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const pidFilePath = join(dir, 'shared-server.pid');

    recordSharedServerPid(undefined, pidFilePath);

    expect(existsSync(pidFilePath)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // OMN-267 gate round 1: the PID file has exactly ONE slot. If setup() kept
  // a SIGKILL-survivor's record, this run's own server registration is the
  // point where that record is lost — it must at least be loud about it, so
  // an untracked orphan leaves a trace in the run log.
  it('warns when overwriting an existing record for a DIFFERENT pid (survivor slot loss)', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const pidFilePath = join(dir, 'shared-server.pid');

    recordSharedServerPid(4242, pidFilePath, '/worktree-a/dist/index.js');
    recordSharedServerPid(5555, pidFilePath, '/worktree-b/dist/index.js');

    expect(readFileSync(pidFilePath, 'utf-8')).toBe('5555\n/worktree-b/dist/index.js');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('4242');
  });

  it('does not warn when re-recording the same pid', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const pidFilePath = join(dir, 'shared-server.pid');

    recordSharedServerPid(4242, pidFilePath, '/worktree-a/dist/index.js');
    recordSharedServerPid(4242, pidFilePath, '/worktree-a/dist/index.js');

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
