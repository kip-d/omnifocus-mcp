#!/usr/bin/env npx ts-node
/**
 * TEST CLEANUP SCRIPT
 *
 * Manually clean up test sandbox data from OmniFocus.
 * Useful for recovering from crashed tests or clearing orphaned test data.
 *
 * Usage:
 *   npm run test:cleanup
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { fullCleanup, type CleanupReport } from '../tests/integration/helpers/sandbox-manager.js';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('OmniFocus MCP Test Cleanup');
  console.log('='.repeat(60));
  console.log('');
  console.log('This will clean up all test data from OmniFocus:');
  console.log('  - Tasks with __TEST__ name prefix (inbox tasks)');
  console.log('  - Projects inside __MCP_TEST_SANDBOX__ folder');
  console.log('  - The __MCP_TEST_SANDBOX__ folder itself');
  console.log('  - Orphaned __TEST__ tasks anywhere (e.g., in Miscellaneous)');
  console.log('  - Tags starting with __test-');
  console.log('');
  console.log('Starting cleanup...');
  console.log('');

  try {
    const report: CleanupReport = await fullCleanup();

    console.log('Cleanup Complete!');
    console.log('-'.repeat(40));
    console.log(`  Inbox tasks deleted:    ${report.inboxTasksDeleted}`);
    console.log(`  Orphaned tasks deleted: ${report.orphanedTasksDeleted}`);
    console.log(`  Projects deleted:       ${report.projectsDeleted}`);
    console.log(`  Folders deleted:        ${report.foldersDeleted}`);
    console.log(`  Tags deleted:           ${report.tagsDeleted}`);
    console.log(`  Duration:               ${report.durationMs}ms`);

    if (report.errors.length > 0) {
      console.log('');
      console.log('Warnings/Errors:');
      for (const error of report.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log('');
    console.log('='.repeat(60));

    // Exit with error code if there were errors
    if (report.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('');
    console.error('Cleanup failed with error:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('Make sure OmniFocus is running and accessible.');
    process.exit(1);
  }
}

main();
