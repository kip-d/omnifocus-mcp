import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
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
