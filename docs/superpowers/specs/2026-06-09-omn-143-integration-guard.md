# OMN-143 — Integration-suite single-instance lock + orphan watchdog

**Date:** 2026-06-09 · **Ticket:** OMN-143 · **Approved:** Kip ("Go ahead and do the OMN-143 PR now"), design as
presented in-session and in the ticket.

## Problem

2026-06-09 forensics: killed shells do not kill vitest's process tree; orphaned + concurrently relaunched integration
runs executed destructive teardowns (`fullCleanup`, sandbox-folder deletion) into a live verify session for an hour
after their launching agent stopped. The globalSetup's own startup `fullCleanup` sweep is equally destructive and
currently runs unconditionally.

## Design

New file `tests/support/integration-guard.ts` — two dependency-injected, unit-testable helpers:

1. **`acquireIntegrationLock({lockPath?, pid?, isPidAlive?}) → {acquired, holderPid?, stale?}`** Lock file
   `~/.omnifocus-mcp/integration.lock` containing the holder PID. Acquire with `wx` (atomic create); on EEXIST read the
   holder: live PID (`process.kill(pid, 0)`, EPERM counts as alive) → `{acquired: false, holderPid}`; dead/garbage →
   stale, reclaim by overwrite. `releaseIntegrationLock` deletes ONLY when the file still contains the caller's PID
   (never release someone else's lock).
2. **`startOrphanWatchdog({getPpid?, onOrphan?, intervalMs?=2000}) → stop()`** Unref'd interval; when `getPpid() === 1`
   (reparented to launchd ⇒ parent died), clear the interval and invoke `onOrphan` (default: loud `console.error` naming
   OMN-143, `process.exit(130)`).

Wiring in `tests/support/setup-integration.ts`:

- `setup()`: acquire the lock **before anything else — especially before the startup `fullCleanup` sweep**. Not acquired
  → `throw` with an actionable message naming the holder PID (vitest aborts the run; nothing destructive has happened).
  Then start the watchdog (module-level stop handle).
- `teardown()`: existing teardown work, then stop the watchdog and release the lock **last**.

Behavior notes: the lock also serializes `test:smoke`/`test:ci` paths that share this globalSetup — desirable, they
touch the same OmniFocus DB.

**Kill-test amendments (found during live verification):**

1. The main-process watchdog alone is INSUFFICIENT — round 2 showed vitest main dying ~1s after its parent was killed
   while the forked pool worker (which runs the test files and their destructive `afterAll` teardowns) survived at
   ppid 1. Fix: `startWorkerOrphanGuard`, loaded via vitest `setupFiles` (`tests/support/setup-worker-guard.ts`, runs in
   EVERY worker), gated on IPC-channel presence (`typeof process.send === 'function'`). NOTE: vitest 3's default pool is
   forks, so the guard also arms in unit workers — deliberate and harmless (transition-gated, below); worker-thread
   pools (no orphan signal) no-op.
2. A plain `process.exit(130)` did NOT kill a vitest fork worker (vitest patches `process.exit` inside workers). The
   default `onOrphan` escalates: EPIPE-safe log → `process.exit(130)` → unconditional self-`SIGKILL` fallthrough, which
   nothing can intercept. Round-4 verdict: main AND worker dead ~1s after the parent kill.
3. The orphan trigger is the ppid TRANSITION to 1, not the value: a process born under PID 1 (container init /
   launchd-launched) never arms — eliminating the false-positive class for that environment outright.
4. Live run-B evidence: stale lock from the kill-test reclaimed with the dead PID named; full suite green (106 passed /
   0 failed); lock released after teardown.

## Out of scope

`fullCleanup` run-scoping (the ticket's optional item 3) — the lock makes concurrent cross-run sweeps impossible, which
was the damage vector; further scoping would trade away the OMN-46 leak-catching purpose.

## Testing

- Unit (`tests/unit/support/integration-guard.test.ts`, runs in `test:unit`): fresh acquire (file contains PID);
  contended-live (injected `isPidAlive: true` → refused with holderPid); stale reclaim (dead PID + garbage content);
  owner-only release (other-PID release leaves file; owner release removes); watchdog via injected `getPpid` + fake
  timers (fires once, interval cleared, no fire while ppid ≠ 1).
- Manual kill-test performed live in the PR session and documented in the PR body: launch the suite, kill the parent
  shell, confirm the run aborts within the watchdog interval and the lock is reclaimable (stale) afterward.
- Gates: build, test:unit, lint. A full `test:integration` run to prove the lock acquire/release round-trip in situ.
