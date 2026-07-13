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
});
