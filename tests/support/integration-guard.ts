/**
 * OMN-143: integration-suite single-instance lock + orphan watchdog.
 *
 * Why this exists (2026-06-09 forensics): killing the shell that launched
 * `npm run test:integration` does NOT kill vitest's process tree. Orphaned and
 * concurrently relaunched runs kept executing destructive teardowns
 * (fullCleanup, sandbox-folder deletion) into a live verify session for an
 * hour after their launching agent stopped — and the globalSetup's own startup
 * cleanup sweep is equally destructive, so concurrency must be refused BEFORE
 * it runs.
 *
 * Both helpers are dependency-injected so unit tests can drive them without
 * real PIDs, real lock contention, or real process exits.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_LOCK_PATH = path.join(os.homedir(), '.omnifocus-mcp', 'integration.lock');

export interface LockResult {
  acquired: boolean;
  /** PID found in an existing lock file (live holder when refused; previous holder when stale-reclaimed). */
  holderPid?: number;
  /** True when an existing lock was reclaimed because its holder is dead (or its content was garbage). */
  stale?: boolean;
}

/**
 * Liveness probe: signal 0 sends nothing but checks deliverability. EPERM
 * means the process exists but belongs to another user — that still counts
 * as alive (we must not steal its lock).
 */
export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string }).code === 'EPERM';
  }
}

export function acquireIntegrationLock(
  opts: {
    lockPath?: string;
    pid?: number;
    isPidAlive?: (pid: number) => boolean;
  } = {},
): LockResult {
  const lockPath = opts.lockPath ?? DEFAULT_LOCK_PATH;
  const pid = opts.pid ?? process.pid;
  const isAlive = opts.isPidAlive ?? pidIsAlive;

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  // Happy path: atomic create-exclusive. Anything but EEXIST is a real error.
  try {
    fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
    return { acquired: true };
  } catch (e) {
    if ((e as { code?: string }).code !== 'EEXIST') throw e;
  }

  const raw = fs.readFileSync(lockPath, 'utf8').trim();
  const holder = Number.parseInt(raw, 10);
  const holderValid = Number.isFinite(holder) && holder > 0;

  if (holderValid && isAlive(holder)) {
    return { acquired: false, holderPid: holder };
  }

  // Dead holder or garbage content → stale lock. Reclaim by overwrite. (A
  // race between two reclaiming processes is acceptable: both believe the
  // prior holder is dead, and the lock's purpose is refusing LIVE overlap.)
  fs.writeFileSync(lockPath, String(pid));
  return { acquired: true, stale: true, ...(holderValid ? { holderPid: holder } : {}) };
}

/**
 * Release ONLY if the lock still contains our PID — never delete a lock a
 * later run legitimately reclaimed (e.g. after we were SIGKILLed and restarted).
 */
export function releaseIntegrationLock(
  opts: {
    lockPath?: string;
    pid?: number;
  } = {},
): boolean {
  const lockPath = opts.lockPath ?? DEFAULT_LOCK_PATH;
  const pid = opts.pid ?? process.pid;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8').trim();
    if (raw !== String(pid)) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false; // already gone (or unreadable) — nothing to release
  }
}

/**
 * Abort the process when its parent dies. On macOS/Linux an orphaned process
 * is reparented to PID 1, so `process.ppid === 1` is the orphan signature.
 * The interval is unref'd: the watchdog never keeps the process alive.
 *
 * Returns a stop() handle for clean teardown.
 */
/**
 * Worker-side orphan guard. Vitest's globalSetup (where startOrphanWatchdog
 * runs) executes ONLY in the vitest main process — forked pool workers, which
 * run the test files AND their destructive afterAll teardowns, outlive a dead
 * main (kill-test 2026-06-09: main died in ~1s, the fork survived at ppid 1).
 *
 * Forked workers have an IPC channel (`process.send`); thread-pool workers do
 * not. Gating on IPC presence makes this a no-op in unit thread runs and
 * active exactly where orphan survival was observed.
 */
export function startWorkerOrphanGuard(
  opts: {
    hasIpcChannel?: boolean;
    getPpid?: () => number;
    onOrphan?: () => void;
    intervalMs?: number;
  } = {},
): (() => void) | undefined {
  const hasIpc = opts.hasIpcChannel ?? typeof process.send === 'function';
  if (!hasIpc) return undefined;
  return startOrphanWatchdog(opts);
}

export function startOrphanWatchdog(
  opts: {
    getPpid?: () => number;
    onOrphan?: () => void;
    intervalMs?: number;
  } = {},
): () => void {
  const getPpid = opts.getPpid ?? ((): number => process.ppid);
  const onOrphan =
    opts.onOrphan ??
    ((): void => {
      console.error(
        '[Integration Guard] Parent process died (reparented to PID 1) — ' +
          'aborting orphaned integration run before it executes more destructive teardowns (OMN-143).',
      );
      process.exit(130);
    });
  const intervalMs = opts.intervalMs ?? 2000;

  const interval = setInterval(() => {
    if (getPpid() === 1) {
      clearInterval(interval);
      onOrphan();
    }
  }, intervalMs);
  interval.unref();

  return (): void => clearInterval(interval);
}
