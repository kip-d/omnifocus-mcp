/**
 * OMN-128 slice 6 (OMN-138 posture) — live coverage for the seven tag mutations
 * on the mutation AST: create (flat / under parent / ' : ' path), rename, nest,
 * unnest (unparent), reparent, merge, delete, plus the relocated sandbox-guard
 * refusal at the real tool seam. All paths route through dispatchMutation →
 * MUTATION_DEFS tag lowerings (buildCreateTagScript & co., slice 6) — the
 * template bodies and their nested-backtick islands are gone, so this file is
 * the "wiring tests pass, artifact broken" tripwire for the swap.
 *
 * CARDINAL RULE (slice-3 vacuous-parentage lesson): every assertion reads back
 * PERSISTED state via a follow-up read, never the write envelope's own echo.
 * Two read-back channels are used:
 *
 *   - Tool seam (omnifocus_read { type: 'tags' }): tag existence + id. The
 *     tags query runs in basic mode and returns {id, name, parentId} (OMN-145),
 *     so it CAN verify direct parent linkage via parentId. It does not expose
 *     parentName, so full hierarchy cross-checks (name of the parent) still
 *     require the osascript probe.
 *   - osascript hierarchy probe (probeTagByName): an independent OmniJS read
 *     of {id, name, parentId, parentName} straight off the live DB
 *     (tag.parent is OmniJS-only). Used wherever parentName or multi-hop
 *     hierarchy is the thing under test (create-under-parent, path chain,
 *     nest/unnest/reparent). Same pattern as sandbox-manager's executeJXA —
 *     fully independent of the server code under test.
 *
 * Envelope values (tagId, createdSegments, tasksMerged) are operation OUTPUTS,
 * not persisted-state echoes — they are asserted as such AND cross-checked
 * against the read-back where an oracle exists (tagId must equal the
 * read-back id: the OMN-27 JXA-id-mismatch class made unrepresentable by the
 * AST's live `_tag.id.primaryKey` read).
 *
 * GUARD INTERACTION (row 8): validateTagMutation (MUTATION_DEFS, spec §2.1) is
 * name-based and sync — in test mode every touched tag name must be `__test-`
 * prefixed. The guard throws inside dispatchMutation BEFORE any script is
 * built; the throw surfaces through BaseTool.handleErrorV2 as success:false
 * with 'TEST GUARD' in the error. Read-back confirms nothing was written.
 *
 * Harness mirrors complete-delete-paths.test.ts: own spawned (guarded) server,
 * run-scoped `__test-` tag fixtures + `__TEST__` task fixture (OMN-84),
 * per-name deletion in afterAll plus a tool-seam straggler sweep and the
 * osascript fullCleanup() residue assertion (OMN-46). Marker is 'OMN138T' —
 * deliberately not a substring superset of 'OMN138D'/'OMN138U' (nor vice
 * versa), so no suite's straggler sweep can match another's fixtures.
 *
 * Not a CI unit gate: mutates the real OmniFocus DB. Runs under
 * `npm run test:integration`, excluded from `test:unit`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { expectOk } from '../../helpers/expect-ok.js';
import { ensureSandboxFolder, fullCleanup } from '../../helpers/sandbox-manager.js';
import { RUN_NAME_PREFIX, RUN_TAG_PREFIX, runScopedName, runScopedTag } from '../../helpers/run-id.js';
import { UnifiedTestServer } from '../../helpers/unified-test-server.js';

const execFileAsync = promisify(execFile);

// OMN-147: every osascript spawn carries a child timeout so a TCC-wedged
// AppleEvent can't leave an orphaned osascript child that re-poisons later runs
// (vitest's hook timeout bounds the SUITE, not the abandoned child).
const OSASCRIPT_TIMEOUT_MS = 30_000;

const TS = Date.now();

// 'OMN138T' (tags) — must not contain 'OMN138D', 'OMN138U', or 'OMN-138'.
const MARKER = 'OMN138T';
const TASK_SWEEP_MARKER = `${RUN_NAME_PREFIX}${MARKER}`;
const TAG_SWEEP_MARKER = `${RUN_TAG_PREFIX}${MARKER}`;

// Tag fixtures (all `__test-<runId>-OMN138T-...` via runScopedTag).
const T_FLAT = runScopedTag(`${MARKER}-flat-${TS}`);
const T_PARENT = runScopedTag(`${MARKER}-parent-${TS}`);
const T_CHILD = runScopedTag(`${MARKER}-child-${TS}`);
// Path test: BOTH segments carry the __test- prefix so every tag the
// find-or-create walk constructs satisfies the OMN-83 cleanup contract.
const T_PATH_ROOT = runScopedTag(`${MARKER}-h-${TS}`);
const T_PATH_LEAF = runScopedTag(`${MARKER}-hsub-${TS}`);
const T_PATH = `${T_PATH_ROOT} : ${T_PATH_LEAF}`;
const T_REN_OLD = runScopedTag(`${MARKER}-renold-${TS}`);
const T_REN_NEW = runScopedTag(`${MARKER}-rennew-${TS}`);
const T_MOVE = runScopedTag(`${MARKER}-move-${TS}`);
const T_P1 = runScopedTag(`${MARKER}-p1-${TS}`);
const T_P2 = runScopedTag(`${MARKER}-p2-${TS}`);
const T_SRC = runScopedTag(`${MARKER}-mergesrc-${TS}`);
const T_TGT = runScopedTag(`${MARKER}-mergetgt-${TS}`);
const T_DEL = runScopedTag(`${MARKER}-del-${TS}`);

// Guard-refusal probe: NO __test- prefix (that is the point). Distinctive
// enough that the afterAll osascript safety-delete can never hit real data.
const UNPREFIXED_TAG = `${MARKER}-unprefixed-${TS}`;

// Merge carrier task (sandbox-legal via the __TEST__ name prefix).
const MERGE_TASK_NAME = runScopedName(`${MARKER}_mergecarrier_${TS}`);

interface TagProbe {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
}

/**
 * Independent persisted-state read: exact-name tag lookup with parent linkage,
 * via osascript → OmniJS (tag.parent is OmniJS-only; the read tool's basic
 * tags mode exposes no parent field). Returns null when absent; throws on
 * duplicate names (an ambiguous oracle would make every assertion vacuous).
 */
async function probeTagByName(tagName: string): Promise<TagProbe | null> {
  // Independent live-DB oracle — does NOT import tag-script-builder.ts.
  // The `p ? p.id.primaryKey : null` idiom below mirrors TAG_PARENT_ID_EXPR in
  // src/contracts/ast/tag-script-builder.ts. Keep the two in sync when the
  // OmniJS parent accessor changes.
  const omniJs = [
    '(() => {',
    `  const wanted = ${JSON.stringify(tagName)};`,
    '  const matches = [];',
    '  flattenedTags.forEach(tag => {',
    '    if (tag.name === wanted) {',
    '      const p = tag.parent;',
    '      matches.push({',
    '        id: tag.id.primaryKey,',
    '        name: tag.name,',
    '        parentId: p ? p.id.primaryKey : null,',
    '        parentName: p ? p.name : null,',
    '      });',
    '    }',
    '  });',
    '  return JSON.stringify(matches);',
    '})()',
  ].join('\n');
  const jxa = `(() => { const app = Application('OmniFocus'); return app.evaluateJavascript(${JSON.stringify(omniJs)}); })()`;
  const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', jxa], {
    timeout: OSASCRIPT_TIMEOUT_MS,
  });
  const matches = JSON.parse(stdout.trim()) as TagProbe[];
  if (matches.length > 1) {
    throw new Error(`probeTagByName('${tagName}'): ${matches.length} tags share this name — ambiguous oracle`);
  }
  return matches[0] ?? null;
}

/**
 * afterAll safety net for the guard-refusal probe ONLY: if the guard ever
 * regressed and wrote the unprefixed tag, neither the tool seam (the same
 * guard refuses the delete) nor fullCleanup (its sweep is __test- prefixed)
 * could remove it — it would become permanent residue in the real DB.
 * Exact-name match; no-op when absent.
 */
async function osascriptDeleteTagByExactName(tagName: string): Promise<void> {
  const omniJs = [
    '(() => {',
    `  const wanted = ${JSON.stringify(tagName)};`,
    '  let deleted = 0;',
    '  const matches = [];',
    '  flattenedTags.forEach(tag => { if (tag.name === wanted) { matches.push(tag); } });',
    '  matches.forEach(tag => { deleteObject(tag); deleted++; });',
    '  return JSON.stringify({ deleted });',
    '})()',
  ].join('\n');
  const jxa = `(() => { const app = Application('OmniFocus'); return app.evaluateJavascript(${JSON.stringify(omniJs)}); })()`;
  await execFileAsync('osascript', ['-l', 'JavaScript', '-e', jxa], { timeout: OSASCRIPT_TIMEOUT_MS });
}

describe('OMN-128 slice 6: live tag mutation paths (AST lowerings, persisted read-backs)', () => {
  let server: UnifiedTestServer;
  const createdTaskIds: string[] = [];
  // Tag fixtures to delete in afterAll (names; tag_manage delete is by name).
  const createdTagNames: string[] = [];

  // Thin adapter so the existing `client.callTool(...)` callsites stay intact;
  // reads `server` at call time (assigned in beforeAll). See
  // helpers/unified-test-server.ts for the spawn/JSON-RPC scaffolding.
  const client = {
    callTool: (name: string, args: unknown) => server.callTool(name, args),
  };

  const tasksOf = (r: any): any[] => r.data?.tasks ?? r.data?.items ?? [];
  const tagsOf = (r: any): any[] => r.data?.tags ?? r.data?.items ?? [];

  /** Tool-seam tag_manage call. Returns the raw tool response. */
  async function tagManage(args: Record<string, unknown>): Promise<any> {
    return client.callTool('omnifocus_write', {
      mutation: { operation: 'tag_manage', ...args },
    });
  }

  /** Script-envelope accessor: handleTagManage nests the AST return_ payload
   *  under data.result. */
  const scriptEnvelopeOf = (res: any): any => res.data?.result ?? {};

  /** Create a tag through the real tool seam and register it for teardown. */
  async function createTag(tagName: string, parentTag?: string): Promise<any> {
    const res = await tagManage({ action: 'create', tagName, ...(parentTag && { parentTag }) });
    expectOk(res, `create tag ${tagName}`);
    createdTagNames.push(tagName);
    return scriptEnvelopeOf(res);
  }

  /** Tool-seam read-back: full tags list ({id, name, parentId} per tag, basic mode). */
  async function readTags(): Promise<Array<{ id: string; name: string; parentId: string | null }>> {
    const res = await client.callTool('omnifocus_read', { query: { type: 'tags' } });
    expectOk(res, 'tags list read-back');
    return tagsOf(res);
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

  async function deleteTaskById(id: string): Promise<any> {
    return client.callTool('omnifocus_write', { mutation: { operation: 'delete', target: 'task', id } });
  }

  /** Read-back: task by id (active filter — fixtures here are never completed). */
  async function readTaskById(id: string, fields: string[]): Promise<any> {
    const res = await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { id }, fields: ['id', ...fields] },
    });
    expectOk(res, `read task ${id}`);
    const task = tasksOf(res).find((t: any) => t.id === id);
    expect(task, `task ${id} not found on read-back`).toBeTruthy();
    return task;
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
    let sweepError: unknown;
    try {
      // 1. Delete the merge carrier task BEFORE the tags — a tag that still
      //    has tasks can fail deletion (see sandbox-manager's deleteTestTags).
      for (const id of createdTaskIds) {
        try {
          await deleteTaskById(id);
        } catch {
          /* best-effort; sweeps below catch anything missed */
        }
      }

      // 2. Delete every created tag BY NAME through the tool seam. Failures
      //    tolerated (e.g. a parent's cascade already removed a child, or a
      //    test failed before creating it).
      for (const tagName of createdTagNames) {
        try {
          await tagManage({ action: 'delete', tagName });
        } catch {
          /* best-effort */
        }
      }

      // 3. Straggler sweeps while the server is still up: tags by run-scoped
      //    marker prefix, tasks by run-scoped marker name.
      const tagStragglers = (await readTags()).filter((t) => t.name.startsWith(TAG_SWEEP_MARKER));
      for (const t of tagStragglers) {
        try {
          await tagManage({ action: 'delete', tagName: t.name });
        } catch {
          /* best-effort */
        }
      }
      const remainingTags = (await readTags()).filter((t) => t.name.startsWith(TAG_SWEEP_MARKER));
      expect(remainingTags, `OMN138T tag stragglers survived the sweep: ${JSON.stringify(remainingTags)}`).toHaveLength(
        0,
      );

      const taskStragglers = await searchTasksByName(TASK_SWEEP_MARKER);
      for (const t of taskStragglers) {
        if (t?.id && typeof t.name === 'string' && t.name.startsWith('__TEST__')) await deleteTaskById(t.id);
      }
      const remainingTasks = await searchTasksByName(TASK_SWEEP_MARKER);
      expect(
        remainingTasks,
        `OMN138T task stragglers survived the sweep: ${JSON.stringify(remainingTasks)}`,
      ).toHaveLength(0);
    } catch (e) {
      sweepError = e;
    } finally {
      server?.kill();
    }

    // 4. Guard-regression residue: the unprefixed probe tag is invisible to
    //    every __test- scoped sweep — remove it directly if it ever got written.
    try {
      await osascriptDeleteTagByExactName(UNPREFIXED_TAG);
    } catch {
      /* best-effort */
    }

    // 5. OMN-46 fixture-leak guard: osascript-driven whole-DB sweep of
    //    __TEST__/__test- residue (no server needed).
    const report = await fullCleanup({ scope: 'full' });
    expect(report.errors, `sandbox cleanup errors (fixture leak): ${JSON.stringify(report.errors)}`).toHaveLength(0);
    if (sweepError !== undefined) throw sweepError;
  }, 180000);

  // ── 1. create flat ─────────────────────────────────────────────────────────
  it('create flat tag persists: read-back by name exists and the envelope tagId is the real persisted id', async () => {
    const env = await createTag(T_FLAT);

    // Envelope outputs (operation results, cross-checked against read-back below).
    expect(env.action).toBe('created');
    expect(env.tagId, `envelope tagId missing (envelope: ${JSON.stringify(env).slice(0, 300)})`).toBeTruthy();
    // The OMN-27 JXA bridge's 'unknown' sentinel must be unrepresentable on the AST path.
    expect(env.tagId).not.toBe('unknown');

    // Persisted read-back through the real tool seam.
    const found = (await readTags()).find((t) => t.name === T_FLAT);
    expect(found, `tag ${T_FLAT} not found on tool-seam read-back`).toBeTruthy();
    expect(found!.id, 'envelope tagId does not match the persisted id').toBe(env.tagId);
  }, 120000);

  // ── 2. create under parent ─────────────────────────────────────────────────
  it('create under parent persists the parent linkage (hierarchy probe parentId equals the parent real id)', async () => {
    const parentEnv = await createTag(T_PARENT);
    const childEnv = await createTag(T_CHILD, T_PARENT);

    // Parent's REAL id from its own persisted read-back (not the envelope).
    const parentReadBack = (await readTags()).find((t) => t.name === T_PARENT);
    expect(parentReadBack, `parent tag ${T_PARENT} not found on read-back`).toBeTruthy();
    expect(parentReadBack!.id).toBe(parentEnv.tagId);

    // Envelope cross-check: parentTagId is a live read off the resolved parent.
    expect(childEnv.parentTagId).toBe(parentReadBack!.id);

    // Persisted hierarchy: child's parentId in the live DB equals the parent's real id.
    const childProbe = await probeTagByName(T_CHILD);
    expect(childProbe, `tag ${T_CHILD} not found in hierarchy probe`).toBeTruthy();
    expect(childProbe!.parentId, 'persisted parent linkage wrong').toBe(parentReadBack!.id);
    expect(childProbe!.parentName).toBe(T_PARENT);
    expect(childProbe!.id).toBe(childEnv.tagId);
  }, 120000);

  // ── 3. create path (find-or-create walk) ───────────────────────────────────
  it("create path 'root : leaf' creates both segments (createdSegments 2 → 0 on repeat) with persisted chain", async () => {
    // First create: both segments new.
    const firstRes = await tagManage({ action: 'create', tagName: T_PATH });
    expectOk(firstRes, `create tag path ${T_PATH}`);
    createdTagNames.push(T_PATH_LEAF, T_PATH_ROOT); // leaf first: delete child before parent
    const firstEnv = scriptEnvelopeOf(firstRes);
    expect(firstEnv.action).toBe('created');
    expect(firstEnv.createdSegments, `createdSegments missing: ${JSON.stringify(firstEnv).slice(0, 300)}`).toHaveLength(
      2,
    );
    expect(firstEnv.tagId).toBeTruthy();
    expect(firstEnv.tagId).not.toBe('unknown');

    // Repeat: the already-exists success path — zero segments created.
    const repeatRes = await tagManage({ action: 'create', tagName: T_PATH });
    expectOk(repeatRes, `repeat create tag path ${T_PATH}`);
    const repeatEnv = scriptEnvelopeOf(repeatRes);
    expect(repeatEnv.createdSegments).toHaveLength(0);
    // Same persisted leaf both times.
    expect(repeatEnv.tagId).toBe(firstEnv.tagId);

    // Persisted chain: leaf's parent is the root; root sits at top level.
    const rootProbe = await probeTagByName(T_PATH_ROOT);
    const leafProbe = await probeTagByName(T_PATH_LEAF);
    expect(rootProbe, `path root ${T_PATH_ROOT} not persisted`).toBeTruthy();
    expect(leafProbe, `path leaf ${T_PATH_LEAF} not persisted`).toBeTruthy();
    expect(leafProbe!.parentId, 'leaf not parented under path root').toBe(rootProbe!.id);
    expect(rootProbe!.parentId, 'path root unexpectedly nested').toBeNull();
    expect(leafProbe!.id).toBe(firstEnv.tagId);
  }, 120000);

  // ── 4. rename ──────────────────────────────────────────────────────────────
  it('rename persists: old name gone, new name present (tool-seam read-back)', async () => {
    await createTag(T_REN_OLD);

    const renameRes = await tagManage({ action: 'rename', tagName: T_REN_OLD, newName: T_REN_NEW });
    expectOk(renameRes, `rename ${T_REN_OLD} -> ${T_REN_NEW}`);
    createdTagNames.push(T_REN_NEW);
    expect(scriptEnvelopeOf(renameRes).action).toBe('renamed');

    const tags = await readTags();
    expect(
      tags.find((t) => t.name === T_REN_OLD),
      `old name ${T_REN_OLD} still present after rename`,
    ).toBeUndefined();
    expect(
      tags.find((t) => t.name === T_REN_NEW),
      `new name ${T_REN_NEW} missing after rename`,
    ).toBeTruthy();
  }, 120000);

  // ── 5. nest → unnest → reparent lifecycle ──────────────────────────────────
  it('nest/unnest/reparent persist parent linkage at each step (hierarchy probe)', async () => {
    const moveEnv = await createTag(T_MOVE);
    const p1Env = await createTag(T_P1);
    const p2Env = await createTag(T_P2);

    // nest under P1
    const nestRes = await tagManage({ action: 'nest', tagName: T_MOVE, parentTag: T_P1 });
    expectOk(nestRes, `nest ${T_MOVE} under ${T_P1}`);
    expect(scriptEnvelopeOf(nestRes).action).toBe('nested');
    let probe = await probeTagByName(T_MOVE);
    expect(probe, `tag ${T_MOVE} vanished after nest`).toBeTruthy();
    expect(probe!.parentId, 'nest did not persist parent linkage').toBe(p1Env.tagId);
    expect(probe!.parentName).toBe(T_P1);

    // unnest (unified-API alias; maps to the unparent lowering) → root
    const unnestRes = await tagManage({ action: 'unnest', tagName: T_MOVE });
    expectOk(unnestRes, `unnest ${T_MOVE}`);
    expect(scriptEnvelopeOf(unnestRes).action).toBe('unparented');
    probe = await probeTagByName(T_MOVE);
    expect(probe, `tag ${T_MOVE} vanished after unnest`).toBeTruthy();
    expect(probe!.parentId, 'unnest did not persist root placement').toBeNull();

    // reparent under P2
    const reparentRes = await tagManage({ action: 'reparent', tagName: T_MOVE, parentTag: T_P2 });
    expectOk(reparentRes, `reparent ${T_MOVE} under ${T_P2}`);
    expect(scriptEnvelopeOf(reparentRes).action).toBe('reparented');
    probe = await probeTagByName(T_MOVE);
    expect(probe, `tag ${T_MOVE} vanished after reparent`).toBeTruthy();
    expect(probe!.parentId, 'reparent did not persist new parent linkage').toBe(p2Env.tagId);
    expect(probe!.parentName).toBe(T_P2);

    // The moved tag's identity never changed.
    expect(probe!.id).toBe(moveEnv.tagId);
  }, 180000);

  // ── 6. merge ───────────────────────────────────────────────────────────────
  it('merge retags the carrier task (target present, source gone) and deletes the source tag', async () => {
    await createTag(T_SRC);
    await createTag(T_TGT);
    const taskId = await createTask({ name: MERGE_TASK_NAME, tags: [T_SRC] });

    // Non-vacuity: the carrier really carries the source tag before the merge.
    const before = await readTaskById(taskId, ['name', 'tags']);
    expect(before.tags ?? [], `carrier task missing source tag pre-merge: ${JSON.stringify(before)}`).toContain(T_SRC);

    const mergeRes = await tagManage({ action: 'merge', tagName: T_SRC, targetTag: T_TGT });
    expectOk(mergeRes, `merge ${T_SRC} into ${T_TGT}`);
    const env = scriptEnvelopeOf(mergeRes);
    // 'merged' (not 'merged_with_warning'): the source delete must have succeeded.
    expect(env.action, `merge envelope: ${JSON.stringify(env).slice(0, 300)}`).toBe('merged');
    expect(env.tasksMerged, 'tasksMerged should count the carrier').toBeGreaterThanOrEqual(1);

    // Persisted: the task now carries target, not source.
    const after = await readTaskById(taskId, ['name', 'tags']);
    const afterTags: string[] = after.tags ?? [];
    expect(afterTags, 'carrier task does not carry the merge target').toContain(T_TGT);
    expect(afterTags, 'carrier task still carries the merge source').not.toContain(T_SRC);

    // Persisted: source tag is gone, target survives.
    const tags = await readTags();
    expect(
      tags.find((t) => t.name === T_SRC),
      `source tag ${T_SRC} survived the merge`,
    ).toBeUndefined();
    expect(
      tags.find((t) => t.name === T_TGT),
      `target tag ${T_TGT} missing after merge`,
    ).toBeTruthy();
  }, 180000);

  // ── 7. delete ──────────────────────────────────────────────────────────────
  it('delete removes the tag (tool-seam read-back)', async () => {
    await createTag(T_DEL);
    // Existence pre-check makes the absence assertion below non-vacuous.
    expect(
      (await readTags()).find((t) => t.name === T_DEL),
      `tag ${T_DEL} missing before delete`,
    ).toBeTruthy();

    const deleteRes = await tagManage({ action: 'delete', tagName: T_DEL });
    expectOk(deleteRes, `delete tag ${T_DEL}`);
    expect(scriptEnvelopeOf(deleteRes).action).toBe('deleted');

    expect(
      (await readTags()).find((t) => t.name === T_DEL),
      `tag ${T_DEL} still present after delete`,
    ).toBeUndefined();
  }, 120000);

  // ── 8. guard refusal ───────────────────────────────────────────────────────
  it('unprefixed tag name through the real tool seam is refused by the sandbox guard and writes nothing', async () => {
    const res = await tagManage({ action: 'create', tagName: UNPREFIXED_TAG });

    expect(res.success, `expected guard refusal, got: ${JSON.stringify(res).slice(0, 300)}`).toBe(false);
    const errText = JSON.stringify(res.error ?? res);
    expect(errText).toContain('TEST GUARD');

    // Read-back confirms NOTHING was written — both via the tool seam and the
    // independent hierarchy probe (the unprefixed name would be invisible to
    // the __test- scoped cleanup sweeps, so a leak here is permanent residue).
    expect(
      (await readTags()).find((t) => t.name === UNPREFIXED_TAG),
      'guard-refused tag appeared on tool-seam read-back',
    ).toBeUndefined();
    expect(await probeTagByName(UNPREFIXED_TAG), 'guard-refused tag persisted in the live DB').toBeNull();
  }, 120000);
});
