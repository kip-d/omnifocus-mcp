/**
 * OMN-126: parse_meeting_notes dedup, scoped to the target project, must detect a
 * real existing task — exercised against REAL OmniFocus.
 *
 * OMN-126 scopes the dedup candidate read to the requested project(s) + inbox via
 * `filter.project = <canonical name>` (instead of an ~8s whole-DB scan). That
 * scoped read is exactly the path that OMN-224 fixed: before OMN-224 it threw
 * (`document.projectsMatching is not a function`), the failure was swallowed, and
 * dedup silently found nothing — every item came back `duplicateOf: null`. The
 * 59 unit tests on this path mock `execJson`, so they validate the scoping LOGIC
 * but never run the scoped read; this test runs it end-to-end through the server.
 *
 * Contract under test:
 *  - an item whose name matches an existing task in the target project is flagged
 *    `duplicateOf` (readyToCreate: false);
 *  - a novel item in the same project is not flagged (readyToCreate: true);
 *  - no `dedupe unavailable` warning (the scoped read succeeded).
 *
 * Uses the test sandbox for isolation (project created inside the sandbox folder).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}
interface ParsePreviewItem {
  name: string;
  duplicateOf: unknown;
  readyToCreate: boolean;
}
interface ParseResponse {
  success: boolean;
  data?: {
    items?: ParsePreviewItem[];
    warnings?: string[];
    summary?: { duplicates?: number; readyToCreate?: number };
  };
}

d('OMN-126: project-scoped dedup detects a real existing task', () => {
  let client: MCPTestClient;

  const PROJECT_NAME = runScopedName('OMN126_DedupScope');
  const DUP_TASK_NAME = runScopedName('OMN126_DupTarget');
  const NEW_TASK_NAME = runScopedName('OMN126_UniqueNew');

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    const response = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: { tempId: 'proj', name: PROJECT_NAME, folder: SANDBOX_FOLDER_NAME },
          },
          {
            operation: 'create',
            target: 'task',
            data: { tempId: 'dup', name: DUP_TASK_NAME, parentTempId: 'proj' },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    expect(response.success).toBe(true);
    expect(response.data).toBeTruthy();
    expect(response.data.tempIdMapping?.['dup']).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it('flags the scoped duplicate and passes the novel item through', async () => {
    const result = (await client.callTool('omnifocus_analyze', {
      analysis: {
        type: 'parse_meeting_notes',
        params: {
          items: [
            { name: DUP_TASK_NAME, project: PROJECT_NAME },
            { name: NEW_TASK_NAME, project: PROJECT_NAME },
          ],
        },
      },
    })) as ParseResponse;

    expect(result.success).toBe(true);
    // The scoped read must have succeeded — no swallowed dedupe failure.
    expect(result.data?.warnings ?? []).not.toContain('dedupe unavailable: incomplete-tasks read failed');

    const items = result.data?.items ?? [];
    const dup = items.find((i) => i.name === DUP_TASK_NAME);
    const fresh = items.find((i) => i.name === NEW_TASK_NAME);

    // Pre-OMN-224 the scoped read threw → existingTasks empty → duplicateOf null.
    expect(dup?.duplicateOf).toBeTruthy();
    expect(dup?.readyToCreate).toBe(false);

    expect(fresh?.duplicateOf).toBeFalsy();
    expect(fresh?.readyToCreate).toBe(true);

    expect(result.data?.summary?.duplicates).toBe(1);
  }, 60000);
});
