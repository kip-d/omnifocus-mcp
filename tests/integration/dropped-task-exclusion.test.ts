/**
 * OMN-157 regression: bare/search task queries exclude dropped tasks by default.
 *
 * The bug: only MODE_DEFINITIONS modes excluded dropped (e703ec7); the script-level
 * default on the bare path checked completed only, so dropped tasks leaked into
 * mode:search/all and bare filter queries. The first fix attempt emitted
 * `if (task.dropped) return;` — a silent no-op, because task.dropped is not an
 * OmniJS property (it is synthetic, AST-emitter-only). This test pins the contract
 * BEHAVIORALLY, at the live seam, so a string-level no-op can never pass again.
 *
 * Contract under test (product ruling on OMN-157):
 * - bare filter query: dropped task absent, active task present
 * - mode:"search": same
 * - explicit dropped:true: dropped task present (override honored)
 * - countOnly: count equals the visible row count (parity, spec case C15)
 *
 * Uses the test sandbox for isolation (tasks live in a sandbox-folder project —
 * NOT the inbox — so cleanup stays folder-scoped).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName, RUN_ID } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

interface TaskRow {
  id: string;
  name: string;
}
interface TasksReadResponse {
  success: boolean;
  data?: { tasks?: TaskRow[] };
  metadata?: { total_count?: number };
}
interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}

d('OMN-157: dropped tasks excluded from bare/search queries by default', () => {
  let client: MCPTestClient;

  // Run-unique marker: never appears in any real task, so result sets are
  // exactly the probe records.
  const MARKER = `XYZDROPSCOPE${RUN_ID.replace(/[^a-z0-9]/gi, '')}`;

  let activeTaskId: string;
  let droppedTaskId: string;

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
            data: {
              tempId: 'holder',
              name: runScopedName('DropScope_Holder'),
              folder: SANDBOX_FOLDER_NAME,
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'activeTask',
              name: runScopedName(`DropScope_Active_${MARKER}`),
              parentTempId: 'holder',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'droppedTask',
              name: runScopedName(`DropScope_Dropped_${MARKER}`),
              parentTempId: 'holder',
            },
          },
        ],
        returnMapping: true,
      },
    })) as BatchResponse;

    expect(response.success).toBe(true);
    const mapping = response.data.tempIdMapping ?? {};
    activeTaskId = mapping['activeTask'];
    droppedTaskId = mapping['droppedTask'];
    expect(activeTaskId).toBeTruthy();
    expect(droppedTaskId).toBeTruthy();

    // Drop the second task (status transition, not deletion)
    const dropResponse = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'update',
        target: 'task',
        id: droppedTaskId,
        changes: { status: 'dropped' },
      },
    })) as { success: boolean };
    expect(dropResponse.success).toBe(true);
  }, 120000);

  // Cleanup is the suite-level teardown sweep (folder-scoped); no afterAll here.

  async function queryTasks(extra: Record<string, unknown>): Promise<TasksReadResponse> {
    return (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { text: { contains: MARKER } },
        fields: ['id', 'name'],
        limit: 10,
        ...extra,
      },
    })) as TasksReadResponse;
  }

  it('bare filter query returns the active task and NOT the dropped task', async () => {
    const response = await queryTasks({});

    expect(response.success).toBe(true);
    const ids = (response.data?.tasks ?? []).map((t) => t.id);
    expect(ids).toContain(activeTaskId);
    expect(ids).not.toContain(droppedTaskId);
  });

  it('mode:"search" returns the active task and NOT the dropped task', async () => {
    const response = await queryTasks({ mode: 'search' });

    expect(response.success).toBe(true);
    const ids = (response.data?.tasks ?? []).map((t) => t.id);
    expect(ids).toContain(activeTaskId);
    expect(ids).not.toContain(droppedTaskId);
  });

  it("explicit status:'dropped' returns the dropped task (override honored)", async () => {
    // Wire vocabulary: the strict schema rejects a bare `dropped` filter key;
    // status:'dropped' is the public path (compiles onto TaskFilter.dropped)
    const response = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { text: { contains: MARKER }, status: 'dropped' },
        fields: ['id', 'name'],
        limit: 10,
      },
    })) as TasksReadResponse;

    expect(response.success).toBe(true);
    const ids = (response.data?.tasks ?? []).map((t) => t.id);
    expect(ids).toContain(droppedTaskId);
    expect(ids).not.toContain(activeTaskId);
  });

  it('countOnly agrees with the visible row count (C15 parity)', async () => {
    const rows = await queryTasks({});
    const count = await queryTasks({ countOnly: true });

    expect(rows.success).toBe(true);
    expect(count.success).toBe(true);
    expect(count.metadata?.total_count).toBe((rows.data?.tasks ?? []).length);
  });
});
