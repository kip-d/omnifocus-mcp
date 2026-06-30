/**
 * OMN-61 Phase 3 — per-field write→read round-trip harness.
 *
 * Phases 1 & 2 are STATIC gates: they prove a field is *wired* (declared ↔
 * implemented), not that it *persists*. This suite closes that: for each
 * settable field, set a NON-DEFAULT value via the public write tool, read it
 * back through an INDEPENDENT omnifocus_read call, assert it persisted. This is
 * the gate that catches the OMN-60 class (writer silently no-ops, success is
 * still reported) at the behavior level.
 *
 * Design + hard lessons: docs/dev/omn-61-phase3-roundtrip-design.md
 *
 *   1. Non-default values only — a value equal to the OmniFocus default cannot
 *      distinguish "wrote correctly" from "did nothing".
 *   2. The reader must be able to see the field — a field settable but absent
 *      from the read projection reads back undefined; that is a READ GAP
 *      (xfail + ticket), never a silent skip and never a persistence failure.
 *   3. Independent read — re-read via a separate tool call (separate
 *      evaluateJavascript context), never the write response's own echo.
 *
 * Oracle discipline: the read projection TRANSFORMS values (dates → ISO,
 * status → hyphenated, repetitionRule → ruleString, tags → name strings). Every
 * extractor normalizes BOTH sides to a canonical form so the equality check
 * means exactly "persisted" — the blind-instrument trap (OMN-60) applied to the
 * harness itself.
 *
 * Not a CI unit gate: mutates the real OmniFocus DB, one+ live evaluateJS per
 * row. Runs under `npm run test:integration`, excluded from `test:unit`.
 *
 * Sandbox: entities live in __MCP_TEST_SANDBOX__ / __TEST__ / __test-, deleted
 * in afterAll; a residue assertion fails loud on fixture leak (OMN-46).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { assertFieldPersisted } from '../../helpers/assert-field-persisted.js';
import { SANDBOX_FOLDER_NAME, ensureSandboxFolder, fullCleanup } from '../../helpers/sandbox-manager.js';
import { runScopedName, runScopedTag } from '../../helpers/run-id.js';

// A fixed, unambiguous future datetime. NOT a default time: due defaults to
// 17:00, defer to 08:00 — :23 past 14:00 can only be a value we wrote.
const TEST_DATETIME = '2026-12-25 14:23';
const TEST_DATETIME_EPOCH = new Date(TEST_DATETIME).getTime();

const TS = Date.now();

// OMN-84: per-run scoped fixture names. The literal "__TEST__ RT" prefix used
// to cause cross-run contamination — Ctrl-C'd runs would leave behind
// "__TEST__ RT <some-epoch>" inbox tasks that masked as current-run leakage.
// Each run now stamps RUN_ID into every fixture name.
const RT_TASK_NAME = runScopedName(`RT_${TS}`);
const RT_PROJ_A_NAME = runScopedName(`RT_A_${TS}`);
const RT_PROJ_B_NAME = runScopedName(`RT_B_${TS}`);
const RT_TASK_RENAMED = runScopedName(`RT_renamed_${TS}`);
const RT_PROJ_RENAMED = runScopedName(`RT_proj_renamed_${TS}`);
const RT_SUBFOLDER_NAME = runScopedName(`RTsub_${TS}`);
const RT_TAG = runScopedTag(`rt-${TS}`);

describe('OMN-61 Phase 3: per-field write→read round-trip', () => {
  let serverProcess: ChildProcess;
  let nextId = 1;
  const createdTaskIds: string[] = [];
  const createdProjectIds: string[] = [];

  async function sendRequest(request: unknown): Promise<any> {
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
                serverProcess.stdout?.off('data', onData);
                resolve(parsed.result);
                return;
              }
              if (parsed.jsonrpc === '2.0' && 'error' in parsed) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', onData);
                reject(new Error(`MCP error: ${JSON.stringify(parsed.error)}`));
                return;
              }
            } catch {
              /* keep collecting */
            }
          }
        }
      };
      serverProcess.stdout?.on('data', onData);
      serverProcess.stdin?.write(requestStr);
    });
  }

  // assertFieldPersisted ClientLike adapter: tools/call → parsed StandardResponseV2.
  const client = {
    callTool: async (name: string, args: unknown) => {
      const result = await sendRequest({
        jsonrpc: '2.0',
        id: ++nextId,
        method: 'tools/call',
        params: { name, arguments: args },
      });
      const content = (result as { content: Array<{ text: string }> }).content;
      return JSON.parse(content[0].text);
    },
  };

  function extractId(res: any): string {
    const d = res.data ?? {};
    const id = d.task?.id ?? d.task?.taskId ?? d.taskId ?? d.project?.id ?? d.project?.projectId ?? d.projectId ?? d.id;
    expect(id, `created entity id (response: ${JSON.stringify(d).slice(0, 300)})`).toBeTruthy();
    return id as string;
  }

  async function createTask(data: Record<string, unknown>): Promise<string> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'create', target: 'task', data: { name: RT_TASK_NAME, ...data } },
    });
    expectOk(res, `create task (${JSON.stringify(data).slice(0, 120)})`);
    const id = extractId(res);
    createdTaskIds.push(id);
    return id;
  }

  async function createProject(data: Record<string, unknown>): Promise<string> {
    const res = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'project',
        data: { name: RT_TASK_NAME, folder: SANDBOX_FOLDER_NAME, ...data },
      },
    });
    expectOk(res, `create project (${JSON.stringify(data).slice(0, 120)})`);
    const id = extractId(res);
    createdProjectIds.push(id);
    return id;
  }

  async function updateTask(id: string, changes: Record<string, unknown>): Promise<void> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'update', target: 'task', id, changes },
    });
    expectOk(res, `update task ${id} (${JSON.stringify(changes).slice(0, 120)})`);
  }

  async function updateProject(id: string, changes: Record<string, unknown>): Promise<void> {
    const res = await client.callTool('omnifocus_write', {
      mutation: { operation: 'update', target: 'project', id, changes },
    });
    expectOk(res, `update project ${id} (${JSON.stringify(changes).slice(0, 120)})`);
  }

  // Independent read-back queries. Tasks: exact-id lookup. Projects: scope to
  // the sandbox folder then find by id (proven OMN-60 pattern).
  const taskQuery = (id: string, fields: string[]) => ({
    query: { type: 'tasks', filters: { id }, fields: ['id', ...fields] },
  });
  // Scope projects to a folder, then find by id. Defaults to the sandbox
  // root; the folder-move test overrides it with the DESTINATION folder —
  // reading back from the source folder is a confounded oracle (a successful
  // move relocates the project out of the source-folder filter).
  const projectQuery = (fields: string[], folder: string = SANDBOX_FOLDER_NAME) => ({
    query: { type: 'projects', filters: { folder }, fields: ['id', ...fields] },
  });
  const findTask = (r: any, id: string): any => (r.data?.tasks ?? r.data?.items ?? []).find((t: any) => t.id === id);
  const findProject = (r: any, id: string): any =>
    (r.data?.projects ?? r.data?.items ?? []).find((p: any) => p.id === id);

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    serverProcess = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    });
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    for (const id of createdTaskIds) {
      try {
        await client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'task', id } });
      } catch {
        /* best-effort */
      }
    }
    for (const id of createdProjectIds) {
      try {
        await client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'project', id } });
      } catch {
        /* best-effort */
      }
    }
    serverProcess?.kill();
    // OMN-46 fixture-leak guard. The targeted deletes above miss two things:
    // the destination subfolder created by the folder-move test (no per-id
    // folder delete in the write schema) and any entity orphaned by a failed
    // delete. fullCleanup() (osascript-driven, no server needed) sweeps the
    // whole sandbox — projects, subfolders, tags — and reports per-item
    // failures in `errors`. Assert OUTSIDE any try/catch so a real leak fails
    // the suite loud instead of being swallowed.
    const report = await fullCleanup();
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
  }, 120000);

  // ── Task scalar fields ────────────────────────────────────────────────
  // One row per settable+readable scalar. `op` picks the most representative
  // write path; relational moves and clears are handled separately below.
  interface ScalarRow {
    field: string;
    op: 'create' | 'update';
    setValue: unknown;
    readFields: string[];
    extract: (entity: any) => unknown;
    expected: unknown;
  }

  const taskRows: ScalarRow[] = [
    {
      field: 'name',
      op: 'update',
      setValue: RT_TASK_RENAMED,
      readFields: ['name'],
      extract: (t) => t?.name,
      expected: RT_TASK_RENAMED,
    },
    {
      field: 'note',
      op: 'create',
      setValue: `rt-note-${TS}`,
      readFields: ['note'],
      extract: (t) => t?.note,
      expected: `rt-note-${TS}`,
    },
    {
      field: 'flagged',
      op: 'create',
      setValue: true,
      readFields: ['flagged'],
      extract: (t) => t?.flagged,
      expected: true,
    },
    {
      field: 'dueDate',
      op: 'create',
      setValue: TEST_DATETIME,
      readFields: ['dueDate'],
      extract: (t) => (t?.dueDate ? new Date(t.dueDate).getTime() : t?.dueDate),
      expected: TEST_DATETIME_EPOCH,
    },
    {
      field: 'deferDate',
      op: 'create',
      setValue: TEST_DATETIME,
      readFields: ['deferDate'],
      extract: (t) => (t?.deferDate ? new Date(t.deferDate).getTime() : t?.deferDate),
      expected: TEST_DATETIME_EPOCH,
    },
    {
      field: 'plannedDate',
      op: 'create',
      setValue: TEST_DATETIME,
      readFields: ['plannedDate'],
      extract: (t) => (t?.plannedDate ? new Date(t.plannedDate).getTime() : t?.plannedDate),
      expected: TEST_DATETIME_EPOCH,
    },
    {
      field: 'estimatedMinutes',
      op: 'create',
      setValue: 37,
      readFields: ['estimatedMinutes'],
      extract: (t) => t?.estimatedMinutes,
      expected: 37,
    },
    {
      // Bridge-applied — high silent-fail risk (the exact class OMN-61 exists for).
      field: 'tags',
      op: 'create',
      setValue: [RT_TAG],
      readFields: ['tags'],
      extract: (t) => t?.tags,
      expected: [RT_TAG],
    },
    {
      // Bridge-applied — read shape is {ruleString,...}, NOT the write shape.
      // Normalized oracle: assert the persisted rule encodes WEEKLY.
      field: 'repetitionRule',
      op: 'create',
      setValue: { frequency: 'weekly', interval: 1 },
      readFields: ['repetitionRule'],
      extract: (t) => /WEEKLY/i.test(t?.repetitionRule?.ruleString ?? ''),
      expected: true,
    },
    {
      // OMN-207: the task-side read parity this PR exists for. The project-side
      // sequential round-trip lives in projectRows below; a childless task can
      // carry `sequential: true` (OmniFocus persists the flag across leaf↔group
      // transitions), so this exercises the live OmniJS task.sequential read.
      field: 'sequential',
      op: 'create',
      setValue: true,
      readFields: ['sequential'],
      extract: (t) => t?.sequential,
      expected: true,
    },
  ];

  describe('task scalar fields', () => {
    it.each(taskRows)(
      'task.$field ($op) persists and reads back',
      async (row) => {
        let id: string;
        if (row.op === 'create') {
          id = await createTask({ [row.field]: row.setValue });
        } else {
          id = await createTask({});
          await updateTask(id, { [row.field]: row.setValue });
        }
        await assertFieldPersisted(client, {
          readTool: 'omnifocus_read',
          readParams: taskQuery(id, row.readFields),
          extract: (r) => row.extract(findTask(r, id)),
          expected: row.expected,
          context: `task.${row.field} (${row.op})`,
        });
      },
      120000,
    );
  });

  // ── Project scalar fields ─────────────────────────────────────────────
  const projectRows: ScalarRow[] = [
    {
      field: 'name',
      op: 'update',
      setValue: RT_PROJ_RENAMED,
      readFields: ['name'],
      extract: (p) => p?.name,
      expected: RT_PROJ_RENAMED,
    },
    {
      field: 'note',
      op: 'create',
      setValue: `rt-pnote-${TS}`,
      readFields: ['note'],
      extract: (p) => p?.note,
      expected: `rt-pnote-${TS}`,
    },
    {
      field: 'flagged',
      op: 'create',
      setValue: true,
      readFields: ['flagged'],
      extract: (p) => p?.flagged,
      expected: true,
    },
    {
      field: 'dueDate',
      op: 'create',
      setValue: TEST_DATETIME,
      readFields: ['dueDate'],
      extract: (p) => (p?.dueDate ? new Date(p.dueDate).getTime() : p?.dueDate),
      expected: TEST_DATETIME_EPOCH,
    },
    {
      field: 'deferDate',
      op: 'create',
      setValue: TEST_DATETIME,
      readFields: ['deferDate'],
      extract: (p) => (p?.deferDate ? new Date(p.deferDate).getTime() : p?.deferDate),
      expected: TEST_DATETIME_EPOCH,
    },
    {
      // Transport enum `on_hold` → projection vocab `on-hold` (hyphen). The
      // expected value is the PROJECTION form, not the input form.
      field: 'status',
      op: 'update',
      setValue: 'on_hold',
      readFields: ['status'],
      extract: (p) => p?.status,
      expected: 'on-hold',
    },
    {
      field: 'sequential',
      op: 'create',
      setValue: true,
      readFields: ['sequential'],
      extract: (p) => p?.sequential,
      expected: true,
    },
    {
      // OMN-60 canonical case, here via the public write tool's update path
      // (the existing review-interval-round-trip.test.ts covers the analyze
      // set_schedule path). Non-default: default review interval is {weeks,2}.
      field: 'reviewInterval',
      op: 'update',
      setValue: { unit: 'month', steps: 5 },
      readFields: ['reviewInterval'],
      extract: (p) => p?.reviewInterval?.steps,
      expected: 5,
    },
    {
      // OMN-62: was an it.fails read-gap (settable via CreateDataSchema but
      // absent from ProjectFieldEnum/projection). Now a genuine round-trip.
      // Bridge-applied like task tags — high silent-fail risk. Normalized
      // oracle: name-array (project.tags.map(t => t.name)).
      field: 'tags',
      op: 'create',
      setValue: [RT_TAG],
      readFields: ['tags'],
      extract: (p) => p?.tags,
      expected: [RT_TAG],
    },
    {
      // OMN-62: was an it.fails read-gap. OF 4.7+ planned date; accessor
      // verified live via raw OmniJS probe. Epoch-normalized oracle.
      field: 'plannedDate',
      op: 'create',
      setValue: TEST_DATETIME,
      readFields: ['plannedDate'],
      extract: (p) => (p?.plannedDate ? new Date(p.plannedDate).getTime() : p?.plannedDate),
      expected: TEST_DATETIME_EPOCH,
    },
  ];

  describe('project scalar fields', () => {
    it.each(projectRows)(
      'project.$field ($op) persists and reads back',
      async (row) => {
        let id: string;
        if (row.op === 'create') {
          id = await createProject({ [row.field]: row.setValue });
        } else {
          id = await createProject({});
          await updateProject(id, { [row.field]: row.setValue });
        }
        await assertFieldPersisted(client, {
          readTool: 'omnifocus_read',
          readParams: projectQuery(row.readFields),
          extract: (r) => row.extract(findProject(r, id)),
          expected: row.expected,
          context: `project.${row.field} (${row.op})`,
        });
      },
      120000,
    );
  });

  // ── OMN-225: id-lookup read-back must not require `id` in `fields` ──────
  // The canonical "read back exactly this one task" path is filters:{id}. Its
  // guard (executeIdLookup/executeProjectIdLookup) verifies the returned row's
  // id BEFORE the final projection re-adds id, so when the caller's `fields`
  // omit "id" the script projected no id and the guard mis-fired ID_MISMATCH —
  // for ANY id, fresh or long-existing. (The bug was misattributed to
  // freshly-created ids only because the failing repro also dropped id from
  // `fields`.) NOTE: this block reads back with fields that OMIT id on purpose —
  // it must NOT use taskQuery()/projectQuery(), which prepend 'id' and thereby
  // hide exactly this defect.
  describe('OMN-225: id-lookup read-back with id-omitting fields', () => {
    it('task id-lookup succeeds (no ID_MISMATCH) when fields omit id, right after create', async () => {
      const taskId = await createTask({ sequential: true });
      const res = await client.callTool('omnifocus_read', {
        query: { type: 'tasks', filters: { id: taskId }, fields: ['name', 'sequential'] },
      });
      expectOk(res, 'task id-lookup with fields omitting id');
      const row = (res.data?.tasks ?? res.data?.items ?? [])[0];
      // Even though the caller asked only for name+sequential, the row carries id
      // (projectFields always re-adds it) and it matches the created id.
      expect(row?.id, `id-lookup row id (response: ${JSON.stringify(res).slice(0, 300)})`).toBe(taskId);
      expect(row?.sequential).toBe(true);
    }, 120000);

    it('project id-lookup succeeds (no ID_MISMATCH) when fields omit id', async () => {
      const projId = await createProject({});
      const res = await client.callTool('omnifocus_read', {
        query: { type: 'projects', filters: { id: projId }, fields: ['name', 'status'] },
      });
      expectOk(res, 'project id-lookup with fields omitting id');
      const row = (res.data?.projects ?? res.data?.items ?? [])[0];
      expect(row?.id, `id-lookup row id (response: ${JSON.stringify(res).slice(0, 300)})`).toBe(projId);
    }, 120000);
  });

  // ── Relational fields (need extra sandbox entities) ───────────────────
  describe('relational fields', () => {
    it('task.project move persists (projectId reads back the new project)', async () => {
      const projA = await createProject({ name: RT_PROJ_A_NAME });
      const projB = await createProject({ name: RT_PROJ_B_NAME });
      const taskId = await createTask({ project: projA });
      await updateTask(taskId, { project: projB });
      await assertFieldPersisted(client, {
        readTool: 'omnifocus_read',
        readParams: taskQuery(taskId, ['projectId']),
        extract: (r) => findTask(r, taskId)?.projectId,
        expected: projB,
        context: 'task.project move → projectId',
      });
    }, 120000);

    it('task.parentTaskId persists (subtask reads back its parent)', async () => {
      const parentId = await createTask({});
      const childId = await createTask({});
      await updateTask(childId, { parentTaskId: parentId });
      await assertFieldPersisted(client, {
        readTool: 'omnifocus_read',
        readParams: taskQuery(childId, ['parentTaskId']),
        extract: (r) => findTask(r, childId)?.parentTaskId,
        expected: parentId,
        context: 'task.parentTaskId',
      });
    }, 120000);

    it('project.folder move persists (folder reads back the new sandbox subfolder)', async () => {
      const subRes = await client.callTool('omnifocus_write', {
        mutation: {
          operation: 'create_folder',
          data: { name: RT_SUBFOLDER_NAME, parentFolder: SANDBOX_FOLDER_NAME },
        },
      });
      expectOk(subRes, 'create sandbox subfolder');
      const projId = await createProject({});
      await updateProject(projId, { folder: RT_SUBFOLDER_NAME });
      // Read back from the DESTINATION folder: if the move persisted the
      // project is here with folder == subfolder; if it silently no-op'd the
      // project is still in the sandbox root and absent here → undefined →
      // fails (correctly signaling non-persistence). Honest in both directions.
      await assertFieldPersisted(client, {
        readTool: 'omnifocus_read',
        readParams: projectQuery(['folder'], RT_SUBFOLDER_NAME),
        extract: (r) => findProject(r, projId)?.folder,
        expected: RT_SUBFOLDER_NAME,
        context: 'project.folder move (read back from destination folder)',
      });
    }, 120000);
  });

  // ── Two-phase clear* fields ───────────────────────────────────────────
  // A single read returning null cannot distinguish "cleared" from "field
  // never in the projection". Phase 1 (set + verify PRESENT) is the
  // disambiguator; only then does Phase 2 (clear + verify NULL) prove the
  // clear fired. A set phase that already reads back undefined is a read gap.
  describe('two-phase clear* fields', () => {
    interface ClearRow {
      clearOp: string;
      setField: string;
      setValue: unknown;
      readField: string;
      // normalize the present-phase read for the "is it visible" check
      present: (t: any) => unknown;
      presentExpected: unknown;
    }
    const clearRows: ClearRow[] = [
      {
        clearOp: 'clearDueDate',
        setField: 'dueDate',
        setValue: TEST_DATETIME,
        readField: 'dueDate',
        present: (t) => (t?.dueDate ? new Date(t.dueDate).getTime() : t?.dueDate),
        presentExpected: TEST_DATETIME_EPOCH,
      },
      {
        clearOp: 'clearDeferDate',
        setField: 'deferDate',
        setValue: TEST_DATETIME,
        readField: 'deferDate',
        present: (t) => (t?.deferDate ? new Date(t.deferDate).getTime() : t?.deferDate),
        presentExpected: TEST_DATETIME_EPOCH,
      },
      {
        clearOp: 'clearPlannedDate',
        setField: 'plannedDate',
        setValue: TEST_DATETIME,
        readField: 'plannedDate',
        present: (t) => (t?.plannedDate ? new Date(t.plannedDate).getTime() : t?.plannedDate),
        presentExpected: TEST_DATETIME_EPOCH,
      },
      {
        clearOp: 'clearEstimatedMinutes',
        setField: 'estimatedMinutes',
        setValue: 37,
        readField: 'estimatedMinutes',
        present: (t) => t?.estimatedMinutes,
        presentExpected: 37,
      },
    ];

    it.each(clearRows)(
      '$clearOp: set→verify-present→clear→verify-null',
      async (row) => {
        const id = await createTask({ [row.setField]: row.setValue });
        // Phase 1: prove the field is visible in the projection.
        await assertFieldPersisted(client, {
          readTool: 'omnifocus_read',
          readParams: taskQuery(id, [row.readField]),
          extract: (r) => row.present(findTask(r, id)),
          expected: row.presentExpected,
          context: `${row.clearOp} set phase (field must be visible to disambiguate null)`,
        });
        // Phase 2: clear, then the same field must read back null.
        await updateTask(id, { [row.clearOp]: true });
        await assertFieldPersisted(client, {
          readTool: 'omnifocus_read',
          readParams: taskQuery(id, [row.readField]),
          extract: (r) => findTask(r, id)?.[row.readField] ?? null,
          expected: null,
          context: `${row.clearOp} clear phase`,
        });
      },
      120000,
    );
  });

  // ── OMN-62 RESOLVED ───────────────────────────────────────────────────
  // project.tags and project.plannedDate were settable via the shared
  // CreateDataSchema but absent from ProjectFieldEnum /
  // generateProjectFieldProjection (the OMN-60 shape). OMN-62 added both to
  // the enum + projection + inputSchema; they are now genuine round-trip
  // rows in `projectRows` above. The former it.fails xfail placeholders are
  // intentionally gone — keeping them would silently never exercise the
  // now-working path (a vacuous green).
});
