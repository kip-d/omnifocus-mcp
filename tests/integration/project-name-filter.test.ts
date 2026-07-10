/**
 * OMN-224 regression: tasks `project`-by-name filter must return the project's
 * tasks against REAL OmniFocus.
 *
 * The bug: `emitProjectComparison` (src/contracts/ast/emitters/omnijs.ts) built
 * its name-resolution preamble with `document.projectsMatching(target)` — but in
 * OmniJS `projectsMatching` is a bare global (a Database method exposed on the
 * global scope), NOT a method on `document` (which is undefined there). So EVERY
 * name-scoped tasks read threw `TypeError: document.projectsMatching is not a
 * function`, surfacing as a SCRIPT_ERROR / `success: false`, returning zero tasks.
 *
 * Why it stayed hidden: the unit tests assert on the *emitted script text*
 * (`expect(preamble).toContain('document.projectsMatching')` literally codified
 * the bug), and the parse integration test mocks `executeJson`. Nothing fed the
 * emitted script to real OmniFocus. This test does — it exercises the real query
 * path end-to-end through the MCP server.
 *
 * Contract under test:
 *  - `read { type: 'tasks', filters: { project: <exact existing name> } }`
 *    succeeds (does not throw) and returns the project's tasks.
 *  - That name-scoped result equals the trusted `projectId`-scoped result
 *    (the A-vs-B oracle from the ticket: name path == id path).
 *
 * Uses the test sandbox for isolation (project created inside the sandbox folder,
 * so cleanup stays folder-scoped).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

interface TaskRow {
  id: string;
  name: string;
}
interface TasksReadResponse {
  success: boolean;
  data?: { tasks?: TaskRow[] };
}
interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}

d('OMN-224: tasks project-by-name filter resolves real projects', () => {
  let client: MCPTestClient;

  // Run-unique project name → byName resolves it unambiguously and the task set
  // is exactly our probe tasks. Deterministic per suffix, so the SAME string is
  // used to create the project and as the filter value.
  const PROJECT_NAME = runScopedName('OMN224_NameFilter');

  let projectId: string;
  let task1Id: string;
  let task2Id: string;

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
              tempId: 'proj',
              name: PROJECT_NAME,
              folder: SANDBOX_FOLDER_NAME,
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task1',
              name: runScopedName('OMN224_Task_A'),
              parentTempId: 'proj',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task2',
              name: runScopedName('OMN224_Task_B'),
              parentTempId: 'proj',
            },
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
    const mapping = response.data.tempIdMapping ?? {};
    projectId = mapping['proj'];
    task1Id = mapping['task1'];
    task2Id = mapping['task2'];
    expect(projectId).toBeTruthy();
    expect(task1Id).toBeTruthy();
    expect(task2Id).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it('returns the project tasks when filtered by exact project NAME (not just ID)', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { project: PROJECT_NAME, completed: false },
        fields: ['id', 'name'],
        limit: 50,
      },
    })) as TasksReadResponse;

    // Pre-fix this threw (success:false, SCRIPT_ERROR) — the regression assertion.
    expect(result.success).toBe(true);
    const ids = (result.data?.tasks ?? []).map((t) => t.id);
    expect(ids).toContain(task1Id);
    expect(ids).toContain(task2Id);
  }, 60000);

  it('name-scoped result equals the trusted projectId-scoped result (A-vs-B oracle)', async () => {
    const byName = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { project: PROJECT_NAME, completed: false },
        fields: ['id', 'name'],
        limit: 50,
      },
    })) as TasksReadResponse;

    const byId = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { projectId, completed: false },
        fields: ['id', 'name'],
        limit: 50,
      },
    })) as TasksReadResponse;

    expect(byName.success).toBe(true);
    expect(byId.success).toBe(true);

    const nameIds = (byName.data?.tasks ?? []).map((t) => t.id).sort((a, b) => a.localeCompare(b));
    const idIds = (byId.data?.tasks ?? []).map((t) => t.id).sort((a, b) => a.localeCompare(b));
    expect(nameIds).toEqual(idIds);
  }, 60000);
});

/**
 * OMN-224 (review follow-up): a DROPPED project must not shadow an active project
 * of the same name.
 *
 * `flattenedProjects` / `byName` are status-blind and ordered by creation, so a
 * dropped same-named project created *before* the active one resolves first —
 * the predicate then targets the dead project and the active project's tasks go
 * silently invisible (success:true, 0 tasks). The emitter now resolves among
 * "live" (non-dropped, non-completed) projects, falling back to dead matches only
 * if no live project carries the name.
 */
d('OMN-224: a dropped same-named project does not shadow the active one', () => {
  let client: MCPTestClient;

  const DUP_NAME = runScopedName('OMN224_DroppedShadow');
  let activeTaskId: string;

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    // DROPPED project created FIRST (so it precedes the active one in
    // flattenedProjects order — the worst case for status-blind byName), then the
    // ACTIVE project holding the probe task.
    const response = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: { tempId: 'dropped', name: DUP_NAME, folder: SANDBOX_FOLDER_NAME, status: 'dropped' },
          },
          {
            operation: 'create',
            target: 'project',
            data: { tempId: 'active', name: DUP_NAME, folder: SANDBOX_FOLDER_NAME, status: 'active' },
          },
          {
            operation: 'create',
            target: 'task',
            data: { tempId: 'activeTask', name: runScopedName('OMN224_ActiveDupTask'), parentTempId: 'active' },
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
    const mapping = response.data.tempIdMapping ?? {};
    activeTaskId = mapping['activeTask'];
    expect(activeTaskId).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it('resolves the active project, not the dropped one created first', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { project: DUP_NAME, completed: false },
        fields: ['id', 'name'],
        limit: 50,
      },
    })) as TasksReadResponse;

    expect(result.success).toBe(true);
    const ids = (result.data?.tasks ?? []).map((t) => t.id);
    // Pre-fix: byName resolved the dropped project (created first) → 0 tasks.
    expect(ids).toContain(activeTaskId);
  }, 60000);
});
