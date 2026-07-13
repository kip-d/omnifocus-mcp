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
// for unit-only runs).
//
// OMN-263 review (pass 3): this substring is deliberately BROAD, and the
// direction is chosen, not accidental. The lock is machine-global (one
// OmniFocus per machine), so a legitimate holder can be an integration run
// from ANY checkout/worktree of this repo — a checkout-specific match (the
// SERVER_PATH approach shared-server.ts uses for the process it spawned
// itself) would wrongly reject a live holder from a sibling worktree and
// STEAL its lock: the dangerous direction (the 2026-06-09 incident class
// this whole file exists to prevent). Over-matching errs the SAFE
// direction: a stale lock whose PID the OS reused for some unrelated
// vitest process (e.g. a unit run in another worktree) is falsely treated
// as held, and the new run is refused with an error message that already
// names the manual remedy.
//
// OMN-265: this substring is now the FALLBACK, not the primary check. The
// lock records its writer's process start time (`<pid>\n<lstart>`), and a
// readable live start time decides identity EXACTLY (PID + start time is
// unique per boot — no false refusals, no false steals), so the substring is
// consulted only for a legacy bare-PID lock file or when `ps` can't read the
// live process's start time.
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
 * OMN-265: second line of the lock file — the holder's recorded process start
 * time, if present. Undefined for a legacy bare-PID lock (written by code
 * predating the format) so callers degrade to the OMN-263 substring chain.
 * Same shape as shared-server.ts's parseRecordedCommand, whose PID file
 * records a spawn path instead (a path can't discriminate here: any
 * worktree's vitest is a legitimate lock holder — see the substring comment
 * above).
 */
function parseRecordedStartTime(raw: string): string | undefined {
  const newline = raw.indexOf('\n');
  if (newline === -1) return undefined;
  const recorded = raw.slice(newline + 1).trim();
  return recorded.length > 0 ? recorded : undefined;
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
    // timeout (OMN-263 review pass 4): this sits on globalSetup/teardown's
    // and per-file afterAll's critical path — a wedged `ps` (overloaded
    // process table during a live session) must degrade to the documented
    // "unverifiable → per-site safe fallback" behavior, not hang the whole
    // run. On timeout, execFileSync kills the child and throws → undefined.
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
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
 * OMN-265: reads a live process's start time via `ps -o lstart=` — constant
 * for the process's whole lifetime and second-granular, so PID + start time
 * identifies a process uniquely per boot (reusing a dead process's PID number
 * within the same second is not a real interleaving). Undefined when the
 * process is gone or `ps` fails, mirroring getProcessCommand above (same
 * timeout rationale: this can sit on setup/teardown's critical path and must
 * degrade to the documented fallback, not hang the run).
 */
export function getProcessStartTime(pid: number): string | undefined {
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * OMN-263 code-review follow-up: the default `verifyPidIdentity` for
 * acquireIntegrationLock/isIntegrationLockLive. Two EXACT shortcuts run
 * before any `ps` shellout, matching the two processes that legitimately
 * observe their own run's lock during a live suite (vitest.config.ts:
 * pool 'forks' + singleFork — one main process, one forked worker):
 *
 * - `holderPid === process.pid` — the vitest MAIN process examining the
 *   lock it wrote itself: globalSetup's acquire runs there, and so does
 *   globalTeardown's `fullCleanup({scope:'full'})` → `isRunLive()` probe.
 *   A process is trivially, unconditionally itself; PID reuse is a question
 *   about a DIFFERENT process inheriting a dead one's number, which cannot
 *   apply to asking whether you are yourself.
 * - `holderPid === process.ppid` — the forked WORKER examining the main
 *   process's lock. Per-test-file `afterAll` `fullCleanup()` calls run in
 *   the worker (a different OS process from the main that holds the lock —
 *   so the self-PID case above does NOT cover them, a topology error a
 *   review pass caught in an earlier version of this comment), and the
 *   worker's direct parent IS that main process (tinypool forks workers
 *   from it). This is exact, not heuristic: ppid always names our CURRENT,
 *   live parent (a dead parent reparents us to PID 1, changing ppid — see
 *   startOrphanWatchdog), so a holder equal to our ppid is the very process
 *   that spawned this worker, i.e. this run's own vitest main. The
 *   `!== 1` guard keeps an orphaned, already-reparented worker from
 *   claiming a lock that names PID 1 as its own parent.
 *
 * Together these keep the suite's hot paths — every per-file teardown plus
 * the global setup/teardown sweeps — free of `ps` shellouts; only genuine
 * cross-process checks (a stale lock from a crashed run, examined by a
 * later unrelated process such as `npm run test:cleanup`) pay for the real
 * command-line comparison.
 *
 * OMN-265: after the fast paths, a recorded start time in the lock file
 * (see acquireIntegrationLock's write) decides identity EXACTLY when the
 * live process's start time is readable: match → this IS the writer
 * (confirmed holder, no substring needed — a live holder from any sibling
 * worktree matches its own record, so no false steals), mismatch → the PID
 * number was reused after the writer died (confirmed stale — even when the
 * squatter is itself some vitest process, the case the substring
 * false-refused). Unreadable start time or a legacy bare-PID lock falls
 * back to the OMN-263 substring chain unchanged.
 *
 * Known corner (OMN-263 review pass 5; still open post-OMN-265, accepted):
 * if a crashed holder's PID is later reused as THIS process's own pid (or
 * its parent's), the fast paths confirm a lock this process never wrote
 * BEFORE the start-time comparison runs, and acquire refuses against a
 * phantom holder. That outcome is IDENTICAL under pre-OMN-263 bare liveness
 * and under the command-substring fallback — an inherent limit of the fast
 * paths, kept because they are what hold the hot per-file teardown path to
 * two integer compares with zero shellouts (reordering the start-time
 * comparison ahead of them would put a `ps` call on every per-file check).
 * It fails in the safe direction (refuse, with the error message naming
 * the manual remedy) and needs two PID-reuse coincidences landing on this
 * very run's own/parent pid.
 *
 * The check parameter is a single OBJECT (same rationale as
 * killOrphanedSharedServer's verifyPidIdentity, pass 5): a positional
 * `(pid, recordedStartTime)` signature would let a 1-arg verifier copied
 * from elsewhere structurally typecheck while silently dropping the
 * start-time comparison. The property is named recordedStartTime — not
 * shared-server's recordedCommand — so cross-module copy-paste of the
 * OTHER sibling's verifier is also a hard type error, not a silent
 * behavior change.
 *
 * Exported, with injectable `commandMatches`/`getStartTime` fallbacks, for
 * the fast-path regression tests: review pass 4 proved the earlier
 * mock-based test file couldn't detect removal of these shortcuts (its
 * child_process mock never intercepted this module's import, and the
 * real-`ps` fallback returned identical outcomes). A test injecting a
 * THROWING fallback and calling this function directly fails loudly the
 * moment a fast path stops short-circuiting — no module-mock interception
 * required.
 */
export function verifyLockHolderIdentity(
  check: { pid: number; recordedStartTime: string | undefined },
  opts: {
    commandMatches?: (pid: number) => boolean | undefined;
    getStartTime?: (pid: number) => string | undefined;
  } = {},
): boolean | undefined {
  const holderPid = check.pid;
  if (holderPid === process.pid) return true;
  if (holderPid === process.ppid && holderPid !== 1) return true;
  if (check.recordedStartTime !== undefined) {
    const getStartTime = opts.getStartTime ?? getProcessStartTime;
    const liveStartTime = getStartTime(holderPid);
    if (liveStartTime !== undefined) return liveStartTime === check.recordedStartTime;
    // Start time unreadable — fall through to the substring chain below.
  }
  const commandMatches =
    opts.commandMatches ?? ((pid: number) => commandMatchesPid(pid, LOCK_HOLDER_COMMAND_SUBSTRING));
  return commandMatches(holderPid);
}

export function acquireIntegrationLock(
  opts: {
    lockPath?: string;
    pid?: number;
    isPidAlive?: (pid: number) => boolean;
    verifyPidIdentity?: (check: { pid: number; recordedStartTime: string | undefined }) => boolean | undefined;
    /** OMN-265: reads the acquiring process's own start time for the lock record. */
    getProcessStartTime?: (pid: number) => string | undefined;
  } = {},
): LockResult {
  const lockPath = opts.lockPath ?? DEFAULT_LOCK_PATH;
  const pid = opts.pid ?? process.pid;
  const isAlive = opts.isPidAlive ?? pidIsAlive;
  const verifyIdentity = opts.verifyPidIdentity ?? verifyLockHolderIdentity;
  const readStartTime = opts.getProcessStartTime ?? getProcessStartTime;

  // OMN-265: record our own start time next to the PID so a LATER process
  // examining this lock can tell "this PID is still the writer" from "the OS
  // reused the writer's PID number" exactly, instead of via the broad
  // command substring. One `ps` shellout per acquire — once per run, off
  // every hot path. Unreadable start time degrades to the legacy bare-PID
  // format (checks then use the substring chain, exactly as pre-OMN-265).
  const ownStartTime = readStartTime(pid);
  const lockContents = ownStartTime !== undefined ? `${pid}\n${ownStartTime}` : String(pid);

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  // Happy path: atomic create-exclusive. Anything but EEXIST is a real error.
  try {
    fs.writeFileSync(lockPath, lockContents, { flag: 'wx' });
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
      fs.writeFileSync(lockPath, lockContents, { flag: 'wx' });
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
    //
    // NOTE: this confirmed-mismatch-vs-unverifiable split appears at three
    // sites (here, isIntegrationLockLive below, and shared-server.ts's
    // killOrphanedSharedServer) whose UNVERIFIABLE fallbacks deliberately
    // point in different directions — refuse here (an unnecessary refusal
    // only costs a delay), but PROCEED with the kill in shared-server.ts
    // (an unnecessary skip risks a wedged orphan driving OmniFocus). Don't
    // unify them into one helper without preserving that per-site choice.
    const identity = verifyIdentity({ pid: holder, recordedStartTime: parseRecordedStartTime(raw) });
    if (identity !== false) {
      return { acquired: false, holderPid: holder };
    }
    console.warn(
      `[Integration Guard] Lock at ${lockPath} names PID ${holder}, which is alive but fails the identity check ` +
        '(OMN-263/OMN-265 PID-reuse detection: recorded start time or command line does not match) — ' +
        'treating the lock as stale rather than trusting bare liveness.',
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
    fs.writeFileSync(lockPath, lockContents, { flag: 'wx' });
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
    verifyPidIdentity?: (check: { pid: number; recordedStartTime: string | undefined }) => boolean | undefined;
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
  // pre-OMN-263 "alive == live" behavior. (Third sibling of this pattern:
  // shared-server.ts's killOrphanedSharedServer — see the NOTE in
  // acquireIntegrationLock above on why the three sites' unverifiable
  // fallbacks deliberately differ and must not be blindly unified.)
  if (verifyIdentity({ pid: holder, recordedStartTime: parseRecordedStartTime(raw) }) === false) {
    // Pass 4: warn like the siblings do — a confirmed mismatch here flips
    // fullCleanup from scoped to full mode, and doing that silently would
    // leave no trace of why cleanup scope changed if anyone ever debugs it.
    console.warn(
      `[Integration Guard] Lock at ${lockPath} names PID ${holder}, which is alive but fails the OMN-263 ` +
        'identity check (PID reused by an unrelated process) — treating the run as NOT live.',
    );
    return false;
  }
  return true;
}

/**
 * Release ONLY if the lock still contains our PID — never delete a lock a
 * later run legitimately reclaimed (e.g. after we were SIGKILLed and restarted).
 *
 * OMN-265: compares the PARSED pid, not raw content — the lock now carries a
 * second start-time line, so an exact string compare against the bare PID
 * would never match and the owner could never release its own lock.
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
    if (parseLockPid(raw) !== pid) return false;
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
