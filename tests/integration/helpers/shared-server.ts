/**
 * Shared MCP server instance for all integration tests
 *
 * This module maintains a single long-running MCP server instance that mirrors
 * real-world usage (Claude Desktop session). Benefits:
 * - Cache warming happens once and persists
 * - Minimal overhead (1 server lifecycle instead of N)
 * - Realistic performance testing
 * - Matches production usage pattern
 */

import { MCPTestClient } from './mcp-test-client.js';

let sharedClient: MCPTestClient | null = null;
let initPromise: Promise<MCPTestClient> | null = null;

/**
 * Get or create the shared MCP client instance
 * Thread-safe lazy initialization
 */
export async function getSharedClient(): Promise<MCPTestClient> {
  if (sharedClient) {
    return sharedClient;
  }

  // Prevent race conditions if multiple tests start simultaneously
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    console.log('🚀 Starting shared MCP server for integration tests...');
    sharedClient = new MCPTestClient();
    await sharedClient.startServer();
    console.log('✅ Shared MCP server ready');
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
