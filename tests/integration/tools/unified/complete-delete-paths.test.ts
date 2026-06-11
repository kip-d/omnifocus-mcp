/**
 * OMN-138 (OMN-128 slice 5) — live complete/delete/bulk_delete coverage for the
 * OmniJS-native mutation AST: task complete (with completionDate), project
 * complete, task delete, project delete, bulk task delete (mixed real+bogus ids),
 * and guard-refused not-found single ops. All paths use the new AST lowerings
 * (buildCompleteScript / buildDeleteScript / buildBulkDeleteTasksScript) wired
 * in slice 5.
 *
 * CARDINAL RULE (the slice-3 vacuous-parentage lesson): every assertion reads
 * back the PERSISTED value via a follow-up omnifocus_read call — never the
 * write response's own echo. Single deliberate exceptions: the delete read-backs
 * are NOT_FOUND assertions (the object no longer exists), and the guard-refused
 * probes assert the refusal envelope shape.
 *
 * Coverage matrix:
 *   1. complete task with completionDate → read back completed:true + date-part
 *   2. complete project → read back status "done" (project id lookup)
 *   3. delete task → read back NOT_FOUND
 *   4. delete project → read back NOT_FOUND
 *   5. bulk_delete mixed real+bogus ids → whole-dispatch guard refusal (see below)
 *   6. not-found single ops (complete + delete bogus id) → TEST GUARD refusal
 *
 * GUARD INTERACTION on rows 5–6 (OMN-46 + OMN-120 fix):
 *
 * Single ops (complete, delete): the sandbox guard's pre-flight
 * (validateTaskInSandbox → isTaskInSandbox → Task.byIdentifier) runs BEFORE the
 * mutation script. An unknown id resolves to nothing → "outside sandbox" → guard
 * REFUSES (success:false). Script-level "Task not found:" is unreachable on a
 * guarded server. Same pattern as update-paths row 6.
 *
 * Bulk delete (row 5): the bulk_delete/task guard runs Promise.all over ALL ids
 * (spec §2.1, MUTATION_DEFS 'bulk_delete/task') before any delete executes. One
 * bogus id causes the guard to throw → caught by handleBulkDeleteTasks' outer
 * catch → error ends up in data.errors[]. Response shape: success:true with
 * successCount:0 and errorCount:1. This differs from single-op guard refusals
 * (which return success:false) because the bulk handler collects all errors into
 * data.errors regardless of source — documented current behavior; envelope
 * follow-up tracked in OMN-144. Both real fixtures survive. The per-item
 * continue-on-error behavior (AST emitter) is reachable only in production mode;
 * unit tests cover that path.
 *
 * Read-back idioms:
 *   - Completed task: filters { id, completed: true } — without 'completed:true'
 *     the script default is 'if (task.completed) return' which skips the task.
 *   - Completed project: filters { id } with project id lookup (Project.byIdentifier
 *     is status-agnostic; no 'completed' filter needed for projects).
 *   - Deleted artifact: executeIdLookup / executeProjectIdLookup returns
 *     success:false (NOT_FOUND) — we assert success:false, not a tasks[] check.
 *   - Surviving fixtures after guard refusal: read-back by id (active filter)
 *     returns the task, proving it was not deleted.
 *
 * Harness mirrors update-paths.test.ts: own spawned (guarded) server,
 * run-scoped `__TEST__` fixture names (OMN-84), per-id deletion in afterAll
 * plus a name-search straggler sweep and the osascript fullCleanup() residue
 * assertion (OMN-46). Marker is 'OMN138D' — deliberately NOT a substring
 * superset of update-paths' 'OMN138U' (nor vice versa), so neither suite's
 * straggler sweep can ever match the other's fixtures.
 *
 * Not a CI unit gate: mutates the real OmniFocus DB. Runs under
 * `npm run test:integration`, excluded from `test:unit`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from '../../helpers/sandbox-manager.js';
import { RUN_NAME_PREFIX, runScopedName } from '../../helpers/run-id.js';

// Fixed future completionDate for the roundtrip test. Only the DATE part is
// asserted (see test 1) — a defaulted "now" completion would land on today's
// date and fail the check.
const COMPLETION_DATETIME = '2026-12-27 09:17';

const TS = Date.now();

// 'OMN138D' (delete/complete) — must not contain 'OMN138U' or 'OMN-138'.
const MARKER = 'OMN138D';
const SWEEP_MARKER = `${RUN_NAME_PREFIX}${MARKER}`;

const COMPLETE_TASK_NAME = runScopedName(`${MARKER}_complete_${TS}`);
const COMPLETE_PROJ_NAME = runScopedName(`${MARKER}_completeproj_${TS}`);
const DELETE_TASK_NAME = runScopedName(`${MARKER}_delete_${TS}`);
const DELETE_PROJ_NAME = runScopedName(`${MARKER}_deleteproj_${TS}`);
const BULK_TASK_A_NAME = runScopedName(`${MARKER}_bulkA_${TS}`);
const BULK_TASK_B_NAME = runScopedName(`${MARKER}_bulkB_${TS}`);

// Opaque id that cannot exist (Task.byIdentifier → null). Alphanumeric only —
// interpolated into the guard's bridge script as a literal.
const BOGUS_TASK_ID = `zzzNoSuchTaskOMN138D${TS}`;
const BOGUS_PROJ_ID = `zzzNoSuchProjOMN138D${TS}`;

describe('OMN-138: live complete/delete/bulk_delete paths (task + project, persisted read-backs)', () => {
  let serverProcess: ChildProcess;
  let nextId = 1;
  const createdTaskIds: string[] = [];
  const createdProjectIds: string[] = [];

  async function sendRequestTo(proc: ChildProcess, request: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let response = '';
      const timeout = setTimeout(() => reject(new Error('Request timeout after 120s')), 120000);

      const onData = (data: Buffer) => {
        response += data.toString();
        for (const line of response.split('\n')) {
          if (line.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc === '2.0' && 'result' in parsed) {
                clearTimeout(timeout);
                proc.stdout?.off('data', onData);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                proc.stdout?.off('data', onData);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              /* keep collecting */
            }
          }
        }
      };
      proc.stdout?.on('data', onData);
      proc.stdin?.write(requestStr);
    });
  }

  async function callToolOn(proc: ChildProcess, name: string, args: unknown): Promise<any> {
    const result = await sendRequestTo(proc, {
      jsonrpc: '2.0',
      id: ++nextId,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    const content = (result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0].text);
  }

  async function initializeServer(proc: ChildProcess): Promise<void> {
    await sendRequestTo(proc, {
      jsonrpc: '2.0',
      id: ++nextId,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
  }

  const client = {
    callTool: async (name: string, args: unknown) => callToolOn(serverProcess, name, args),
  };

  const tasksOf = (r: any): any[] => r.data?.tasks ?? r.data?.items ?? [];
  const projectsOf = (r: any): any[] => r.data?.projects ?? r.data?.items ?? [];

  /** Create an inbox task fixture (sandbox-legal via the __TEST__ name prefix). */
  async function createTask(data: Record<string, unknown>): Promise<string> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'create', target: 'task', data },
    });
    expectOk(res, `create task (${JSON.stringify(data).slice(0, 120)})`);
    const id = res.data?.id ?? res.data?.task?.taskId;
    expect(id, `created task id (response: ${JSON.stringify(res.data).slice(0, 300)})`).toBeTruthy();
    createdTaskIds.push(id);
    return id;
  }

  /** Create a project fixture inside the sandbox folder (guard requirement). */
  async function createProject(name: string): Promise<string> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'create', target: 'project', data: { name, folder: SANDBOX_FOLDER_NAME } },
    });
    expectOk(res, `create project ${name}`);
    const d = res.data ?? {};
    const id = d.project?.projectId ?? d.project?.id ?? d.projectId;
    expect(id, `created project id (response: ${JSON.stringify(d).slice(0, 300)})`).toBeTruthy();
    createdProjectIds.push(id);
    return id;
  }

  async function deleteTaskById(id: string): Promise<any> {
    return client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'task', id } });
  }

  async function deleteProjectById(id: string): Promise<any> {
    return client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'project', id } });
  }

  /**
   * Read-back: task by id, passing completed:true so the script does not skip
   * completed tasks (default behaviour: 'if (task.completed) return').
   */
  async function readTaskById(id: string, fields: string[], completed = false): Promise<any> {
    const filters: Record<string, unknown> = { id };
    if (completed) filters.completed = true;
    const res = await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters, fields: ['id', ...fields] },
    });
    expectOk(res, `read task ${id}`);
    const task = tasksOf(res).find((t: any) => t.id === id);
    expect(task, `task ${id} not found on read-back`).toBeTruthy();
    return task;
  }

  /**
   * Read-back: project by id. Project.byIdentifier is status-agnostic, so
   * completed projects are found without a special filter. Returns undefined
   * when the project does not exist (NOT_FOUND path).
   */
  async function readProjectByIdRaw(id: string, fields: string[]): Promise<any> {
    return client.callTool('omnifocus_read', {
      query: { type: 'projects', filters: { id }, fields: ['id', ...fields] },
    });
  }

  /** Independent read-back: name-substring task search (straggler sweep). */
  async function searchTasksByName(substring: string): Promise<any[]> {
    const res = await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { name: { contains: substring } }, fields: ['id', 'name'] },
    });
    expectOk(res, `search tasks by name contains "${substring}"`);
    return tasksOf(res);
  }

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    serverProcess = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    await initializeServer(serverProcess);
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    // 1. Delete every created artifact BY ID — tasks first, then projects.
    //    Completed tasks/projects are also deleted here (marking complete does
    //    not prevent deletion; the guard validates sandbox membership, not status).
    for (const id of createdTaskIds) {
      try {
        await deleteTaskById(id);
      } catch {
        /* best-effort; sweeps below catch anything missed */
      }
    }
    for (const id of createdProjectIds) {
      try {
        await deleteProjectById(id);
      } catch {
        /* best-effort; fullCleanup's orphan sweep catches __TEST__ projects */
      }
    }

    // 2. Straggler sweep BY NAME while the server is still up.
    let sweepError: unknown;
    try {
      const stragglers = await searchTasksByName(SWEEP_MARKER);
      for (const t of stragglers) {
        if (t?.id && typeof t.name === 'string' && t.name.startsWith('__TEST__')) await deleteTaskById(t.id);
      }
      const remaining = await searchTasksByName(SWEEP_MARKER);
      expect(remaining, `OMN138D stragglers survived the sweep: ${JSON.stringify(remaining)}`).toHaveLength(0);
    } catch (e) {
      sweepError = e;
    } finally {
      serverProcess?.kill();
    }

    // 3. OMN-46 fixture-leak guard: osascript-driven whole-DB sweep of
    //    __TEST__/__test- residue (no server needed).
    const report = await fullCleanup();
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
    if (sweepError !== undefined) throw sweepError;
  }, 120000);

  // ── 1. complete task with completionDate ─────────────────────────────────
  //
  // Read-back uses filters:{id, completed:true} — without the 'completed:true'
  // flag the script's default 'if (task.completed) return' would skip the task
  // and the id lookup would return NOT_FOUND (not a bug, it's the intended
  // default-active-tasks behaviour).
  it('complete task with completionDate persists (read-back shows completed:true and date-part match)', async () => {
    const id = await createTask({ name: COMPLETE_TASK_NAME });

    const writeRes = await client.callTool('omnifocus_write', {
      mutation: { operation: 'complete', target: 'task', id, completionDate: COMPLETION_DATETIME },
    });
    expectOk(writeRes, `complete task ${id}`);

    // Read back with completed:true so the script includes completed tasks.
    const task = await readTaskById(id, ['completed', 'completionDate'], true);
    expect(task.completed).toBe(true);
    // Date-part match only: proves OUR future date reached the DB (a defaulted
    // "now" completion would carry today's date and fail). Time-of-day is not
    // asserted — time-zone normalization on write makes it an unstable oracle.
    const persistedDate = task.completionDate ? new Date(task.completionDate).toISOString().slice(0, 10) : null;
    const expectedDate = COMPLETION_DATETIME.slice(0, 10);
    expect(persistedDate, `completionDate not persisted (got ${task.completionDate})`).toBe(expectedDate);
  }, 120000);

  // ── 2. complete project ───────────────────────────────────────────────────
  //
  // Project.byIdentifier is status-agnostic, so the read back via
  // filters:{id} works even after the project is completed (no 'completed:true'
  // needed on the project side).
  it('complete project persists status "done" (project id read-back)', async () => {
    const projId = await createProject(COMPLETE_PROJ_NAME);

    const writeRes = await client.callTool('omnifocus_write', {
      mutation: { operation: 'complete', target: 'project', id: projId },
    });
    expectOk(writeRes, `complete project ${projId}`);

    // Independent read-back via project id lookup.
    const readRes = await readProjectByIdRaw(projId, ['name', 'status']);
    expectOk(readRes, `read project ${projId} after complete`);
    const project = projectsOf(readRes).find((p: any) => p.id === projId);
    expect(project, `project ${projId} not found on read-back`).toBeTruthy();
    // buildProjectByIdScript maps Project.Status.Done → 'done' (the OmniJS read
    // vocab); the write layer uses 'completed'/'on_hold' as transport enum.
    expect(project.status).toBe('done');
  }, 120000);

  // ── 3. delete task → NOT_FOUND ────────────────────────────────────────────
  it('delete task removes it: read-back by id returns success:false (NOT_FOUND)', async () => {
    const id = await createTask({ name: DELETE_TASK_NAME });

    const writeRes = await client.callTool('omnifocus_write', {
      mutation: { operation: 'delete', target: 'task', id },
    });
    expectOk(writeRes, `delete task ${id}`);

    // Independent read-back — the task must be gone.
    // The id-lookup path returns success:false (NOT_FOUND) when the id resolves
    // to nothing; we assert success:false rather than an empty tasks[].
    const readRes = await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { id }, fields: ['id', 'name'] },
    });
    expect(
      readRes.success,
      `task ${id} was not deleted — still found on read-back: ${JSON.stringify(readRes).slice(0, 300)}`,
    ).toBe(false);
    // Pin the error CODE: a transient SCRIPT_ERROR on the read would also be
    // success:false but must not false-green "deleted".
    expect(readRes.error?.code, `expected NOT_FOUND, got: ${JSON.stringify(readRes.error).slice(0, 300)}`).toBe(
      'NOT_FOUND',
    );
  }, 120000);

  // ── 4. delete project → NOT_FOUND ─────────────────────────────────────────
  it('delete project removes it: project read-back by id returns success:false (NOT_FOUND)', async () => {
    const projId = await createProject(DELETE_PROJ_NAME);

    const writeRes = await client.callTool('omnifocus_write', {
      mutation: { operation: 'delete', target: 'project', id: projId },
    });
    expectOk(writeRes, `delete project ${projId}`);

    // Independent read-back — the project must be gone.
    const readRes = await readProjectByIdRaw(projId, ['name']);
    expect(
      readRes.success,
      `project ${projId} was not deleted — still found on read-back: ${JSON.stringify(readRes).slice(0, 300)}`,
    ).toBe(false);
    // Pin the error CODE: a transient SCRIPT_ERROR on the read would also be
    // success:false but must not false-green "deleted".
    expect(readRes.error?.code, `expected NOT_FOUND, got: ${JSON.stringify(readRes.error).slice(0, 300)}`).toBe(
      'NOT_FOUND',
    );
  }, 120000);

  // ── 5. bulk_delete mixed real+bogus ids → whole-dispatch guard refusal ─────
  //
  // GUARD INTERACTION (LOAD-BEARING assertion, note carefully):
  //
  // In test mode, MUTATION_DEFS['bulk_delete/task'].guard runs:
  //   Promise.all(taskIds.map(id => validateTaskInSandbox(id, 'bulk delete')))
  //
  // A bogus id resolves to not_found → isTaskInSandbox returns false → throws.
  // Promise.all propagates the first rejection → the guard throw bubbles up
  // through buildBulkDeleteTasksScript → is caught by handleBulkDeleteTasks'
  // outer try/catch → error ends up in errors[] → ENTIRE dispatch refused
  // with successCount:0.
  //
  // NOTE ON RESPONSE SHAPE: unlike single-op guards (which surface as
  // success:false via createErrorResponseV2), handleBulkDeleteTasks wraps ALL
  // errors — including the thrown guard error — in its catch block and returns
  // success:true with data.successCount:0, data.errorCount:1, data.errors[].
  // Documented current behavior; envelope follow-up tracked in OMN-144. The
  // test asserts this shape.
  //
  // This whole-dispatch refusal IS the OMN-120 non-bypass contract (guard must
  // cover every id before any mutation executes). The unguarded per-item
  // continue-on-error behavior (provided by the AST emitter's bulkDeleteItem
  // try/continue-on-error unroll) is correct in production mode and is covered
  // by unit tests; it is unreachable in test mode because the guard pre-flighted
  // all ids.
  //
  // The test asserts:
  //   (a) the write response carries success:true but successCount:0, with the
  //       TEST GUARD error text in data.errors[0].error
  //   (b) BOTH real task fixtures still exist (read-back succeeds for each)
  it('bulk_delete with a bogus id in the list: guard refusal surfaced in data.errors with successCount:0; both real fixtures survive', async () => {
    const idA = await createTask({ name: BULK_TASK_A_NAME });
    const idB = await createTask({ name: BULK_TASK_B_NAME });

    const writeRes = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'bulk_delete',
        target: 'task',
        ids: [idA, BOGUS_TASK_ID, idB],
      },
    });

    // (a) The bulk handler wraps the guard throw in its catch block, so the
    // top-level response is success:true with zero deletes and one error entry.
    // The guard error text is in data.errors[0].error.
    expect(writeRes.success, `unexpected hard failure, got: ${JSON.stringify(writeRes).slice(0, 400)}`).toBe(true);
    const data = writeRes.data;
    expect(data.successCount, `expected zero deletes due to guard refusal, got: ${data.successCount}`).toBe(0);
    expect(
      data.errorCount,
      `expected one guard error entry, got errorCount: ${data.errorCount}`,
    ).toBeGreaterThanOrEqual(1);
    // The guard error text is in the errors array — not the top-level response.
    const errText = JSON.stringify(data.errors ?? []);
    expect(errText, `guard error text not in data.errors: ${errText}`).toContain('TEST GUARD');
    expect(errText).toContain('outside sandbox');

    // (b) Both real tasks survive — guard ran before any delete script.
    const taskA = await readTaskById(idA, ['name']);
    expect(taskA.name).toBe(BULK_TASK_A_NAME);
    const taskB = await readTaskById(idB, ['name']);
    expect(taskB.name).toBe(BULK_TASK_B_NAME);
  }, 120000);

  // ── 6. not-found single ops: complete + delete with bogus ids ─────────────
  //
  // GUARD INTERACTION: same as update-paths row 6. The guard's pre-flight
  // (validateTaskInSandbox → isTaskInSandbox → Task.byIdentifier → null →
  // "outside sandbox") fires BEFORE the mutation script. Script-level
  // "Task not found:" / "Project not found:" are unreachable on the guarded
  // server. The refusal IS the correct live behavior in test mode.
  it('complete a non-existent task id is refused by the sandbox guard (not a script-level not-found)', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'complete', target: 'task', id: BOGUS_TASK_ID },
    });

    expect(res.success, `expected guard refusal, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('TEST GUARD');
    expect(errText).toContain('outside sandbox');
    expect(errText).not.toContain('Task not found');
  }, 120000);

  it('delete a non-existent task id is refused by the sandbox guard (not a script-level not-found)', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'delete', target: 'task', id: BOGUS_TASK_ID },
    });

    expect(res.success, `expected guard refusal, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('TEST GUARD');
    expect(errText).toContain('outside sandbox');
    expect(errText).not.toContain('Task not found');
  }, 120000);

  it('complete a non-existent project id is refused by the sandbox guard', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'complete', target: 'project', id: BOGUS_PROJ_ID },
    });

    expect(res.success, `expected guard refusal, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('TEST GUARD');
    expect(errText).toContain('outside sandbox');
    expect(errText).not.toContain('Project not found');
  }, 120000);

  it('delete a non-existent project id is refused by the sandbox guard', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'delete', target: 'project', id: BOGUS_PROJ_ID },
    });

    expect(res.success, `expected guard refusal, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('TEST GUARD');
    expect(errText).toContain('outside sandbox');
    expect(errText).not.toContain('Project not found');
  }, 120000);
});
