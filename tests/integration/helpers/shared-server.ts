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

let sharedClient: MCPTestClient | null = null;
let initPromise: Promise<MCPTestClient> | null = null;
let isFirstAccess = true;

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
    console.log('✅ Shared MCP server ready (cache warmed)');
    isFirstAccess = false; // First access complete
    return sharedClient;
  })();

  return initPromise;
}

/**
 * Shutdown the shared server (called by teardown script)
 */
export async function shutdownSharedClient(): Promise<void> {
  if (sharedClient) {
    console.log('🧹 Shutting down shared MCP server...');
    await sharedClient.thoroughCleanup();
    await sharedClient.stop();
    sharedClient = null;
    initPromise = null;
    isFirstAccess = true; // Reset for next test run
    console.log('✅ Shared MCP server shutdown complete');
  }
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
