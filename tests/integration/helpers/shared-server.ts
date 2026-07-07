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

import { MCPTestClient } from './mcp-test-client.js';
import { TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from './sandbox-manager.js';
import { profileFixture } from './fixture-profiler.js';

let sharedClient: MCPTestClient | null = null;
let initPromise: Promise<MCPTestClient> | null = null;
let isFirstAccess = true;

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
  // OMN-186: first access pays server start + cache warm + OmniFocus warm;
  // later per-file accesses pay a cache clear. Split ops so a profiled run
  // (FIXTURE_PROFILE=1) can tell the one-time warm from the per-file cost.
  const op = sharedClient || initPromise ? 'getSharedClient.reuse' : 'getSharedClient.init';
  return profileFixture('beforeAll', op, getSharedClientImpl);
}

async function getSharedClientImpl(): Promise<MCPTestClient> {
  if (sharedClient) {
    // Clear cache between test file accesses to prevent pollution
    if (!isFirstAccess) {
      await sharedClient.clearCache();
    }
    isFirstAccess = false;
    return sharedClient;
  }

  // Prevent race conditions if multiple tests start simultaneously
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    console.log('🚀 Starting shared MCP server for integration tests (with cache warming)...');
    sharedClient = new MCPTestClient({ enableCacheWarming: true });
    await sharedClient.startServer();
    console.log('🔥 Warming up OmniFocus (read + mutation paths)...');
    await warmupOmniFocus(sharedClient);
    console.log('✅ Shared MCP server ready (cache warmed, OmniFocus warmed)');
    isFirstAccess = false; // First access complete
    return sharedClient;
  })();

  return initPromise;
}

/**
 * Shutdown the shared server (called by teardown script)
 */
export async function shutdownSharedClient(): Promise<void> {
  // OMN-186: end-of-run cost — profiled when FIXTURE_PROFILE=1
  return profileFixture('globalTeardown', 'shutdownSharedClient', async () => {
    if (sharedClient) {
      console.log('🧹 Shutting down shared MCP server...');
      await sharedClient.thoroughCleanup();
      await sharedClient.stop();
      sharedClient = null;
      initPromise = null;
      isFirstAccess = true; // Reset for next test run
      console.log('✅ Shared MCP server shutdown complete');
    }
  });
}

/**
 * Export for tests that want synchronous access (after initialization)
 */
export function getSharedClientSync(): MCPTestClient {
  if (!sharedClient) {
    throw new Error('Shared MCP client not initialized. Call getSharedClient() first.');
  }
  return sharedClient;
}
