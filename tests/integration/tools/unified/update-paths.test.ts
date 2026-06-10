/**
 * OMN-138 (OMN-128 slice 4) — live update-path coverage for the OmniJS-native
 * mutation AST: task updates (scalars, date set/clear, tag replace/add/remove,
 * project moves) and project updates (rename + status, folder move), all on
 * the rewritten buildUpdateTaskScript / buildUpdateProjectScript lowerings.
 *
 * CARDINAL RULE (the slice-3 vacuous-parentage lesson): every assertion reads
 * back the PERSISTED value via a follow-up omnifocus_read call — never the
 * write response's own echo. The single deliberate exception is the §2.4
 * update-project envelope check: slice 4 replaced the legacy stale echo
 * (`changes.status || 'active'`) with a LIVE status read-back inside the
 * mutation script, and that response-side contract is itself under test —
 * proven by an update that does NOT touch status still reporting the
 * persisted 'on_hold', which the legacy echo could never do.
 *
 * Coverage matrix (plan Task 10):
 *   1. rename + flag             → read shows new name + flagged true
 *   2. dueDate set, then clear   → read shows the date, then null
 *   3. tags replace              → read shows exactly the new set (old gone)
 *   4. addTags then removeTags   → read shows union, then difference
 *   5. move to project / inbox   → read shows projectId == fixture project's
 *                                  ID (not name), then inInbox true
 *   6. not-found target (guarded)→ TEST GUARD refusal — see below
 *   7. project rename + on_hold  → read shows status persisted; §2.4 envelope
 *   8. project folder move       → read shows persisted parent folder (tied
 *                                  to the destination folder's ID)
 *
 * GUARD INTERACTION on row 6 (OMN-46): the sandbox guard's update pre-flight
 * is ID-only (`Task.byIdentifier`) and runs BEFORE the mutation script — an
 * unknown id resolves to nothing, is therefore "outside sandbox", and the
 * guard REFUSES it. The script-level loud `Task not found:` guard is
 * unreachable on a guarded server; this suite asserts the refusal. The
 * unguarded not-found probes (script-level `Task not found:` /
 * `Project not found:`) belong to Task 11's live /verify matrix.
 *
 * SKIPPED matrix row (carried from the Task-7 review): "composed failure —
 * status apply fails while other changes succeed". Not reproducible against
 * live OmniFocus: the update schema enum-gates status to the four valid
 * values, PROJECT_STATUS_UPDATE_ENUM maps each to a real Project.Status
 * constant, and assigning any valid constant to `project.status` succeeds
 * unconditionally regardless of the project's current state — there is no
 * schema-reachable input that makes the live setter throw. Faking it with a
 * mock would defeat this suite's purpose (live artifact, not wiring), so the
 * row is skipped. The warn-path wiring itself is covered by the unit suite.
 *
 * Harness mirrors create-paths.test.ts: own spawned (guarded) server,
 * run-scoped `__TEST__` fixture names (OMN-84), per-id deletion in afterAll
 * plus a name-search straggler sweep and the osascript fullCleanup() residue
 * assertion (OMN-46). Marker is 'OMN138U' — deliberately NOT a substring
 * superset of create-paths' 'OMN-138' marker (nor vice versa), so neither
 * suite's straggler sweep can ever match the other's fixtures.
 *
 * Not a CI unit gate: mutates the real OmniFocus DB. Runs under
 * `npm run test:integration`, excluded from `test:unit`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from '../../helpers/sandbox-manager.js';
import { RUN_NAME_PREFIX, runScopedName, runScopedTag } from '../../helpers/run-id.js';

// Fixed, unambiguous future datetime (field-roundtrip rationale: NOT a default
// time — :23 past 14:00 can only be a value we wrote).
const DUE_DATETIME = '2026-12-26 14:23';

const TS = Date.now();

// 'OMN138U' (update) — see header for why it must not contain 'OMN-138'.
const MARKER = 'OMN138U';
const SWEEP_MARKER = `${RUN_NAME_PREFIX}${MARKER}`;

const RENAME_TASK_NAME = runScopedName(`${MARKER}_rename_${TS}`);
const RENAME_TASK_NEW_NAME = runScopedName(`${MARKER}_renamed_${TS}`);
const DATE_TASK_NAME = runScopedName(`${MARKER}_date_${TS}`);
const TAGS_TASK_NAME = runScopedName(`${MARKER}_tags_${TS}`);
const ADDRM_TASK_NAME = runScopedName(`${MARKER}_addrm_${TS}`);
const MOVE_TASK_NAME = runScopedName(`${MARKER}_move_${TS}`);
const TARGET_PROJECT_NAME = runScopedName(`${MARKER}_target-proj_${TS}`);
const UPD_PROJECT_NAME = runScopedName(`${MARKER}_proj_${TS}`);
const UPD_PROJECT_NEW_NAME = runScopedName(`${MARKER}_proj_renamed_${TS}`);
const MOVE_PROJECT_NAME = runScopedName(`${MARKER}_moveproj_${TS}`);
const SUBFOLDER_NAME = runScopedName(`${MARKER}_subfolder_${TS}`);

const TAG_OLD = runScopedTag(`omn138u-old-${TS}`);
const TAG_NEW_1 = runScopedTag(`omn138u-new1-${TS}`);
const TAG_NEW_2 = runScopedTag(`omn138u-new2-${TS}`);
const TAG_BASE = runScopedTag(`omn138u-base-${TS}`);
const TAG_ADDED = runScopedTag(`omn138u-added-${TS}`);

// Opaque id that cannot exist (Task.byIdentifier → null). Alphanumeric only:
// it gets interpolated into the guard's bridge script as a literal.
const BOGUS_TASK_ID = `zzzNoSuchTaskOMN138U${TS}`;

describe('OMN-138: live update paths (task + project, persisted read-backs)', () => {
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
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    });
  }

  const client = {
    callTool: async (name: string, args: unknown) => callToolOn(serverProcess, name, args),
  };

  const tasksOf = (r: any): any[] => r.data?.tasks ?? r.data?.items ?? [];
  const projectsOf = (r: any): any[] => r.data?.projects ?? r.data?.items ?? [];
  // Order-insensitive tag-set oracle (addTag append order is not contractual).
  const sorted = (xs: string[]): string[] => [...xs].sort((a, b) => a.localeCompare(b));

  /** Independent read-back: exact-id task lookup with an explicit projection. */
  async function readTaskById(id: string, fields: string[]): Promise<any> {
    const res = await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { id }, fields: ['id', ...fields] },
    });
    expectOk(res, `read task ${id}`);
    const task = tasksOf(res).find((t: any) => t.id === id);
    expect(task, `task ${id} not found on read-back`).toBeTruthy();
    return task;
  }

  /**
   * Independent read-back: projects scoped to a folder, found by id (the
   * proven OMN-60 pattern — project reads have no id filter; the folder scope
   * keeps the 25-row cap irrelevant). Returns undefined when the project is
   * not in that folder — callers moving projects use that as the oracle.
   */
  async function readProjectInFolder(id: string, fields: string[], folder: string): Promise<any> {
    const res = await client.callTool('omnifocus_read', {
      query: { type: 'projects', filters: { folder }, fields: ['id', ...fields] },
    });
    expectOk(res, `read projects in folder "${folder}"`);
    return projectsOf(res).find((p: any) => p.id === id);
  }

  /** Independent read-back: name-substring task search (straggler sweep). */
  async function searchTasksByName(substring: string): Promise<any[]> {
    const res = await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { name: { contains: substring } }, fields: ['id', 'name'] },
    });
    expectOk(res, `search tasks by name contains "${substring}"`);
    return tasksOf(res);
  }

  async function deleteTaskById(id: string): Promise<any> {
    return client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'task', id } });
  }

  async function deleteProjectById(id: string): Promise<any> {
    return client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'project', id } });
  }

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

  async function updateTask(id: string, changes: Record<string, unknown>): Promise<any> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'update', target: 'task', id, changes },
    });
    expectOk(res, `update task ${id} (${JSON.stringify(changes).slice(0, 120)})`);
    return res;
  }

  async function updateProject(id: string, changes: Record<string, unknown>): Promise<any> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'update', target: 'project', id, changes },
    });
    expectOk(res, `update project ${id} (${JSON.stringify(changes).slice(0, 120)})`);
    return res;
  }

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    serverProcess = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    await initializeServer(serverProcess);
    // Project fixtures + the folder-move destination live under the sandbox.
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    // 1. Delete every created artifact BY ID — tasks first (some live inside
    //    fixture projects), then projects. The moved-to-subfolder project
    //    still deletes: its id was guard-validated (and cached) while it sat
    //    directly in the sandbox.
    for (const id of createdTaskIds) {
      try {
        await deleteTaskById(id);
      } catch {
        /* best-effort; the sweeps below catch anything missed */
      }
    }
    for (const id of createdProjectIds) {
      try {
        await deleteProjectById(id);
      } catch {
        /* best-effort; fullCleanup's orphan sweep catches __TEST__ projects */
      }
    }

    // 2. Straggler sweep BY NAME while the server is still up (same shape as
    //    create-paths: run-scoped AND __TEST__-prefixed marker, so it can
    //    never match real user data). Captured-then-rethrown so step 3's
    //    whole-DB fullCleanup always runs.
    let sweepError: unknown;
    try {
      const stragglers = await searchTasksByName(SWEEP_MARKER);
      for (const t of stragglers) {
        if (t?.id && typeof t.name === 'string' && t.name.startsWith('__TEST__')) await deleteTaskById(t.id);
      }
      const remaining = await searchTasksByName(SWEEP_MARKER);
      expect(remaining, `OMN138U stragglers survived the sweep: ${JSON.stringify(remaining)}`).toHaveLength(0);
    } catch (e) {
      sweepError = e;
    } finally {
      serverProcess?.kill();
    }

    // 3. OMN-46 fixture-leak guard: osascript-driven whole-DB sweep of
    //    __TEST__/__test- residue (no server needed) — also removes the
    //    subfolder and tag fixtures, which have no per-id delete op.
    const report = await fullCleanup();
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
    if (sweepError !== undefined) throw sweepError;
  }, 120000);

  // ── 1. rename + flag ──────────────────────────────────────────────────────
  it('rename + flag persists (read-back shows new name and flagged true)', async () => {
    const id = await createTask({ name: RENAME_TASK_NAME });

    await updateTask(id, { name: RENAME_TASK_NEW_NAME, flagged: true });

    const task = await readTaskById(id, ['name', 'flagged']);
    expect(task.name).toBe(RENAME_TASK_NEW_NAME);
    expect(task.flagged).toBe(true);
  }, 120000);

  // ── 2. dueDate set, then clearDueDate ────────────────────────────────────
  it('dueDate set persists, then clearDueDate reads back null', async () => {
    const id = await createTask({ name: DATE_TASK_NAME });

    await updateTask(id, { dueDate: DUE_DATETIME });
    const afterSet = await readTaskById(id, ['dueDate']);
    // Projection serializes to ISO — normalize both sides to epoch (exact
    // equality; same oracle as create-paths/field-roundtrip).
    expect(new Date(afterSet.dueDate).getTime()).toBe(new Date(DUE_DATETIME).getTime());

    await updateTask(id, { clearDueDate: true });
    const afterClear = await readTaskById(id, ['dueDate']);
    expect(afterClear.dueDate, 'dueDate not cleared').toBeNull();
  }, 120000);

  // ── 3. tags: [...] replace ────────────────────────────────────────────────
  it('tags replace persists exactly the new tag set (old tag gone)', async () => {
    const id = await createTask({ name: TAGS_TASK_NAME, tags: [TAG_OLD] });
    // Anchor the starting state — "old tag gone" is only meaningful if the
    // old tag verifiably existed first.
    const before = await readTaskById(id, ['tags']);
    expect(before.tags).toEqual([TAG_OLD]);

    await updateTask(id, { tags: [TAG_NEW_1, TAG_NEW_2] });

    const after = await readTaskById(id, ['tags']);
    expect(sorted(after.tags)).toEqual(sorted([TAG_NEW_1, TAG_NEW_2]));
    expect(after.tags).not.toContain(TAG_OLD);
  }, 120000);

  // ── 4. addTags then removeTags ───────────────────────────────────────────
  it('addTags reads back the union, removeTags the difference', async () => {
    const id = await createTask({ name: ADDRM_TASK_NAME, tags: [TAG_BASE] });

    await updateTask(id, { addTags: [TAG_ADDED] });
    const afterAdd = await readTaskById(id, ['tags']);
    expect(sorted(afterAdd.tags)).toEqual(sorted([TAG_BASE, TAG_ADDED]));

    await updateTask(id, { removeTags: [TAG_BASE] });
    const afterRemove = await readTaskById(id, ['tags']);
    expect(afterRemove.tags).toEqual([TAG_ADDED]);
  }, 120000);

  // ── 5. move to a sandbox project, then back to the inbox ─────────────────
  it('changes.project moves the task (projectId read-back == fixture project ID), project:null returns it to the inbox', async () => {
    const projId = await createProject(TARGET_PROJECT_NAME);
    const id = await createTask({ name: MOVE_TASK_NAME });

    await updateTask(id, { project: projId });
    const moved = await readTaskById(id, ['projectId', 'inInbox']);
    // The ID, not the name: a name match would still pass if the move resolved
    // a same-named project elsewhere.
    expect(moved.projectId).toBe(projId);
    expect(moved.inInbox).toBe(false);

    await updateTask(id, { project: null });
    const back = await readTaskById(id, ['projectId', 'inInbox']);
    expect(back.inInbox).toBe(true);
    expect(back.projectId).toBeNull();
  }, 120000);

  // ── 6. not-found target on the guarded server: TEST GUARD refusal ────────
  //
  // The guard's ID-only pre-flight (Task.byIdentifier) refuses unknown ids
  // BEFORE the mutation script runs — the script-level 'Task not found:'
  // envelope is unreachable here (it belongs to Task 11's unguarded /verify
  // matrix). The refusal IS the guarded server's contract for this input.
  it('update of an unknown task id is refused by the sandbox guard (not a script-level not-found)', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'update', target: 'task', id: BOGUS_TASK_ID, changes: { flagged: true } },
    });

    expect(res.success, `expected guard refusal, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error);
    expect(errText).toContain('TEST GUARD');
    expect(errText).toContain('outside sandbox');
    // And NOT the script-level envelope — the guard fired pre-script.
    expect(errText).not.toContain('Task not found');
  }, 120000);

  // ── 7. update-project rename + status on_hold (incl. the §2.4 envelope) ──
  it('project rename + status on_hold persists; the response carries the LIVE status read-back, not an echo', async () => {
    const projId = await createProject(UPD_PROJECT_NAME);

    const res = await updateProject(projId, { name: UPD_PROJECT_NEW_NAME, status: 'on_hold' });
    // §2.4 deliberate response check: the envelope status is read back from
    // the live object post-apply (transport vocab 'on_hold').
    expect(res.data.status).toBe('on_hold');

    // Independent read-back — the persisted truth. Read projection vocab is
    // hyphenated ('on-hold'), distinct from the transport enum.
    const project = await readProjectInFolder(projId, ['name', 'status'], SANDBOX_FOLDER_NAME);
    expect(project, `project ${projId} not found in sandbox on read-back`).toBeTruthy();
    expect(project.name).toBe(UPD_PROJECT_NEW_NAME);
    expect(project.status).toBe('on-hold');

    // No-stale-echo proof: an update that does NOT touch status must still
    // report the persisted 'on_hold'. The legacy envelope echoed
    // `changes.status || 'active'` — it would say 'active' here.
    const res2 = await updateProject(projId, { note: `omn138u-note-${TS}` });
    expect(res2.data.status, 'envelope status is a stale echo, not a live read-back').toBe('on_hold');
  }, 120000);

  // ── 8. update-project folder move into a sandbox subfolder ───────────────
  it('changes.folder moves the project; read-back ties the persisted parent to the destination folder ID', async () => {
    // Destination subfolder under the sandbox (guard requirement for create).
    const subRes = await client.callTool('omnifocus_write', {
      mutation: { operation: 'create_folder', data: { name: SUBFOLDER_NAME, parentFolder: SANDBOX_FOLDER_NAME } },
    });
    expectOk(subRes, 'create sandbox subfolder');
    const subfolderId = subRes.data?.folder?.folderId;
    expect(subfolderId, `subfolder id (response: ${JSON.stringify(subRes.data).slice(0, 300)})`).toBeTruthy();

    const projId = await createProject(MOVE_PROJECT_NAME);

    // Move BY FOLDER ID — no name-resolution ambiguity in the destination ref.
    await updateProject(projId, { folder: subfolderId });

    // Project reads expose the parent folder by name/path only (folderId is
    // not in DEFAULT_PROJECT_FIELDS), so the ID assertion is a two-step chain
    // through one folders read: (a) the folder with the CAPTURED ID is the
    // run-scoped-unique destination; (b) the project reads back inside that
    // folder (scoped filter + name + path all agree).
    const foldersRes = await client.callTool('omnifocus_read', { query: { type: 'folders' } });
    expectOk(foldersRes, 'folders read-back');
    const folders = foldersRes.data?.folders ?? [];
    const destination = folders.find((f: any) => f.id === subfolderId);
    expect(destination, `destination folder ${subfolderId} missing from read-back`).toBeTruthy();
    expect(destination.name).toBe(SUBFOLDER_NAME);

    const moved = await readProjectInFolder(projId, ['folder', 'folderPath'], SUBFOLDER_NAME);
    expect(
      moved,
      `project ${projId} did not read back inside the destination folder (move not persisted?)`,
    ).toBeTruthy();
    expect(moved.folder).toBe(SUBFOLDER_NAME);
    // Anchor the full path on the ID-identified destination's own path.
    expect(moved.folderPath).toBe(destination.path);

    // And the confounded-oracle inverse: it is no longer DIRECTLY in the
    // sandbox root (the source filter must not still claim it).
    const stillAtRoot = await readProjectInFolder(projId, ['folder'], SANDBOX_FOLDER_NAME);
    if (stillAtRoot) {
      // filters.folder may match descendants; only a project whose direct
      // parent still reads as the sandbox root proves a silent no-op.
      expect(stillAtRoot.folder, 'project still parented at the sandbox root — folder move did not persist').not.toBe(
        SANDBOX_FOLDER_NAME,
      );
    }
  }, 120000);
});
