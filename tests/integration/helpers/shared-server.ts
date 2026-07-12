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
import { TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from './sandbox-manager.js';
import { profileFixture } from './fixture-profiler.js';
import { getGlobalSlot } from './global-singleton.js';
import { pidIsAlive } from '../../support/integration-guard.js';

// OMN-261: mirrors the OMN-143 lock's PID-in-a-file pattern (integration-guard.ts's
// DEFAULT_LOCK_PATH/pidIsAlive) — see Task 3b's rationale for why no in-process
// exit hook can be relied on to shut this down.
const SHARED_SERVER_PID_PATH = path.join(os.homedir(), '.omnifocus-mcp', 'shared-server.pid');

export function recordSharedServerPid(pid: number | undefined, pidFilePath: string = SHARED_SERVER_PID_PATH): void {
  if (pid === undefined) return;
  try {
    mkdirSync(path.dirname(pidFilePath), { recursive: true });
    writeFileSync(pidFilePath, String(pid), 'utf-8');
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

/**
 * OMN-261: call from a DIFFERENT process than the one that spawned the
 * server (e.g. globalTeardown) — see Task 3b for why no hook registered
 * inside the vitest worker fork process can be relied on here.
 */
export function killOrphanedSharedServer(
  opts: {
    pidFilePath?: string;
    isPidAlive?: (pid: number) => boolean;
    kill?: (pid: number, signal: string) => void;
  } = {},
): void {
  const pidFilePath = opts.pidFilePath ?? SHARED_SERVER_PID_PATH;
  const isAlive = opts.isPidAlive ?? pidIsAlive;
  const kill = opts.kill ?? ((pid, signal) => process.kill(pid, signal));

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

  const pid = Number.parseInt(raw, 10);
  if (!Number.isFinite(pid) || pid <= 0) return;
  if (!isAlive(pid)) return;
  try {
    kill(pid, 'SIGTERM');
  } catch {
    /* gone between the liveness check and the kill; harmless */
  }
}

interface SharedServerState {
  client: MCPTestClient | null;
  initPromise: Promise<MCPTestClient> | null;
  isFirstAccess: boolean;
}

// OMN-261: module-scope `let` bindings reset on every test file under
// vitest's default per-file isolation, even inside the single OS process
// `singleFork:true` guarantees — defeating the "one server per run" design
// this file's docstring already describes. globalThis survives the reset.
function getState(): SharedServerState {
  return getGlobalSlot<SharedServerState>('shared-server-state', () => ({
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
      state.client = client;
      await client.startServer();
      recordSharedServerPid(client.pid);
      console.log('🔥 Warming up OmniFocus (read + mutation paths)...');
      await warmupOmniFocus(client);
      console.log('✅ Shared MCP server ready (cache warmed, OmniFocus warmed)');
      state.isFirstAccess = false; // First access complete
      return client;
    } catch (error) {
      // OMN-261 review: state is now genuinely shared across the whole run
      // (that's this file's entire point), so a cold-OmniFocus/init failure
      // must not permanently poison every subsequent file's getSharedClient()
      // call — reset so the NEXT call gets a fresh attempt instead of
      // inheriting this broken client/rejected promise forever. The PID file
      // (if recordSharedServerPid already ran) still lets
      // killOrphanedSharedServer reap the partially-started process.
      state.client = null;
      state.initPromise = null;
      throw error;
    }
  })();

  return state.initPromise;
}

/**
 * Gracefully shut down the shared server: drains via thoroughCleanup() (an
 * ID-based bulk delete of everything this client created) then stops the
 * process.
 *
 * OMN-261 review: this function currently has NO automatic caller. It used
 * to be wired to a `process.once('beforeExit', ...)` hook, but that hook was
 * removed after investigation confirmed it realistically never fires under
 * a real `vitest --run` (Vitest's forks-pool teardown is an external
 * SIGTERM/SIGKILL from tinypool with no in-worker signal handler registered
 * outside Node's profiling flags — see git history for the investigation).
 * The actual load-bearing cleanup path is killOrphanedSharedServer() below,
 * called from globalTeardown — but that runs in a SEPARATE OS process from
 * the one holding `state.client`, so it can only send a blunt SIGTERM, not
 * invoke this function's graceful ID-based cleanup. Whether/how to wire
 * graceful cleanup back in (e.g. from the last test file's own afterAll) is
 * tracked in OMN-263 — kept here as a tested, reusable unit rather than
 * deleted outright, since fullCleanup()'s prefix-based scan is a coarser
 * safety net, not a replacement for ID-based cleanup.
 */
export async function shutdownSharedClient(): Promise<void> {
  // OMN-186: profiled when FIXTURE_PROFILE=1, for whenever this is invoked.
  return profileFixture('globalTeardown', 'shutdownSharedClient', async () => {
    const state = getState();
    if (state.client) {
      console.log('🧹 Shutting down shared MCP server...');
      await state.client.thoroughCleanup();
      await state.client.stop();
      state.client = null;
      state.initPromise = null;
      state.isFirstAccess = true; // Reset for next test run
      console.log('✅ Shared MCP server shutdown complete');
    }
  });
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
