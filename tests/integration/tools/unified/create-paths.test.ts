/**
 * OMN-138 (OMN-128 slice 2) — live create-path coverage for the OmniJS-native
 * mutation AST: single task create (all fields, in one program — repetition is
 * no longer a post-create helper call), the loud project-not-found guard, and
 * the batch parentTempId chain.
 *
 * Three behaviors the unit suite cannot prove (it mocks the osascript seam):
 *
 *   1. Single create round-trips EVERY settable field through real OmniFocus —
 *      and a clean create carries NO `warnings` (OMN-137 surfaces best-effort
 *      tag/repetition failures; absence on the happy path is part of the
 *      contract) and lands in the inbox (`inInbox: true`).
 *   2. Loud not-found: a create naming a nonexistent project ERRORS — and
 *      creates NOTHING. The legacy script silently fell through to the inbox
 *      (OMN-127 conflation in task form); the regression check is the
 *      zero-hits name search, not just the error envelope. Runs on a
 *      dedicated unguarded server — the OMN-46 sandbox guard's pre-flight
 *      masks the script-level not-found guard (see the test's comment).
 *   3. Batch parentTempId chain: parent → child → grandchild in one batch op,
 *      real ids for all three, and the parent relationship persisted (read
 *      back via parentTaskId, not the write response's own echo).
 *
 * Harness follows field-roundtrip.test.ts: own spawned server, run-scoped
 * `__TEST__` fixture names (OMN-84), per-id deletion in afterAll plus a
 * name-search straggler sweep and the osascript fullCleanup() residue
 * assertion (OMN-46) — integration round-trip tests have leaked inbox tasks
 * before when cleanup was folder-scoped only.
 *
 * Not a CI unit gate: mutates the real OmniFocus DB. Runs under
 * `npm run test:integration`, excluded from `test:unit`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { expectOk } from '../../helpers/expect-ok.js';
import { ensureSandboxFolder, fullCleanup } from '../../helpers/sandbox-manager.js';
import { RUN_NAME_PREFIX, runScopedName, runScopedTag } from '../../helpers/run-id.js';

// Fixed, unambiguous future datetimes (same rationale as field-roundtrip: not
// a default time, so reading it back can only mean we wrote it).
const DUE_DATETIME = '2026-12-25 14:23';
const DEFER_DATETIME = '2026-12-20 09:41';
const PLANNED_DATETIME = '2026-12-22 11:07';

const TS = Date.now();

// All fixture names carry the OMN-138 marker; runScopedName prepends the
// __TEST__-<runId>- prefix (OMN-84). The afterAll straggler sweep searches on
// SWEEP_MARKER = prefix + marker — run-scoped AND __TEST__-prefixed, so it can
// never match (and delete) a real user task that merely mentions "OMN-138".
// Cross-run __TEST__ residue is fullCleanup()'s job, not this sweep's.
const OMN138_MARKER = 'OMN-138';
const SWEEP_MARKER = `${RUN_NAME_PREFIX}${OMN138_MARKER}`;
const SINGLE_TASK_NAME = runScopedName(`${OMN138_MARKER}_single_${TS}`);
const NOTFOUND_TASK_NAME = runScopedName(`${OMN138_MARKER}_notfound_${TS}`);
const CHAIN_A_NAME = runScopedName(`${OMN138_MARKER}_chain-a_${TS}`);
const CHAIN_B_NAME = runScopedName(`${OMN138_MARKER}_chain-b_${TS}`);
const CHAIN_C_NAME = runScopedName(`${OMN138_MARKER}_chain-c_${TS}`);
const SINGLE_TAG = runScopedTag(`omn138-${TS}`);
const BOGUS_PROJECT = `__TEST__ Nonexistent Project ${OMN138_MARKER} ${TS}`;

describe('OMN-138: live create paths (single + loud not-found + batch chain)', () => {
  let serverProcess: ChildProcess;
  let nextId = 1;
  const createdTaskIds: string[] = [];

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

  /** Independent read-back: exact-id task lookup with an explicit projection. */
  async function readTaskById(id: string, fields: string[]): Promise<any> {
    const res = await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { id }, fields: ['id', ...fields] },
    });
    expectOk(res, `read task ${id}`);
    return tasksOf(res).find((t: any) => t.id === id);
  }

  /** Independent read-back: name-substring search (the zero-hits oracle). */
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

  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    serverProcess = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    await initializeServer(serverProcess);
    // Not strictly needed (all fixtures are inbox tasks) but keeps fullCleanup
    // uniform with the sibling suites that share this teardown path.
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    // 1. Delete every created artifact BY ID (children pushed before parents,
    //    so each per-id delete genuinely succeeds rather than riding cascade).
    for (const id of createdTaskIds) {
      try {
        await deleteTaskById(id);
      } catch {
        /* best-effort; the sweeps below catch anything missed */
      }
    }

    // 2. Belt-and-suspenders straggler sweep BY NAME while the server is
    //    still up: any task carrying this suite's run-scoped marker that
    //    survived the per-id deletes (error-path residue, failed delete) is
    //    hunted down. The defensive __TEST__ check should be unreachable
    //    (SWEEP_MARKER embeds the prefix) but guards against a filter bug
    //    ever turning this sweep on real data.
    // Capture a sweep failure instead of letting it propagate immediately:
    // "stragglers survived the sweep" is exactly the state where step 3's
    // whole-DB fullCleanup matters most, so it must run unconditionally;
    // the captured error is rethrown after, so the failure stays loud.
    let sweepError: unknown;
    try {
      const stragglers = await searchTasksByName(SWEEP_MARKER);
      for (const t of stragglers) {
        if (t?.id && typeof t.name === 'string' && t.name.startsWith('__TEST__')) await deleteTaskById(t.id);
      }
      const remaining = await searchTasksByName(SWEEP_MARKER);
      expect(remaining, `OMN-138 stragglers survived the sweep: ${JSON.stringify(remaining)}`).toHaveLength(0);
    } catch (e) {
      sweepError = e;
    } finally {
      serverProcess?.kill();
    }

    // 3. OMN-46 fixture-leak guard: osascript-driven whole-DB sweep of
    //    __TEST__/__test- residue (no server needed). Runs even when the
    //    name sweep failed; a real leak still fails the suite loud below.
    const report = await fullCleanup();
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
    if (sweepError !== undefined) throw sweepError;
  }, 120000);

  // ── 1. Single create: every field, one program, clean envelope ─────────
  it('single inbox create round-trips all fields, lands in inbox, no warnings', async () => {
    const createRes = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: SINGLE_TASK_NAME,
          note: `omn138-note-${TS}`,
          flagged: true,
          dueDate: DUE_DATETIME,
          deferDate: DEFER_DATETIME,
          plannedDate: PLANNED_DATETIME,
          estimatedMinutes: 42,
          tags: [SINGLE_TAG],
          repetitionRule: { frequency: 'weekly', interval: 1 },
        },
      },
    });
    expectOk(createRes, 'single all-fields create');

    const id = createRes.data?.id ?? createRes.data?.task?.taskId;
    expect(id, `created task id (response: ${JSON.stringify(createRes.data).slice(0, 300)})`).toBeTruthy();
    createdTaskIds.push(id);

    // Clean create: NO top-level warnings (OMN-137 lifts them only when a
    // best-effort step — tags, repetitionRule — actually degraded).
    expect(
      createRes.data.warnings,
      `unexpected create warnings: ${JSON.stringify(createRes.data.warnings)}`,
    ).toBeUndefined();
    // The create envelope itself reports inbox placement.
    expect(createRes.data.task?.inInbox).toBe(true);

    // Independent read-back — never trust the write response's own echo.
    const task = await readTaskById(id, [
      'name',
      'note',
      'flagged',
      'dueDate',
      'deferDate',
      'plannedDate',
      'estimatedMinutes',
      'tags',
      'repetitionRule',
      'inInbox',
    ]);
    expect(task, `task ${id} not found on read-back`).toBeTruthy();

    expect(task.name).toBe(SINGLE_TASK_NAME);
    expect(task.note).toBe(`omn138-note-${TS}`);
    expect(task.flagged).toBe(true);
    // Dates: projection serializes to ISO — normalize both sides to epoch
    // (same oracle as field-roundtrip; exact equality, no fuzz needed).
    expect(new Date(task.dueDate).getTime()).toBe(new Date(DUE_DATETIME).getTime());
    expect(new Date(task.deferDate).getTime()).toBe(new Date(DEFER_DATETIME).getTime());
    expect(new Date(task.plannedDate).getTime()).toBe(new Date(PLANNED_DATETIME).getTime());
    expect(task.estimatedMinutes).toBe(42);
    expect(task.tags).toEqual([SINGLE_TAG]);
    // Repetition read shape is {ruleString,...}: assert the persisted rule
    // encodes WEEKLY (the read projection's level of detail).
    expect(task.repetitionRule, 'repetition rule missing on read-back').toBeTruthy();
    expect(task.repetitionRule.ruleString ?? '').toMatch(/WEEKLY/i);
    expect(task.inInbox).toBe(true);
  }, 120000);

  // ── 2. Loud not-found: error AND nothing created ────────────────────────
  //
  // GUARD INTERACTION (OMN-46): the integration environment runs servers with
  // NODE_ENV=test + SANDBOX_GUARD_ENABLED=true (vitest sets NODE_ENV; importing
  // sandbox-manager sets the guard flag, inherited by spawned children). The
  // guard's pre-flight rejects ANY `data.project` it cannot resolve inside
  // __MCP_TEST_SANDBOX__ — a nonexistent project included — BEFORE the mutation
  // script runs, so the script-level loud-not-found guard is unreachable on a
  // guarded server. This test therefore spawns a dedicated UNGUARDED server for
  // its single create attempt (and kills it immediately after). Exposure is
  // bounded: correct behavior writes NOTHING; a regression writes one __TEST__
  // inbox task that the zero-hits assertion fails loud on and afterAll sweeps.
  // OMNIFOCUS_MCP_DISABLE_FAILURE_LOG keeps this deliberate failure out of the
  // real failure log (NODE_ENV is no longer 'test' here, so the env-based
  // suppression path is off).
  it('create with nonexistent project errors loudly and creates nothing (no silent inbox fallback)', async () => {
    const cleanupCountBefore = createdTaskIds.length;

    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'development',
      OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1',
    };
    delete env.SANDBOX_GUARD_ENABLED;
    const serverPath = path.join(__dirname, '../../../../dist/index.js');
    const unguarded = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'], env });

    let res: any;
    try {
      await initializeServer(unguarded);
      res = await callToolOn(unguarded, 'omnifocus_write', {
        mutation: {
          operation: 'create',
          target: 'task',
          data: { name: NOTFOUND_TASK_NAME, project: BOGUS_PROJECT },
        },
      });
    } finally {
      unguarded.kill();
    }

    expect(res.success, `expected error, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    expect(JSON.stringify(res.error)).toContain('Project not found');

    // The regression half: the legacy script silently created the task in the
    // inbox on a project miss. Search by the (unique, run-scoped) name and
    // require ZERO hits — nothing exists, so nothing needs cleanup. The search
    // runs on the main (guarded) server: reads are unrestricted.
    const hits = await searchTasksByName(NOTFOUND_TASK_NAME);
    expect(hits, `silent-fallback regression — task was created: ${JSON.stringify(hits)}`).toHaveLength(0);
    // Nothing was created → this test registered nothing for cleanup.
    expect(createdTaskIds).toHaveLength(cleanupCountBefore);
  }, 120000);

  // ── 3. Batch parentTempId chain ─────────────────────────────────────────
  it('batch creates a parent→child→grandchild chain via parentTempId with persisted parentage', async () => {
    const res = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'create', target: 'task', data: { tempId: 'omn138-a', name: CHAIN_A_NAME } },
          {
            operation: 'create',
            target: 'task',
            data: { tempId: 'omn138-b', name: CHAIN_B_NAME, parentTempId: 'omn138-a' },
          },
          {
            operation: 'create',
            target: 'task',
            data: { tempId: 'omn138-c', name: CHAIN_C_NAME, parentTempId: 'omn138-b' },
          },
        ],
        createSequentially: true,
        returnMapping: true,
        stopOnError: true,
      },
    });
    expectOk(res, 'batch parentTempId chain create');

    expect(res.data.summary.created).toBe(3);
    expect(res.data.summary.errors).toBe(0);

    const creates = (res.data.results ?? []).filter((r: any) => r.operation === 'create');
    expect(creates).toHaveLength(3);
    for (const item of creates) {
      expectOk(item, `batch item ${item.tempId}`);
      expect(item.id, `real id for ${item.tempId}`).toBeTruthy();
    }

    const mapping = res.data.tempIdMapping ?? {};
    const idA = mapping['omn138-a'];
    const idB = mapping['omn138-b'];
    const idC = mapping['omn138-c'];
    expect(idA, 'tempIdMapping omn138-a').toBeTruthy();
    expect(idB, 'tempIdMapping omn138-b').toBeTruthy();
    expect(idC, 'tempIdMapping omn138-c').toBeTruthy();
    expect(new Set([idA, idB, idC]).size).toBe(3);

    // Register for cleanup: children before parents so each per-id delete in
    // afterAll genuinely succeeds (instead of silently riding the parent's
    // cascade and "failing" on an already-gone id).
    createdTaskIds.push(idC, idB, idA);

    // Independent read-back of the chain: parentage must have PERSISTED, not
    // just been claimed by the write response.
    const childB = await readTaskById(idB, ['name', 'parentTaskId', 'parentTaskName']);
    expect(childB, `chain child ${idB} not found on read-back`).toBeTruthy();
    expect(childB.parentTaskId).toBe(idA);
    expect(childB.parentTaskName).toBe(CHAIN_A_NAME);

    const grandchildC = await readTaskById(idC, ['name', 'parentTaskId', 'parentTaskName']);
    expect(grandchildC, `chain grandchild ${idC} not found on read-back`).toBeTruthy();
    expect(grandchildC.parentTaskId).toBe(idB);
    expect(grandchildC.parentTaskName).toBe(CHAIN_B_NAME);
  }, 120000);
});
