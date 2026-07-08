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
import { fullCleanup, scanForFixtures } from '../integration/helpers/sandbox-manager.js';
import {
  acquireIntegrationLock,
  DEFAULT_LOCK_PATH,
  releaseIntegrationLock,
  startOrphanWatchdog,
} from './integration-guard.js';

// OMN-143: watchdog stop handle, cleared in teardown().
let stopOrphanWatchdog: (() => void) | undefined;

/**
 * Global setup - runs BEFORE all tests
 * Cleans up any orphaned test data from crashed previous runs
 *
 * Note: sandbox-manager.ts enables SANDBOX_GUARD_ENABLED when imported,
 * which happens in the test process (not this global setup process).
 */
export async function setup() {
  // OMN-143: refuse concurrent suite runs BEFORE the startup cleanup sweep —
  // the sweep below is itself destructive, and a second run's sweep firing
  // while another run (or a live verify session) holds OmniFocus state is
  // exactly the 2026-06-09 incident class. Throwing here aborts the run with
  // nothing touched.
  const lock = acquireIntegrationLock();
  if (!lock.acquired) {
    throw new Error(
      `[Integration Guard] Another integration run (PID ${lock.holderPid}) holds ${DEFAULT_LOCK_PATH} — ` +
        'refusing to run concurrently (OMN-143). Wait for it; a dead holder self-clears on the next ' +
        'attempt. (If the PID was recycled by an unrelated process, remove the lock file manually.)',
    );
  }
  if (lock.stale) {
    const deadHolder = lock.holderPid ? ` (dead PID ${lock.holderPid})` : '';
    console.warn(`[Integration Guard] Reclaimed a stale lock${deadHolder} — a previous run did not shut down cleanly.`);
  }

  // OMN-143: if the process that launched this suite dies (killed shell,
  // capped tool timeout), abort within seconds instead of running minutes of
  // destructive teardowns as an orphan.
  stopOrphanWatchdog = startOrphanWatchdog();

  console.log('[Integration Setup] Running startup cleanup sweep...');

  try {
    // OMN-186 Phase 2: explicit full — the lock acquired above would make an
    // 'auto' sweep resolve scoped, but this IS the prior-epoch orphan hunt.
    const report = await fullCleanup({ scope: 'full' });

    const totalCleaned = report.inboxTasksDeleted + report.projectsDeleted + report.foldersDeleted + report.tagsDeleted;

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
    // OMN-186 Phase 2: THE one full end-of-run sweep — per-file sweeps ran
    // scoped (no everywhere-scans, sandbox folder kept), so this catches
    // escapees and deletes the folder; scanForFixtures below still fails
    // loud on anything left.
    const report = await fullCleanup({ scope: 'full' });

    const totalCleaned = report.inboxTasksDeleted + report.projectsDeleted + report.foldersDeleted + report.tagsDeleted;

    if (totalCleaned > 0) {
      console.log(`[Integration Teardown] Cleaned up ${totalCleaned} test items.`);
    }

    if (report.errors.length > 0) {
      console.warn('[Integration Teardown] Cleanup warnings:', report.errors);
    }
  } catch (error) {
    console.warn('[Integration Teardown] Final cleanup failed:', error);
  }

  // OMN-46: post-cleanup fail-loud — scan for any leaked fixtures that
  // survived cleanup. The previous swallow-everything teardown was how
  // `__test-update-ops-*` tags accumulated in production for months. If
  // anything remains, log it loudly AND set a non-zero process exit code so
  // CI surfaces the regression. Don't abort the suite mid-flight (other
  // teardown work still to run); set `process.exitCode` so vitest finishes
  // its own teardown then exits non-zero.
  try {
    const scan = await scanForFixtures();
    if (scan.total > 0) {
      console.error('');
      console.error(`[Integration Teardown] FIXTURE LEAK: ${scan.total} item(s) survived cleanup.`);
      const categories: Array<[string, Array<{ name: string; location?: string; id: string }>]> = [
        ['Inbox tasks', scan.inboxTasks],
        ['Orphan tasks', scan.orphanTasks],
        ['Sandbox projects', scan.sandboxProjects],
        ['Orphan projects', scan.orphanProjects],
        ['Sandbox folders', scan.sandboxFolders],
        ['Test tags', scan.testTags],
      ];
      for (const [label, items] of categories) {
        if (items.length === 0) continue;
        console.error(`  ${label}: ${items.length}`);
        for (const item of items) {
          const loc = item.location ? ` [${item.location}]` : '';
          console.error(`    - ${item.name}${loc}  (id: ${item.id})`);
        }
      }
      console.error('');
      console.error(
        '  Run `npm run test:cleanup -- --apply` to purge, then investigate why the in-test teardown left these behind.',
      );
      console.error('');
      process.exitCode = 1;
    }
    if (scan.errors.length > 0) {
      console.warn('[Integration Teardown] Post-cleanup scan warnings:', scan.errors);
    }
  } catch (error) {
    console.warn('[Integration Teardown] Post-cleanup scan failed:', error);
  }

  // Shutdown shared client
  await shutdownSharedClient();

  // OMN-143: release the single-instance guard LAST, after all teardown work.
  stopOrphanWatchdog?.();
  releaseIntegrationLock();
}
