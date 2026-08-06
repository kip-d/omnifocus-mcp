/**
 * OMN-138 (OMN-128 slice 5) — live complete/delete/bulk_delete coverage for the
 * OmniJS-native mutation AST: task complete (with completionDate), project
 * complete, task delete, project delete, bulk task delete (mixed real+bogus ids),
 * and not-found single ops. All paths use the new AST lowerings
 * (buildCompleteScript / buildDeleteScript / buildBulkDeleteTasksScript) wired
 * in slice 5.
 *
 * CARDINAL RULE (the slice-3 vacuous-parentage lesson): every assertion reads
 * back the PERSISTED value via a follow-up omnifocus_read call — never the
 * write response's own echo. Single deliberate exceptions: the delete read-backs
 * are NOT_FOUND assertions (the object no longer exists), and the not-found
 * probes assert the error envelope shape.
 *
 * Coverage matrix:
 *   1. complete task with completionDate → read back completed:true + date-part
 *   2. complete project → read back status "done" (project id lookup)
 *   3. delete task → read back NOT_FOUND
 *   4. delete project → read back NOT_FOUND
 *   5. bulk_delete mixed real+bogus ids → batch PARTITIONS (see below)
 *   6. not-found single ops (complete + delete bogus id) → script-level not-found
 *
 * GUARD INTERACTION on rows 5–6 (OMN-46 + OMN-120, revised by OMN-286):
 *
 * OMN-286 replaced the guard's boolean with a tri-state —
 * 'in_sandbox' | 'outside_sandbox' | 'not_found' — because collapsing the last
 * two made a single bogus id abort an entire continue-on-error batch. Rows 5–6
 * assert the post-OMN-286 contract; they asserted the collapsed one until
 * OMN-300.
 *
 * Single ops (complete, delete): these are ID-ADDRESSED, resolving strictly via
 * Task.byIdentifier. A miss writes nothing, so 'not_found' is deliberately
 * PASSED THROUGH and the script-level "Task not found:" envelope is the correct
 * live result — not a guard escape. Same pattern as update-paths row 6.
 *
 * Bulk delete (row 5): the guard still pre-flights ALL ids (spec §2.1,
 * MUTATION_DEFS 'bulk_delete/task'), but a bogus id now passes through instead
 * of throwing, so the batch partitions: the real ids delete and the miss lands
 * in errors[], with the response staying success:true (OMN-137 partial-success
 * contract). Both real fixtures are therefore GONE, not surviving.
 *
 * Still fail-closed, and NOT covered here: an id resolving OUTSIDE the sandbox
 * is 'outside_sandbox' and still refuses the whole dispatch (the OMN-120
 * non-bypass contract). That case cannot be staged from this file — the guard
 * forbids creating a fixture outside the sandbox — so it lives in unit coverage,
 * as does the production-mode per-item continue-on-error unroll.
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
import { expectOk } from '../../helpers/expect-ok.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from '../../helpers/sandbox-manager.js';
import { RUN_NAME_PREFIX, runScopedName } from '../../helpers/run-id.js';
import { UnifiedTestServer } from '../../helpers/unified-test-server.js';

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
  let server: UnifiedTestServer;
  const createdTaskIds: string[] = [];
  const createdProjectIds: string[] = [];

  // Thin adapter so the existing `client.callTool(...)` callsites stay intact;
  // reads `server` at call time (assigned in beforeAll). See
  // helpers/unified-test-server.ts for the spawn/JSON-RPC scaffolding.
  const client = {
    callTool: (name: string, args: unknown) => server.callTool(name, args),
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
   * Read-back: task by id WITHOUT asserting presence. readTaskById above pins
   * the task as found, which is wrong for rows that assert a task is gone.
   */
  async function readTaskByIdRaw(id: string, fields: string[]): Promise<any> {
    return client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { id }, fields: ['id', ...fields] },
    });
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
    server = await UnifiedTestServer.start();
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
      server?.kill();
    }

    // 3. OMN-46 fixture-leak guard: osascript-driven whole-DB sweep of
    //    __TEST__/__test- residue (no server needed).
    const report = await fullCleanup({ scope: 'full' });
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
    // Read vocab (PROJECT_STATUS_STRING_SNIPPET, OMN-274) maps
    // Project.Status.Done → 'done'; the write layer uses 'completed'/'on_hold'
    // as transport enum.
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

  // ── 5. bulk_delete mixed real+bogus ids → the batch PARTITIONS ────────────
  //
  // GUARD INTERACTION (LOAD-BEARING assertion, note carefully). This row
  // asserted whole-dispatch refusal before OMN-286; that is no longer the
  // contract, and the change was the entire point of that ticket.
  //
  // In test mode, MUTATION_DEFS['bulk_delete/task'].guard pre-flights every id.
  // Pre-OMN-286 the check returned a boolean, so a bogus id was
  // indistinguishable from an out-of-sandbox one: the guard threw, Promise.all
  // propagated, and the ENTIRE dispatch was refused with successCount:0 — even
  // though the batch is a continue-on-error route. OMN-286 made the check a
  // tri-state ('in_sandbox' | 'outside_sandbox' | 'not_found') so that a
  // strictly-resolved miss PASSES THROUGH: it writes nothing, so it is safe,
  // and the batch now partitions the way it does in production — real ids
  // delete, the bogus one lands in errors[].
  //
  // Still true, and NOT what this row covers: an id that resolves OUTSIDE the
  // sandbox is 'outside_sandbox', still fails closed, and still refuses the
  // whole dispatch (the OMN-120 non-bypass contract). That case cannot be
  // staged from here — the guard forbids creating a fixture outside the
  // sandbox in the first place — so it lives in unit coverage.
  //
  // The test asserts:
  //   (a) partial success: success:true with the bogus id loud in data.errors[]
  //       (OMN-137 contract), NOT a top-level BULK_DELETE_FAILED
  //   (b) BOTH real task fixtures are GONE — the batch proceeded past the miss
  it('bulk_delete with a bogus id in the list: the batch partitions — real ids delete, the bogus one errors (OMN-286)', async () => {
    const idA = await createTask({ name: BULK_TASK_A_NAME });
    const idB = await createTask({ name: BULK_TASK_B_NAME });

    const writeRes = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'bulk_delete',
        target: 'task',
        ids: [idA, BOGUS_TASK_ID, idB],
      },
    });

    // (a) Partial success, not a whole-dispatch refusal.
    expect(writeRes.success, `expected partial success, got: ${JSON.stringify(writeRes).slice(0, 400)}`).toBe(true);
    const resText = JSON.stringify(writeRes);
    // The miss is reported, not swallowed — silence here would be the real bug.
    expect(resText, `bogus id not reported anywhere in response: ${resText.slice(0, 400)}`).toContain(BOGUS_TASK_ID);
    // And it passed through the guard rather than being refused by it.
    expect(resText).not.toContain('TEST GUARD');

    // (b) Both real tasks are gone — the batch did NOT abort on the miss.
    //
    // Same idiom as the single delete rows above: an id lookup for a deleted
    // task returns success:false with code NOT_FOUND (verified live — it does
    // NOT return success:true with an empty array). Pin the CODE, not just the
    // false: a transient SCRIPT_ERROR is also success:false and must not
    // false-green "deleted" when the task may still exist.
    for (const [id, label] of [
      [idA, BULK_TASK_A_NAME],
      [idB, BULK_TASK_B_NAME],
    ] as const) {
      const readRes = await readTaskByIdRaw(id, ['name']);
      expect(
        readRes.success,
        `task ${label} (${id}) survived a bulk_delete that should have removed it: ${JSON.stringify(readRes).slice(0, 300)}`,
      ).toBe(false);
      expect(
        readRes.error?.code,
        `expected NOT_FOUND for deleted ${label}, got: ${JSON.stringify(readRes.error).slice(0, 300)}`,
      ).toBe('NOT_FOUND');
    }
  }, 120000);

  // ── 6. not-found single ops: complete + delete with bogus ids ─────────────
  //
  // GUARD INTERACTION (OMN-286 tri-state; these rows previously asserted the
  // pre-OMN-286 collapsed boolean). The guard distinguishes three states, not
  // two: 'in_sandbox' | 'outside_sandbox' | 'not_found'. For ID-ADDRESSED
  // mutations the id resolves STRICTLY via byIdentifier, so a miss writes
  // nothing and 'not_found' is deliberately PASSED THROUGH — the script-level
  // "Task not found:" / "Project not found:" is the correct live behavior, not
  // a guard escape. (Fail-closed is still required where a NAME fallback
  // exists — e.g. create-with-project — because a not-found-by-id value could
  // resolve by name to something outside the sandbox. That path is asserted in
  // the create tests and in unit coverage.)
  //
  // These rows therefore assert the INVERSE of the guard refusal: the
  // not-found surfaces, and TEST GUARD does NOT — which is what pins the
  // pass-through half of the tri-state. See src/contracts/ast/
  // mutation-script-builder.ts (SandboxCheck) for the adjudication.
  it('complete a non-existent task id passes the guard and surfaces a script-level not-found (OMN-286)', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'complete', target: 'task', id: BOGUS_TASK_ID },
    });

    expect(res.success, `expected failure, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('Task not found');
    // Pass-through, NOT a refusal — the discriminating half of the tri-state.
    expect(errText).not.toContain('TEST GUARD');
  }, 120000);

  it('delete a non-existent task id passes the guard and surfaces a script-level not-found (OMN-286)', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'delete', target: 'task', id: BOGUS_TASK_ID },
    });

    expect(res.success, `expected failure, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('Task not found');
    expect(errText).not.toContain('TEST GUARD');
  }, 120000);

  it('complete a non-existent project id passes the guard and surfaces a script-level not-found (OMN-286)', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'complete', target: 'project', id: BOGUS_PROJ_ID },
    });

    expect(res.success, `expected failure, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('Project not found');
    expect(errText).not.toContain('TEST GUARD');
  }, 120000);

  it('delete a non-existent project id passes the guard and surfaces a script-level not-found (OMN-286)', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'delete', target: 'project', id: BOGUS_PROJ_ID },
    });

    expect(res.success, `expected failure, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('Project not found');
    expect(errText).not.toContain('TEST GUARD');
  }, 120000);
});
