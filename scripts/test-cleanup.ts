#!/usr/bin/env npx ts-node
/**
 * TEST CLEANUP SCRIPT
 *
 * Inspect (default) or clean up test sandbox data from OmniFocus.
 *
 * OMN-46: dry-run is now the default. Pass --apply to actually delete.
 * The previous "always delete" behavior caused at least one user-data
 * incident (loose .includes() substring matching purged real tasks).
 * Dry-run-by-default lets you eyeball the inventory before committing.
 *
 * Usage:
 *   npm run test:cleanup              # dry-run: list what would be deleted
 *   npm run test:cleanup -- --apply   # actually delete
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import {
  fullCleanup,
  scanForFixtures,
  type CleanupReport,
  type FixtureScanReport,
  type FixtureScanItem,
} from '../tests/integration/helpers/sandbox-manager.js';

function printScanReport(report: FixtureScanReport): void {
  const categories: Array<[string, FixtureScanItem[]]> = [
    ['Inbox tasks (__TEST__ prefix)', report.inboxTasks],
    ['Orphan tasks (escaped sandbox)', report.orphanTasks],
    ['Sandbox projects', report.sandboxProjects],
    ['Orphan projects (escaped sandbox)', report.orphanProjects],
    ['Sandbox folders', report.sandboxFolders],
    ['Test tags (__test- prefix)', report.testTags],
  ];

  for (const [label, items] of categories) {
    if (items.length === 0) continue;
    console.log('');
    console.log(`${label}: ${items.length}`);
    for (const item of items) {
      const loc = item.location ? ` [${item.location}]` : '';
      console.log(`  - ${item.name}${loc}  (id: ${item.id})`);
    }
  }
}

async function runDryRun(): Promise<never> {
  console.log('');
  console.log('Scanning for leaked test fixtures (read-only)...');
  console.log('Use --apply to actually delete what this scan finds.');
  console.log('');

  try {
    const report: FixtureScanReport = await scanForFixtures();

    if (report.total === 0) {
      console.log('No leaked test fixtures found. Database is clean.');
    } else {
      console.log(`Found ${report.total} leaked item(s):`);
      printScanReport(report);
      console.log('');
      console.log(`Scan time: ${report.durationMs}ms`);
      console.log('');
      console.log('To delete these items, re-run with:  npm run test:cleanup -- --apply');
    }

    if (report.errors.length > 0) {
      console.log('');
      console.log('Scan warnings:');
      for (const error of report.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log('');
    console.log('='.repeat(60));
    // Dry-run exits non-zero if leaks found — makes the scan usable as a CI/teardown gate.
    process.exit(report.total > 0 ? 1 : 0);
  } catch (error) {
    console.error('');
    console.error('Scan failed with error:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('Make sure OmniFocus is running and accessible.');
    process.exit(2);
  }
}

async function runApply(): Promise<never> {
  console.log('');
  console.log('Cleaning up:');
  console.log('  - Tasks with __TEST__ name prefix (inbox tasks)');
  console.log('  - Projects inside __MCP_TEST_SANDBOX__ folder');
  console.log('  - The __MCP_TEST_SANDBOX__ folder itself');
  console.log('  - Orphaned test tasks/projects (prefix-matched)');
  console.log('  - Tags starting with __test-');
  console.log('');

  try {
    // OMN-186 Phase 2: explicit full — a manual purge must never scope down,
    // even if an integration run's lock happens to be live.
    const report: CleanupReport = await fullCleanup({ scope: 'full' });

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
    process.exit(report.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('');
    console.error('Cleanup failed with error:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('Make sure OmniFocus is running and accessible.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

  console.log('='.repeat(60));
  console.log(`OmniFocus MCP Test Cleanup — ${apply ? 'APPLY (will delete)' : 'DRY RUN (no changes)'}`);
  console.log('='.repeat(60));

  if (apply) {
    await runApply();
  } else {
    await runDryRun();
  }
}

main();
