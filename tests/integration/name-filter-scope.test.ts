/**
 * OMN-142 regression: `filters.name` must be name-scoped.
 *
 * The bug: `name: { contains }` compiled to the legacy `search` field, which
 * matches name OR note — so a task whose NOTE cited a term matched a "name"
 * search for it. A deletion sweep keyed on `name contains 'OMN-138'` then
 * collaterally deleted a real user task that merely cited OMN-138 in its note.
 *
 * Contract under test (tasks AND projects):
 * - name.contains hits a name-only marker, and does NOT hit a note-only marker
 * - text.contains hits both (full-text semantics unchanged)
 *
 * Uses the test sandbox for isolation (tasks created inside a sandbox-folder
 * project — NOT the inbox — so cleanup stays folder-scoped).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
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
}
interface ProjectsReadResponse {
  success: boolean;
  data?: { projects?: TaskRow[] };
}
interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}

d('OMN-142: name filter is name-scoped (never matches notes)', () => {
  let client: MCPTestClient;

  // Run-unique markers: never appear in any real name/note, so result sets
  // are exactly the probe records.
  const TASK_MARKER = `XYZNAMESCOPE${RUN_ID.replace(/[^a-z0-9]/gi, '')}`;
  const PROJECT_MARKER = `XYZPROJSCOPE${RUN_ID.replace(/[^a-z0-9]/gi, '')}`;
  // OMN-149: marker containing "/" — the old matches emitter raw-interpolated
  // the pattern into a regex literal, so any "/" broke the generated script.
  const SLASH_MARKER = `XYZSLASH${RUN_ID.replace(/[^a-z0-9]/gi, '')}/probe`;

  let nameTaskId: string;
  let noteTaskId: string;
  let slashTaskId: string;
  let nameProjectId: string;
  let noteProjectId: string;

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    // One sandbox project holding both probe tasks, plus the two probe
    // projects themselves (name-marker vs note-marker).
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
              name: runScopedName('NameScope_Holder'),
              folder: SANDBOX_FOLDER_NAME,
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'nameTask',
              name: runScopedName(`NameScope_InName_${TASK_MARKER}`),
              note: 'bland note with no marker',
              parentTempId: 'holder',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'noteTask',
              name: runScopedName('NameScope_InNoteOnly'),
              note: `note citing the marker (${TASK_MARKER}) — must NOT match a name search`,
              parentTempId: 'holder',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'slashTask',
              name: runScopedName(`NameScope_${SLASH_MARKER}`),
              note: 'bland note',
              parentTempId: 'holder',
            },
          },
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'nameProject',
              name: runScopedName(`NameScope_ProjInName_${PROJECT_MARKER}`),
              note: 'bland project note',
              folder: SANDBOX_FOLDER_NAME,
            },
          },
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'noteProject',
              name: runScopedName('NameScope_ProjInNoteOnly'),
              note: `project note citing the marker (${PROJECT_MARKER})`,
              folder: SANDBOX_FOLDER_NAME,
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
    const mapping = response.data.tempIdMapping ?? {};
    nameTaskId = mapping['nameTask'];
    noteTaskId = mapping['noteTask'];
    slashTaskId = mapping['slashTask'];
    nameProjectId = mapping['nameProject'];
    noteProjectId = mapping['noteProject'];
    expect(nameTaskId).toBeTruthy();
    expect(noteTaskId).toBeTruthy();
    expect(slashTaskId).toBeTruthy();
    expect(nameProjectId).toBeTruthy();
    expect(noteProjectId).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await fullCleanup({ scope: 'full' });
    await client.thoroughCleanup();
  });

  it('tasks: name.contains matches the name-marker task and NOT the note-marker task', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { name: { contains: TASK_MARKER } }, limit: 50 },
    })) as TasksReadResponse;

    expect(result.success).toBe(true);
    const ids = (result.data?.tasks ?? []).map((t) => t.id);
    expect(ids).toContain(nameTaskId);
    expect(ids).not.toContain(noteTaskId);
  }, 60000);

  it('tasks: text.contains matches BOTH (full-text semantics unchanged)', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { text: { contains: TASK_MARKER } }, limit: 50 },
    })) as TasksReadResponse;

    expect(result.success).toBe(true);
    const ids = (result.data?.tasks ?? []).map((t) => t.id);
    expect(ids).toContain(nameTaskId);
    expect(ids).toContain(noteTaskId);
  }, 60000);

  // OMN-149: a "/" in the pattern used to produce a syntax-broken script
  // (regex-literal interpolation). Must now match as a real regex.
  it('tasks: name.matches with a "/" in the pattern works (OMN-149)', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { name: { matches: SLASH_MARKER } }, limit: 50 },
    })) as TasksReadResponse;

    expect(result.success).toBe(true);
    const ids = (result.data?.tasks ?? []).map((t) => t.id);
    expect(ids).toContain(slashTaskId);
    expect(ids).not.toContain(noteTaskId);
  }, 60000);

  it('projects: name.contains matches the name-marker project and NOT the note-marker project', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: { type: 'projects', filters: { name: { contains: PROJECT_MARKER } }, limit: 50 },
    })) as ProjectsReadResponse;

    expect(result.success).toBe(true);
    const ids = (result.data?.projects ?? []).map((p) => p.id);
    expect(ids).toContain(nameProjectId);
    expect(ids).not.toContain(noteProjectId);
  }, 60000);

  it('projects: text.contains matches BOTH (OMN-142 also un-dropped filters.text on projects)', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: { type: 'projects', filters: { text: { contains: PROJECT_MARKER } }, limit: 50 },
    })) as ProjectsReadResponse;

    expect(result.success).toBe(true);
    const ids = (result.data?.projects ?? []).map((p) => p.id);
    expect(ids).toContain(nameProjectId);
    expect(ids).toContain(noteProjectId);
  }, 60000);
});
