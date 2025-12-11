/**
 * Global setup and teardown for integration tests
 *
 * Note: We use a module-level singleton for the shared server (see shared-server.ts)
 * because Vitest's globalSetup runs in a separate process.
 *
 * Setup:
 *   - Runs cleanup sweep to clear orphans from crashed previous runs
 *
 * Teardown:
 *   - Ensures the server shuts down cleanly after all tests complete
 *   - Runs final cleanup sweep
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { shutdownSharedClient } from '../integration/helpers/shared-server.js';
import { fullCleanup } from '../integration/helpers/sandbox-manager.js';

/**
 * Global setup - runs BEFORE all tests
 * Cleans up any orphaned test data from crashed previous runs
 *
 * Note: sandbox-manager.ts enables SANDBOX_GUARD_ENABLED when imported,
 * which happens in the test process (not this global setup process).
 */
export async function setup() {
  console.log('[Integration Setup] Running startup cleanup sweep...');

  try {
    const report = await fullCleanup();

    const totalCleaned =
      report.inboxTasksDeleted +
      report.projectsDeleted +
      report.foldersDeleted +
      report.tagsDeleted;

    if (totalCleaned > 0) {
      console.log(`[Integration Setup] Cleaned up ${totalCleaned} orphaned items:`);
      if (report.inboxTasksDeleted > 0) {
        console.log(`  - ${report.inboxTasksDeleted} inbox tasks`);
      }
      if (report.projectsDeleted > 0) {
        console.log(`  - ${report.projectsDeleted} projects`);
      }
      if (report.foldersDeleted > 0) {
        console.log(`  - ${report.foldersDeleted} folders`);
      }
      if (report.tagsDeleted > 0) {
        console.log(`  - ${report.tagsDeleted} tags`);
      }
    } else {
      console.log('[Integration Setup] No orphaned test data found.');
    }

    if (report.errors.length > 0) {
      console.warn('[Integration Setup] Cleanup warnings:', report.errors);
    }
  } catch (error) {
    // Don't fail tests if cleanup fails - just warn
    console.warn('[Integration Setup] Startup cleanup failed:', error);
    console.warn('[Integration Setup] Tests will continue, but manual cleanup may be needed.');
  }
}

/**
 * Global teardown - runs AFTER all tests
 */
export async function teardown() {
  console.log('[Integration Teardown] Running final cleanup sweep...');

  try {
    const report = await fullCleanup();

    const totalCleaned =
      report.inboxTasksDeleted +
      report.projectsDeleted +
      report.foldersDeleted +
      report.tagsDeleted;

    if (totalCleaned > 0) {
      console.log(`[Integration Teardown] Cleaned up ${totalCleaned} test items.`);
    }

    if (report.errors.length > 0) {
      console.warn('[Integration Teardown] Cleanup warnings:', report.errors);
    }
  } catch (error) {
    console.warn('[Integration Teardown] Final cleanup failed:', error);
  }

  // Shutdown shared client
  await shutdownSharedClient();
}
