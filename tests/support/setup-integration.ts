/**
 * Global teardown for integration tests
 *
 * Note: We use a module-level singleton for the shared server (see shared-server.ts)
 * because Vitest's globalSetup runs in a separate process.
 *
 * This teardown ensures the server shuts down cleanly after all tests complete.
 */

import { shutdownSharedClient } from '../integration/helpers/shared-server.js';

export async function teardown() {
  await shutdownSharedClient();
}
