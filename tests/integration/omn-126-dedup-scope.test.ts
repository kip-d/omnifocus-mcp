/**
 * OMN-126: parse_meeting_notes dedup, scoped to the target project, must detect a
 * real existing task — exercised against REAL OmniFocus.
 *
 * OMN-126 scopes the dedup candidate read to the requested project(s) + inbox via
 * `filter.project = <canonical name>` (instead of an ~8s whole-DB scan). That
 * scoped read is exactly the path that OMN-224 fixed: before OMN-224 it threw
 * (`document.projectsMatching is not a function`), the failure was swallowed, and
 * dedup silently found nothing — every item came back `duplicateOf: null`. The
 * unit tests on this path mock `execJson`, so they validate the scoping LOGIC but
 * never run the scoped read; this test runs it end-to-end through the server.
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
import { runScopedName, RUN_NAME_PREFIX } from './helpers/run-id.js';

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

/**
 * OMN-126 review ④: the case-canonicalization — the headline of this PR — is
 * actually exercised end-to-end. A lowercase `item.project` must resolve to the
 * canonical existing project (case-insensitive) so its scoped read finds the
 * project's tasks. The unit tests mock `execJson` so `existingProjects` is empty
 * and canonicalization is never exercised; this runs it against real OmniFocus.
 */
d('OMN-126: a case-mismatched project name still dedups (canonicalization)', () => {
  let client: MCPTestClient;

  // Same full name in two cases: identical `__TEST__-<runid>-` prefix, suffix
  // differs only in case → case-insensitively equal, so canonicalProjectScope must
  // resolve the lowercase query to the canonical mixed-case project.
  const SUFFIX = 'OMN126CanonHW';
  const PROJECT_NAME = runScopedName(SUFFIX); // ...-OMN126CanonHW
  const LOWER_QUERY = `${RUN_NAME_PREFIX}${SUFFIX.toLowerCase()}`; // ...-omn126canonhw
  const DUP_TASK_NAME = runScopedName('OMN126CanonDup');

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
          { operation: 'create', target: 'task', data: { tempId: 'dup', name: DUP_TASK_NAME, parentTempId: 'proj' } },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;
    expect(response.success).toBe(true);
    expect(response.data?.tempIdMapping?.['dup']).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it('resolves a lowercase project name to the canonical project and flags the dup', async () => {
    const result = (await client.callTool('omnifocus_analyze', {
      analysis: {
        type: 'parse_meeting_notes',
        params: { items: [{ name: DUP_TASK_NAME, project: LOWER_QUERY }] },
      },
    })) as ParseResponse;

    expect(result.success).toBe(true);
    expect(result.data?.warnings ?? []).not.toContain('dedupe unavailable: incomplete-tasks read failed');
    const item = (result.data?.items ?? []).find((i) => i.name === DUP_TASK_NAME);
    // Case-mismatched scope must still resolve → dup found.
    expect(item?.duplicateOf).toBeTruthy();
    expect(item?.readyToCreate).toBe(false);
  }, 60000);
});

/**
 * OMN-126 review ①: an empty-string `project` must be treated as the inbox
 * (`null`), not a project literally named '' — otherwise the scoped read filters
 * on `name === ''` (zero matches) and silently misses a real inbox duplicate.
 */
d('OMN-126: an empty-string project dedups against the inbox', () => {
  let client: MCPTestClient;
  const INBOX_DUP_NAME = runScopedName('OMN126EmptyProjInbox');

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();
    // A real inbox task (no project) — createTestTask tracks it for cleanup.
    const created = await client.createTestTask(INBOX_DUP_NAME);
    expect(created?.success ?? created?.data?.task?.taskId).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it("treats project:'' as inbox and flags the inbox duplicate", async () => {
    const result = (await client.callTool('omnifocus_analyze', {
      analysis: {
        type: 'parse_meeting_notes',
        params: { items: [{ name: INBOX_DUP_NAME, project: '' }] },
      },
    })) as ParseResponse;

    expect(result.success).toBe(true);
    const item = (result.data?.items ?? []).find((i) => i.name === INBOX_DUP_NAME);
    // Pre-fix: project:'' scoped the read to a project named '' → 0 tasks → missed.
    expect(item?.duplicateOf).toBeTruthy();
    expect(item?.readyToCreate).toBe(false);
  }, 60000);
});
