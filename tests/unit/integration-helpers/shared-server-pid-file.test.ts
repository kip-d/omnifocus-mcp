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
    expect(() =>
      killOrphanedSharedServer({
        pidFilePath,
        isPidAlive: () => true,
        kill: () => {
          throw new Error('should not be called');
        },
      }),
    ).not.toThrow();
  });

  it('sends SIGTERM to a live PID and removes the file', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    const killed: Array<{ pid: number; signal: string }> = [];
    killOrphanedSharedServer({
      pidFilePath,
      isPidAlive: (pid) => pid === 4242,
      kill: (pid, signal) => killed.push({ pid, signal }),
    });

    expect(killed).toEqual([{ pid: 4242, signal: 'SIGTERM' }]);
    expect(existsSync(pidFilePath)).toBe(false);
  });

  it('removes the file but does not kill when the recorded PID is no longer alive', async () => {
    const fs = await import('fs');
    fs.writeFileSync(pidFilePath, '4242', 'utf-8');
    const { killOrphanedSharedServer } = await import('../../integration/helpers/shared-server.js');

    killOrphanedSharedServer({
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
