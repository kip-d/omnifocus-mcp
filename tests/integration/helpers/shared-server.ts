/**
 * Shared MCP server instance for all integration tests
 *
 * This module maintains a single long-running MCP server instance that mirrors
 * real-world usage (Claude Desktop session). Benefits:
 * - Cache warming happens once and persists (enabled by default for realistic behavior)
 * - Minimal overhead (1 server lifecycle instead of N)
 * - Realistic performance testing
 * - Matches production usage pattern
 *
 * Cache Clearing: The cache is cleared between test file accesses to prevent
 * test pollution. This ensures each test file starts with a fresh cache state.
 */

import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MCPTestClient } from './mcp-test-client.js';
import { SERVER_PATH } from './server-path.js';
import { TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from './sandbox-manager.js';
import { profileFixture } from './fixture-profiler.js';
import { getGlobalSlot } from './global-singleton.js';
import { pidIsAlive, parseLockPid, commandMatchesPid } from '../../support/integration-guard.js';

// OMN-261: mirrors the OMN-143 lock's PID-in-a-file pattern (integration-guard.ts's
// DEFAULT_LOCK_PATH/pidIsAlive) — see Task 3b's rationale for why no in-process
// exit hook can be relied on to shut this down.
const SHARED_SERVER_PID_PATH = path.join(os.homedir(), '.omnifocus-mcp', 'shared-server.pid');

// OMN-263 review (pass 4): the identity check must be neither a bare
// 'dist/index.js' substring (matches a real PRODUCTION server on PID reuse —
// pass-2 finding) nor the reaper's OWN checkout-specific SERVER_PATH (the
// PID file lives at a machine-global path, so a genuine orphan left by a
// crashed run in a SIBLING worktree has a different absolute path and would
// be silently left alive to drive OmniFocus concurrently — pass-4 finding;
// the same machine-global-vs-checkout-specific reasoning integration-guard.ts
// documents for the OMN-143 lock). The resolution: the WRITER records the
// exact path it spawned (recordSharedServerPid below writes
// `<pid>\n<serverPath>`), and the reaper verifies the live process against
// the RECORD — worktree A's orphan matches worktree A's recorded path no
// matter which worktree reaps it, while a production server can never match
// because it never writes this file; only PID reuse could point the record
// at it, and PID reuse is exactly what a recorded-path mismatch detects.
// Legacy fallback for a bare-PID file written by code predating this format:
const LEGACY_SHARED_SERVER_COMMAND_SUBSTRING = 'dist/index.js';

/** Second line of the PID file: the recorded spawn path, if present. */
function parseRecordedCommand(raw: string): string | undefined {
  const newline = raw.indexOf('\n');
  if (newline === -1) return undefined;
  const recorded = raw.slice(newline + 1).trim();
  return recorded.length > 0 ? recorded : undefined;
}

export function recordSharedServerPid(
  pid: number | undefined,
  pidFilePath: string = SHARED_SERVER_PID_PATH,
  // OMN-263 pass 4: record WHAT was spawned alongside the pid, so a later
  // run — possibly in a different worktree — verifies the orphan's identity
  // against this record instead of its own (different) checkout path.
  commandPath: string = SERVER_PATH,
): void {
  if (pid === undefined) return;
  try {
    mkdirSync(path.dirname(pidFilePath), { recursive: true });
    writeFileSync(pidFilePath, `${pid}\n${commandPath}`, 'utf-8');
  } catch (error) {
    // OMN-261 review: silent failure here defeats the only shutdown path
    // that's actually load-bearing (killOrphanedSharedServer, called from
    // globalTeardown — see below). Losing this doesn't break suite
    // correctness, but it must be visible, not silent.
    console.warn(
      `[shared-server] Failed to record shared-server PID ${pid} at ${pidFilePath} — deterministic shutdown cleanup will not run for this process:`,
      error,
    );
  }
}

// OMN-261 review: src/index.ts's SIGTERM handler can legitimately take up to
// its own SIGNAL_EXIT_TIMEOUT_MS (5s) draining pending operations, plus
// FORCE_CLOSE_GRACE_MS (1s) attempting a bounded server.close(), before it
// is guaranteed to have called process.exit() — a 6s worst case. REAP_TIMEOUT_MS
// gives real margin over that for signal delivery / OS scheduling latency,
// not just enough to match it.
const REAP_TIMEOUT_MS = 8000;
const REAP_POLL_INTERVAL_MS = 100;
// OMN-261 review: if SIGTERM doesn't land within REAP_TIMEOUT_MS (e.g. the
// server is wedged on a hung osascript/OmniFocus dialog — src/index.ts's own
// handler names this), escalate to an unignorable SIGKILL and give it this
// much longer to be reaped before giving up. The transport.close() path this
// PID-file mechanism replaced had exactly this SIGTERM→SIGKILL escalation
// bound; dropping to SIGTERM-only would let a wedged prior-run orphan keep
// driving OmniFocus during setup()'s fullCleanup sweep.
const SIGKILL_REAP_TIMEOUT_MS = 2000;

/**
 * OMN-261: call from a DIFFERENT process than the one that spawned the
 * server (e.g. globalTeardown) — see Task 3b for why no hook registered
 * inside the vitest worker fork process can be relied on here.
 *
 * OMN-264: this SIGTERM is the ONLY shutdown path — there is deliberately no
 * in-process graceful drain (an earlier `shutdownSharedClient()`, ID-based
 * bulk-delete via `thoroughCleanup()`, was removed). It's provably redundant:
 * `thoroughCleanup()` only bulk-deletes the client's own tracked
 * task/project IDs (it explicitly skips tag cleanup for performance), while
 * `setup-integration.ts`'s `teardown()` unconditionally runs
 * `fullCleanup({scope:'full'})` + `scanForFixtures()` before this function is
 * even called — a whole-DB, prefix/location-based sweep (`__TEST__` tasks,
 * sandbox-folder projects, `__test-` tags, orphan escapees) that requires no
 * knowledge of which IDs the shared client created, so it catches everything
 * ID-based cleanup would have and more (orphans, tags). Since the shared
 * client only ever needs draining once per run anyway, wiring the ID-based
 * path back in would only add a second, strictly weaker sweep at the same
 * point in the run — not a safety improvement.
 *
 * OMN-263: before signaling the PID this reads from the file, verifies the
 * live process's command line against the spawn path RECORDED IN THE FILE
 * (see recordSharedServerPid / the pass-4 comment above it) — plain
 * `isPidAlive` can't tell "still our orphan" apart from "OS reassigned this
 * PID number to something unrelated after our orphan already exited," and
 * neither a bare substring (matches a production server) nor the reaper's
 * own checkout path (misses a sibling worktree's orphan) answers it; only
 * the writer's own record does. Unlinking the file BEFORE the identity
 * check stays correct under the recorded-path scheme: a CONFIRMED mismatch
 * means the recorded orphan's PID was reused, i.e. the orphan itself is
 * already dead — the record is garbage either way. See
 * integration-guard.ts's `commandMatchesPid` for the shared identity-check
 * primitive (also used by the OMN-143 lock).
 *
 * By default, polls after sending SIGTERM so callers can rely on the orphan
 * actually being gone (or log a warning that it wasn't) before touching
 * OmniFocus themselves — a fire-and-forget kill left a window where both the
 * dying orphan and the caller's own cleanup sweep could drive OmniFocus at
 * once. This matters for setup()'s startup sweep, which runs fullCleanup()
 * right after.
 *
 * When waiting, this escalates SIGTERM → SIGKILL if the process outlives
 * REAP_TIMEOUT_MS, matching the SIGTERM+SIGKILL bound the transport.close()
 * path had before this PID-file mechanism replaced it.
 *
 * Pass `waitForExit: false` when nothing OmniFocus-related follows the call
 * (e.g. teardown()'s final, nothing-left-to-protect kill) — polling there
 * doesn't just cost time, it produces a FALSE ALARM: `pidIsAlive`
 * (`kill(pid, 0)`) can't distinguish "still executing" from "already called
 * process.exit(), now a zombie awaiting reap by its real parent" (the vitest
 * worker fork that spawned it — a different process from the one calling
 * killOrphanedSharedServer here, which can never observe that reap). A real
 * run hit exactly this: the warning fired on a normal, non-hung shutdown,
 * at a point where nothing was actually at risk. The tradeoff is that this
 * path sends only SIGTERM with no SIGKILL escalation; a process wedged AT
 * teardown is left for the OS to reap when the run's process tree exits,
 * which is acceptable because (unlike setup) nothing here runs OmniFocus
 * cleanup afterward that a lingering orphan could corrupt.
 */
export async function killOrphanedSharedServer(
  opts: {
    pidFilePath?: string;
    isPidAlive?: (pid: number) => boolean;
    /**
     * OMN-263 pass 4: receives the spawn path recorded in the PID file
     * (undefined for a legacy bare-PID file), so injected verifiers can
     * assert the record actually flows through to the identity check.
     */
    verifyPidIdentity?: (pid: number, recordedCommand: string | undefined) => boolean | undefined;
    kill?: (pid: number, signal: string) => void;
    reapTimeoutMs?: number;
    reapPollIntervalMs?: number;
    sigkillReapTimeoutMs?: number;
    waitForExit?: boolean;
  } = {},
): Promise<void> {
  const pidFilePath = opts.pidFilePath ?? SHARED_SERVER_PID_PATH;
  const isAlive = opts.isPidAlive ?? pidIsAlive;
  const verifyIdentity =
    opts.verifyPidIdentity ??
    ((pid: number, recordedCommand: string | undefined) =>
      // The record is authoritative when present; a bare-PID file written by
      // code predating the recorded-path format falls back to the legacy
      // substring (broad enough to reap any worktree's orphan — the
      // production-collision window it reopens exists only for that one
      // transitional file and closes the first time this run records anew).
      commandMatchesPid(pid, recordedCommand ?? LEGACY_SHARED_SERVER_COMMAND_SUBSTRING));
  const kill = opts.kill ?? ((pid, signal) => process.kill(pid, signal));
  const reapTimeoutMs = opts.reapTimeoutMs ?? REAP_TIMEOUT_MS;
  const reapPollIntervalMs = opts.reapPollIntervalMs ?? REAP_POLL_INTERVAL_MS;
  const sigkillReapTimeoutMs = opts.sigkillReapTimeoutMs ?? SIGKILL_REAP_TIMEOUT_MS;
  const waitForExit = opts.waitForExit ?? true;

  let raw: string;
  try {
    raw = readFileSync(pidFilePath, 'utf-8').trim();
  } catch {
    return; // no PID file — nothing to do
  }
  try {
    unlinkSync(pidFilePath);
  } catch {
    /* already gone — fine, we still act on what we read */
  }

  const pid = parseLockPid(raw);
  if (pid === undefined) return;
  if (!isAlive(pid)) return;

  // OMN-263: confirm this PID is plausibly the server the PID file's writer
  // spawned before signaling it — the OS can reassign a dead process's PID
  // number to something unrelated (worst case, a long-running production
  // `dist/index.js` server). The expected command comes from the FILE's own
  // record, not this checkout's SERVER_PATH, so a sibling worktree's orphan
  // still matches (pass-4 finding — see the recordSharedServerPid comment).
  // Unverifiable (ps failed) falls through to the pre-OMN-263 behavior
  // (proceed with the kill) rather than newly refusing to clean up a real
  // orphan; only a CONFIRMED mismatch skips the kill. (Sibling of the same
  // pattern in integration-guard.ts's acquireIntegrationLock and
  // isIntegrationLockLive, whose unverifiable fallback points the OPPOSITE
  // way — refuse — see the NOTE there before unifying anything.)
  if (verifyIdentity(pid, parseRecordedCommand(raw)) === false) {
    console.warn(
      `[shared-server] PID ${pid} from ${pidFilePath} is alive but its command line doesn't look like our ` +
        'spawned server (OMN-263 PID-reuse check) — skipping SIGTERM to avoid signaling an unrelated process.',
    );
    return;
  }

  try {
    kill(pid, 'SIGTERM');
  } catch {
    /* gone between the liveness check and the kill; harmless */
    return;
  }

  if (!waitForExit) return;

  const deadline = Date.now() + reapTimeoutMs;
  while (isAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, reapPollIntervalMs));
  }
  if (!isAlive(pid)) return;

  // SIGTERM didn't land within the budget — escalate to SIGKILL, which the
  // process cannot ignore, then give it a shorter window to actually die.
  try {
    kill(pid, 'SIGKILL');
  } catch {
    /* died between the check and the escalation; fine */
    return;
  }
  const killDeadline = Date.now() + sigkillReapTimeoutMs;
  while (isAlive(pid) && Date.now() < killDeadline) {
    await new Promise((resolve) => setTimeout(resolve, reapPollIntervalMs));
  }
  if (isAlive(pid)) {
    console.warn(
      `[shared-server] Orphaned server PID ${pid} survived SIGTERM+SIGKILL within ` +
        `${reapTimeoutMs + sigkillReapTimeoutMs}ms — proceeding with cleanup anyway; ` +
        'it may still be driving OmniFocus concurrently.',
    );
  }
}

interface SharedServerState {
  client: MCPTestClient | null;
  initPromise: Promise<MCPTestClient> | null;
  isFirstAccess: boolean;
}

// Exported so tests that clear this slot in beforeEach import the real key
// rather than re-typing the literal — the same drift-safety the RUN_ID_SLOT_KEY
// export gives run-id.ts (OMN-261 review).
export const SHARED_SERVER_STATE_SLOT = 'shared-server-state';

// OMN-261: module-scope `let` bindings reset on every test file under
// vitest's default per-file isolation, even inside the single OS process
// `singleFork:true` guarantees — defeating the "one server per run" design
// this file's docstring already describes. globalThis survives the reset.
function getState(): SharedServerState {
  return getGlobalSlot<SharedServerState>(SHARED_SERVER_STATE_SLOT, () => ({
    client: null,
    initPromise: null,
    isFirstAccess: true,
  }));
}

/**
 * Warm up OmniFocus + the JXA script execution path inside the spawned MCP server.
 *
 * Background: On the first integration-suite run of the day (or after OmniFocus has
 * been idle, mid-sync, or freshly relaunched), the first ~5 update operations
 * return `success: false` envelopes. Subsequent runs in the same session are clean.
 * See Linear OMN-55 for the diagnostic data.
 *
 * Strategy: exercise both the read path AND the create/update/delete mutation path
 * before any test runs, so the failing surface is warm by the time tests issue their
 * own updates. Read-only warm-up is not enough — every failing assertion in the
 * cold-run logs was on `updateResult.success`, not a read.
 *
 * Phase 1: retry a tiny inbox read until success or 15s timeout.
 * Phase 2: create → update → delete a sandbox task; retry the update under the same
 *          15s budget, since that's the operation that actually fails cold.
 */
async function warmupOmniFocus(client: MCPTestClient): Promise<void> {
  const TIMEOUT_MS = 15000;
  const INTERVAL_MS = 500;

  // Phase 1: read path
  const readStart = Date.now();
  let readAttempts = 0;
  let lastReadFailure = '(no attempts)';
  let readOk = false;
  while (Date.now() - readStart < TIMEOUT_MS) {
    readAttempts++;
    try {
      const result = await client.callTool('omnifocus_read', {
        query: { type: 'tasks', mode: 'inbox', limit: 1 },
      });
      if (result?.success) {
        readOk = true;
        break;
      }
      lastReadFailure = `success=false, error=${result?.error ?? '(none)'}`;
    } catch (err) {
      lastReadFailure = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  if (!readOk) {
    throw new Error(
      `OmniFocus warm-up (read) failed after ${readAttempts} attempts in ${TIMEOUT_MS}ms. ` +
        `Last failure: ${lastReadFailure}. ` +
        'Is OmniFocus running and reachable? Check for blocking dialogs.',
    );
  }

  // Phase 2: mutation path — this is the surface that fails on cold OmniFocus
  const warmupName = `${TEST_INBOX_PREFIX} warmup ${Date.now()}`;
  const warmupTag = `${TEST_TAG_PREFIX}warmup`;

  let taskId: string | undefined;
  try {
    const createResult = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: { name: warmupName, tags: [warmupTag] },
      },
    });
    taskId = createResult?.data?.task?.taskId;
    if (!createResult?.success || !taskId) {
      throw new Error(`OmniFocus warm-up (create) failed: ${createResult?.error ?? JSON.stringify(createResult)}`);
    }

    // Retry the update under a fresh budget — this is the exact operation
    // that returns success: false on a cold run.
    const updateStart = Date.now();
    let updateAttempts = 0;
    let lastUpdateFailure = '(no attempts)';
    let updateOk = false;
    while (Date.now() - updateStart < TIMEOUT_MS) {
      updateAttempts++;
      try {
        const updateResult = await client.callTool('omnifocus_write', {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { note: 'warmup' },
          },
        });
        if (updateResult?.success) {
          updateOk = true;
          break;
        }
        lastUpdateFailure = `success=false, error=${updateResult?.error ?? '(none)'}`;
      } catch (err) {
        lastUpdateFailure = err instanceof Error ? err.message : String(err);
      }
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
    if (!updateOk) {
      throw new Error(
        `OmniFocus warm-up (update) failed after ${updateAttempts} attempts in ${TIMEOUT_MS}ms. ` +
          `Last failure: ${lastUpdateFailure}. ` +
          'This is the exact failure mode OMN-55 is meant to prevent; tests would fail confusingly.',
      );
    }
  } finally {
    // Best-effort cleanup of the warm-up task. Even if it fails, the sandbox
    // sweep in setup/teardown will pick it up by the __TEST__ prefix.
    if (taskId) {
      try {
        await client.callTool('omnifocus_write', {
          mutation: { operation: 'delete', target: 'task', id: taskId },
        });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Get or create the shared MCP client instance
 * Thread-safe lazy initialization
 *
 * Cache warming is ENABLED by default for the shared server to match real-world
 * Claude Desktop behavior. This significantly speeds up read operations (~10x faster)
 * by pre-caching projects, tags, and common task queries.
 *
 * NOTE: Cache is cleared on each call after the first to prevent test pollution
 * between test files.
 */
export async function getSharedClient(): Promise<MCPTestClient> {
  // OMN-186/OMN-261: first access pays server start + cache warm + OmniFocus
  // warm; later accesses (now genuinely cross-file, via the global slot) pay
  // a cache clear. Split ops so a profiled run (FIXTURE_PROFILE=1) can tell
  // the one-time warm from the per-file cost.
  const state = getState();
  const op = state.client || state.initPromise ? 'getSharedClient.reuse' : 'getSharedClient.init';
  return profileFixture('beforeAll', op, getSharedClientImpl);
}

async function getSharedClientImpl(): Promise<MCPTestClient> {
  const state = getState();

  if (state.client) {
    // Clear cache between test file accesses to prevent pollution
    if (!state.isFirstAccess) {
      await state.client.clearCache();
    }
    state.isFirstAccess = false;
    return state.client;
  }

  // Prevent race conditions if multiple tests start simultaneously
  if (state.initPromise) {
    return state.initPromise;
  }

  state.initPromise = (async () => {
    console.log('🚀 Starting shared MCP server for integration tests (with cache warming)...');
    const client = new MCPTestClient({ enableCacheWarming: true });
    try {
      await client.startServer();
      recordSharedServerPid(client.pid);
      console.log('🔥 Warming up OmniFocus (read + mutation paths)...');
      await warmupOmniFocus(client);
      console.log('✅ Shared MCP server ready (cache warmed, OmniFocus warmed)');
      // OMN-261 review: publish state.client ONLY once the client is fully
      // ready — startServer() AND warmupOmniFocus() both done. The read-path
      // fast check at the top (`if (state.client)`) does not await
      // state.initPromise, so any earlier publish let a concurrent caller in
      // the startServer-done-but-warmup-pending window take that fast path and
      // receive a client that (a) wasn't warmed yet, and (b) this init's own
      // catch block below would then stop() on a warmup failure — handing the
      // concurrent caller a killed-child client instead of the clean
      // "not initialized, retry via initPromise" behavior. Keeping state.client
      // null for the whole init keeps every concurrent caller on initPromise.
      state.client = client;
      state.isFirstAccess = false; // First access complete
      return client;
    } catch (error) {
      // OMN-261 review: state is now genuinely shared across the whole run
      // (that's this file's entire point), so a cold-OmniFocus/init failure
      // must not permanently poison every subsequent file's getSharedClient()
      // call — reset so the NEXT call gets a fresh attempt instead of
      // inheriting this broken client/rejected promise forever.
      //
      // If startServer() already succeeded (warmupOmniFocus is what threw),
      // stop the live child now rather than leaning on the PID file: the
      // NEXT getSharedClient() call overwrites recordSharedServerPid's PID
      // file with the new client's PID before killOrphanedSharedServer ever
      // runs, permanently losing the only reference to this orphan.
      const orphanPid = client.pid;
      if (orphanPid !== undefined) {
        try {
          await client.stop();
        } catch (stopError) {
          // OMN-261 review: graceful stop() (transport.close) failed, so the
          // child may still be alive — and since the PID file is about to be
          // overwritten by the next retry, this is the last reference to it.
          // Escalate to an unignorable SIGKILL rather than leak an untracked
          // stray that can still drive OmniFocus.
          console.warn(
            `[shared-server] Graceful stop failed after init failure; escalating to SIGKILL for PID ${orphanPid}:`,
            stopError,
          );
          try {
            process.kill(orphanPid, 'SIGKILL');
          } catch {
            /* already dead between stop() failing and here — fine */
          }
        }
      }
      state.client = null;
      state.initPromise = null;
      throw error;
    }
  })();

  return state.initPromise;
}

/**
 * Export for tests that want synchronous access (after initialization)
 */
export function getSharedClientSync(): MCPTestClient {
  const state = getState();
  if (!state.client) {
    throw new Error('Shared MCP client not initialized. Call getSharedClient() first.');
  }
  return state.client;
}
