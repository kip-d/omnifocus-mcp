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
// OMN-263 code-review follow-up: bare specifier (not 'node:child_process'),
// matching this codebase's established, tested-mockable convention (see
// src/utils/version.ts + tests/unit/utils/version.test.ts) — vitest's
// vi.mock('child_process', ...) does not reliably intercept a source import
// written as 'node:child_process', even though Node resolves both the same.
import { execFileSync } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_LOCK_PATH = path.join(os.homedir(), '.omnifocus-mcp', 'integration.lock');

// OMN-263: substring expected in `ps`'s command-line output for the process
// that legitimately holds this lock — the vitest orchestrator process
// running an integration suite. This is the ONLY context acquireIntegrationLock
// is ever called from in this repo (vitest.config.ts gates `globalSetup` off
// for unit-only runs), so "vitest" in the command line is a reliable check,
// not a guess.
const LOCK_HOLDER_COMMAND_SUBSTRING = 'vitest';

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

/** Parses lock-file content into a valid holder PID, or undefined if missing/garbage. */
export function parseLockPid(raw: string): number | undefined {
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

/**
 * OMN-263: reads a live process's command line via `ps` (macOS — this
 * repo's only real target; both call sites of this module require OmniFocus,
 * which is Mac-only, or run alongside it). Returns undefined if the process
 * is gone or `ps` itself fails, so callers can distinguish "confirmed not a
 * match" from "couldn't check" instead of the two being conflated.
 */
export function getProcessCommand(pid: number): string | undefined {
  try {
    // stdio: pipe stdout (what we read), swallow stderr — `ps` writes a
    // diagnostic there for a PID it rejects outright (e.g. out of range),
    // which is an expected outcome here, not something to surface.
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * OMN-263: does the live process at `pid` look like the one that actually
 * holds this lock/PID file, or did the OS reassign that PID number to an
 * unrelated process after the real holder exited without cleaning up?
 * `pidIsAlive` (bare `kill(pid, 0)`) cannot distinguish these — this checks
 * the process's command line for `expectedCommandSubstring` instead.
 *
 * Returns undefined ("could not verify") rather than guessing when the
 * command can't be read, so callers pick their own safe fallback for that
 * case instead of this function silently choosing one for them.
 */
export function commandMatchesPid(
  pid: number,
  expectedCommandSubstring: string,
  opts: { getProcessCommand?: (pid: number) => string | undefined } = {},
): boolean | undefined {
  const getCommand = opts.getProcessCommand ?? getProcessCommand;
  const command = getCommand(pid);
  if (command === undefined) return undefined;
  return command.includes(expectedCommandSubstring);
}

/**
 * OMN-263 code-review follow-up: the default `verifyPidIdentity` for
 * acquireIntegrationLock/isIntegrationLockLive. A process is trivially,
 * unconditionally itself — when `holderPid === process.pid`, the caller IS
 * the process asking "is this PID still a legitimate lock holder," so no `ps`
 * shellout is needed (or even meaningful) to answer it. This isn't a
 * weakening of the check: PID reuse is a question about a DIFFERENT process
 * having inherited a dead process's number, which cannot apply to asking
 * whether you are yourself.
 *
 * This matters beyond micro-optimization: isIntegrationLockLive is called
 * from sandbox-manager.ts's fullCleanup() on nearly every integration test
 * file's afterAll teardown (and unconditionally, even when scope:'full'
 * already ignores the result — see resolveCleanupMode's short-circuit) — and
 * in that call path `holderPid` is virtually always the CURRENT run's own
 * PID, checking its own still-held lock. Without this shortcut, the
 * `commandMatchesPid` default would shell out to `ps` on nearly every
 * teardown across the suite; this makes that path free again for the common
 * case, while still doing the real check for the genuine cross-process case
 * (a stale lock file naming a since-reused PID).
 */
function verifyLockHolderIdentity(holderPid: number): boolean | undefined {
  if (holderPid === process.pid) return true;
  return commandMatchesPid(holderPid, LOCK_HOLDER_COMMAND_SUBSTRING);
}

export function acquireIntegrationLock(
  opts: {
    lockPath?: string;
    pid?: number;
    isPidAlive?: (pid: number) => boolean;
    verifyPidIdentity?: (pid: number) => boolean | undefined;
  } = {},
): LockResult {
  const lockPath = opts.lockPath ?? DEFAULT_LOCK_PATH;
  const pid = opts.pid ?? process.pid;
  const isAlive = opts.isPidAlive ?? pidIsAlive;
  const verifyIdentity = opts.verifyPidIdentity ?? verifyLockHolderIdentity;

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  // Happy path: atomic create-exclusive. Anything but EEXIST is a real error.
  try {
    fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
    return { acquired: true };
  } catch (e) {
    if ((e as { code?: string }).code !== 'EEXIST') throw e;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, 'utf8').trim();
  } catch (e) {
    // The holder released (unlinked) between our EEXIST and this read — retry
    // the atomic create once; a second EEXIST means a new holder won the race.
    if ((e as { code?: string }).code !== 'ENOENT') throw e;
    try {
      fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
      return { acquired: true };
    } catch (e2) {
      if ((e2 as { code?: string }).code !== 'EEXIST') throw e2;
      raw = fs.readFileSync(lockPath, 'utf8').trim();
    }
  }
  const holder = parseLockPid(raw);

  if (holder !== undefined && isAlive(holder)) {
    // OMN-263: bare liveness can't distinguish "this PID is still our lock
    // holder" from "the OS reassigned this PID number to an unrelated
    // process after the real holder died without releasing the lock."
    // Unverifiable (ps failed, or the process exited in the gap between the
    // liveness check above and here) falls through to the pre-OMN-263
    // behavior — refuse — rather than newly reclaiming a lock that might
    // still be live; only a CONFIRMED mismatch treats the holder as gone.
    const identity = verifyIdentity(holder);
    if (identity !== false) {
      return { acquired: false, holderPid: holder };
    }
    console.warn(
      `[Integration Guard] Lock at ${lockPath} names PID ${holder}, which is alive but its command line doesn't ` +
        'look like a vitest process (OMN-263 PID-reuse check) — treating the lock as stale rather than trusting bare liveness.',
    );
  }

  // Dead holder, garbage content, or confirmed PID reuse (OMN-263) → stale lock. Unlink-then-recreate so the
  // atomic `wx` decides between concurrent reclaimers in all but a
  // sub-millisecond unlink/create interleaving (a strictly narrower residue
  // than plain overwrite; closing it fully needs flock/link(2) — not worth
  // the dependency for a single-dev-machine lock). The loser sees the
  // winner's live PID and refuses.
  try {
    fs.unlinkSync(lockPath);
  } catch (e) {
    if ((e as { code?: string }).code !== 'ENOENT') throw e;
  }
  try {
    fs.writeFileSync(lockPath, String(pid), { flag: 'wx' });
  } catch (e) {
    if ((e as { code?: string }).code !== 'EEXIST') throw e;
    const winner = parseLockPid(fs.readFileSync(lockPath, 'utf8').trim());
    return { acquired: false, ...(winner !== undefined ? { holderPid: winner } : {}) };
  }
  return { acquired: true, stale: true, ...(holder !== undefined ? { holderPid: holder } : {}) };
}

/**
 * OMN-186 Phase 2: read-only probe — is an integration run in flight right
 * now? True only when the lock file exists, holds a valid PID, and that PID
 * is alive. The lock's lifetime IS the per-run fixture epoch: per-file
 * fullCleanup calls use this to run in scoped mode mid-run (see
 * sandbox-manager.ts), and a crashed run's stale lock must read as NOT live
 * so later manual cleanups stay full-sweep. Never mutates the lock.
 */
export function isIntegrationLockLive(
  opts: {
    lockPath?: string;
    isPidAlive?: (pid: number) => boolean;
    verifyPidIdentity?: (pid: number) => boolean | undefined;
  } = {},
): boolean {
  const lockPath = opts.lockPath ?? DEFAULT_LOCK_PATH;
  const isAlive = opts.isPidAlive ?? pidIsAlive;
  const verifyIdentity = opts.verifyPidIdentity ?? verifyLockHolderIdentity;
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, 'utf8').trim();
  } catch {
    return false; // no lock (or unreadable) — no run in flight
  }
  const holder = parseLockPid(raw);
  if (holder === undefined || !isAlive(holder)) return false;
  // OMN-263: same PID-reuse discrimination as acquireIntegrationLock — a
  // confirmed identity mismatch means the real holder is gone even though
  // its old PID number happens to be alive again; unverifiable preserves the
  // pre-OMN-263 "alive == live" behavior.
  return verifyIdentity(holder) !== false;
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
 * Worker-side orphan guard. Vitest's globalSetup (where startOrphanWatchdog
 * runs) executes ONLY in the vitest main process — forked pool workers, which
 * run the test files AND their destructive afterAll teardowns, outlive a dead
 * main (kill-test 2026-06-09: main died in ~1s, the fork survived at ppid 1).
 *
 * Gating: forked workers have an IPC channel (`process.send`); worker-thread
 * pools do not. NOTE vitest 3's DEFAULT pool is forks, so in this repo the
 * guard arms in unit-test workers too — deliberate and harmless: it only acts
 * on a ppid TRANSITION to 1 (see startOrphanWatchdog), and reaping an orphaned
 * unit worker is also correct. The gate's job is merely to no-op where the
 * orphan signal doesn't exist (threads share their host process).
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

/**
 * Abort the process when its parent dies. On macOS/Linux an orphaned process
 * is reparented to PID 1 — but the trigger is the TRANSITION to ppid 1, not
 * the value itself: a process legitimately BORN under PID 1 (e.g. node as a
 * container's init launching the suite) must never be treated as orphaned.
 * When the initial ppid is already 1, the watchdog never arms.
 * The interval is unref'd: the watchdog never keeps the process alive.
 *
 * Returns a stop() handle for clean teardown.
 */
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
      // Logging must never block the abort: the parent is dead, so stderr's
      // pipe consumer may be gone (EPIPE) — swallow and proceed.
      try {
        console.error(
          '[Integration Guard] Parent process died (reparented to PID 1) — ' +
            'aborting orphaned integration run before it executes more destructive teardowns (OMN-143).',
        );
      } catch {
        /* dead pipe — abort anyway */
      }
      // Round-2 kill-test finding: a plain process.exit did NOT kill a vitest
      // fork worker (vitest patches process.exit inside workers to catch tests
      // calling it). Try the graceful exit first, then fall through to
      // self-SIGKILL — which nothing can intercept.
      try {
        process.exit(130);
      } catch {
        /* patched/intercepted exit — escalate */
      }
      process.kill(process.pid, 'SIGKILL');
    });
  const intervalMs = opts.intervalMs ?? 2000;

  // Transition baseline: born-at-ppid-1 is NOT an orphan (container init /
  // launchd-launched invocations) — never arm in that case.
  if (getPpid() === 1) {
    return (): void => undefined;
  }

  const interval = setInterval(() => {
    if (getPpid() === 1) {
      clearInterval(interval);
      onOrphan();
    }
  }, intervalMs);
  interval.unref();

  return (): void => clearInterval(interval);
}
