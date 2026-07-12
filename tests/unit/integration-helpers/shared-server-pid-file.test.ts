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

  it('writes the PID file successfully when the path is writable', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const pidFilePath = join(dir, 'shared-server.pid');

    recordSharedServerPid(4242, pidFilePath);

    expect(existsSync(pidFilePath)).toBe(true);
    expect(readFileSync(pidFilePath, 'utf-8')).toBe('4242');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does nothing when pid is undefined', async () => {
    const { recordSharedServerPid } = await import('../../integration/helpers/shared-server.js');
    const pidFilePath = join(dir, 'shared-server.pid');

    recordSharedServerPid(undefined, pidFilePath);

    expect(existsSync(pidFilePath)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
