import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildBatchCreateTasksProgram,
  dispatchMutation,
  type BatchCreateTasksData,
} from '../../../../../src/contracts/ast/mutation/defs.js';
import { validateMutationProgram } from '../../../../../src/contracts/ast/mutation/validator.js';
import { emitProgram } from '../../../../../src/contracts/ast/mutation/emitter.js';
import type { BatchTaskSpec } from '../../../../../src/contracts/ast/mutation-script-builder.js';
import { BatchCreateResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
import { expectMatchesSchema } from './assert-schema.js';

// These tests work at the PROGRAM level (buildBatchCreateTasksProgram →
// emitProgram), pre-launcher, so no extractOmniJsProgram decoding is needed —
// the launcher-shape assertions live in mutation-script-builder.test.ts
// (where the sibling extractOmniJsProgram helper does the decoding; shared-util
// consolidation is Task 11).

const build = (specs: BatchTaskSpec[], stopOnError?: boolean): ReturnType<typeof buildBatchCreateTasksProgram> =>
  buildBatchCreateTasksProgram({ specs, stopOnError } as BatchCreateTasksData);

/**
 * vm sandbox with stubbed OmniFocus globals (mirrors create-task.test.ts).
 * Records every Task construction (names + instances, in order) and every
 * moveTasks call so tests can assert identity, not just success flags.
 */
function makeSandbox(
  opts: {
    /** addTag throws for tasks with this name (per-item best-effort failure). */
    addTagThrowsForName?: string;
    /** Task.byIdentifier returns { ending: <value> } for these ids. */
    parentTasksById?: Record<string, { ending: unknown }>;
    /** moveTasks throws when its destination === this marker. */
    moveThrowsForEnding?: unknown;
  } = {},
): {
  sandbox: Record<string, unknown>;
  taskCalls: string[];
  taskInstances: Array<Record<string, unknown>>;
  moveCalls: unknown[][];
} {
  const taskCalls: string[] = [];
  const taskInstances: Array<Record<string, unknown>> = [];
  const moveCalls: unknown[][] = [];
  const TaskStub = function (this: Record<string, unknown>, name: string) {
    taskCalls.push(name);
    this.id = { primaryKey: `id-${taskInstances.length}` };
    this.name = name;
    this.inInbox = false;
    this.ending = { endingOf: name }; // unique per instance — identity-assertable
    this.addTag = (): void => {
      if (opts.addTagThrowsForName === name) throw new Error('addTag boom');
    };
    taskInstances.push(this);
  } as unknown as Record<string, unknown>;
  TaskStub.byIdentifier = (id: string): unknown => opts.parentTasksById?.[id] ?? null;

  const sandbox: Record<string, unknown> = {
    Task: TaskStub,
    Project: { byIdentifier: (): null => null },
    flattenedProjects: [],
    moveTasks: (...args: unknown[]): void => {
      if (opts.moveThrowsForEnding !== undefined && args[1] === opts.moveThrowsForEnding) {
        throw new Error('moveTasks boom');
      }
      moveCalls.push(args);
    },
    Tag: function (this: Record<string, unknown>, name: string) {
      this.name = name;
    },
    flattenedTags: [],
    tags: [],
  };
  return { sandbox, taskCalls, taskInstances, moveCalls };
}

function runBatch(program: string, sandbox: Record<string, unknown>): { results: Array<Record<string, unknown>> } {
  const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string) as {
    results: Array<Record<string, unknown>>;
  };
  // OMN-158 Task 4 (M1): every batch wire envelope — success-only AND partial-failure
  // mixes — is tied to BatchCreateResultSchema here, so the failure-item union branch
  // ({ taskId: null, success: false, error }) gets a mechanical drift guard too.
  expectMatchesSchema(BatchCreateResultSchema, parsed);
  return parsed;
}

describe('buildBatchCreateTasksProgram', () => {
  // Plan test 1: per-item name parameterization, no redeclaration.
  it('two specs: _t0/_t1 + appliedTags_0/appliedTags_1, two results.push pairs, no shared names', () => {
    const p = build([
      { tempId: 'a', name: 'First', tags: ['__test-a'] },
      { tempId: 'b', name: 'Second', tags: ['__test-b'] },
    ]);
    expect(() => validateMutationProgram(p)).not.toThrow();
    expect(p.context).toBe('batch_create_tasks');

    const out = emitProgram(p);
    expect(out).toContain('const results = [];');
    expect(out).toContain('var _t0 = new Task("First");');
    expect(out).toContain('var _t1 = new Task("Second");');
    expect(out).toContain('let appliedTags_0 = [];');
    expect(out).toContain('let appliedTags_1 = [];');
    // Parameterization left NO unsuffixed shared bindings behind.
    expect(out).not.toContain('let appliedTags = ');
    expect(out).not.toContain('var task = ');
    // One success + one failure push per item (the try/capture pair), twice.
    expect((out.match(/results\.push\(\{ tempId: "a"/g) || []).length).toBe(2);
    expect((out.match(/results\.push\(\{ tempId: "b"/g) || []).length).toBe(2);
    expect(out).toContain('return JSON.stringify({ results: results });');
  });

  // Plan test 2: parentTempId chain resolves at BUILD time; forward/missing refs throw at build time.
  it('parentTempId chain: tempIdRef container + moveTasks to the earlier item binding', () => {
    const p = build([
      { tempId: 'p1', name: 'Parent' },
      { tempId: 'c1', name: 'Child', parentTempId: 'p1' },
    ]);
    expect(() => validateMutationProgram(p)).not.toThrow();

    const item1 = p.statements[2] as { type: string; statements: Array<{ type: string; container?: unknown }> };
    expect(item1.type).toBe('batchItem');
    const ct = item1.statements.find((s) => s.type === 'constructTask') as { container: unknown };
    expect(ct.container).toEqual({ kind: 'tempIdRef', var: '_t0' });
    // The chained item's FIRST statement is the prepended pre-construct guard
    // (throw mode): a parent whose binding was invalidated at runtime fails
    // the child LOUD instead of letting it nest under a failed parent.
    expect(item1.statements[0]).toMatchObject({ type: 'guard', cond: '!_t0', mode: 'throw' });

    const out = emitProgram(p);
    expect(out).toContain('if (!_t0) throw new Error("Parent not created in batch: p1");');
    expect(out).toContain('moveTasks([_t1], _t0.ending);');
    // Every item's catch invalidates its hoisted binding for later chain consumers.
    expect(out).toContain('_t0 = undefined;');
    expect(out).toContain('_t1 = undefined;');
    // The legacy runtime map is gone — chains are wired at build time.
    expect(out).not.toContain('byTempId');
  });

  // OMN-206: sequential (action-group ordering) carries through the batch fast
  // path (buildBatchCreateTasksProgram → toTaskCreateData → lowerTaskCreate),
  // parity with the OMN-198 single-create fix. Was silently dropped because
  // BatchTaskSpec had no sequential field and toTaskCreateData never mapped it.
  it('sequential:true on a batch spec lowers to a setProp inside the item', () => {
    const p = build([{ tempId: 'g', name: 'Group', sequential: true }]);
    const item = p.statements[1] as { type: string; statements: Array<{ type: string; prop?: string }> };
    expect(item.type).toBe('batchItem');
    const seq = item.statements.find((s) => s.type === 'setProp' && s.prop === 'sequential');
    expect(seq).toBeDefined();
    expect(emitProgram(p)).toContain('sequential = true');
  });

  it('omits the sequential setProp on a batch spec when not provided', () => {
    const p = build([{ tempId: 'leaf', name: 'Leaf' }]);
    const item = p.statements[1] as { type: string; statements: Array<{ type: string; prop?: string }> };
    expect(item.statements.some((s) => s.type === 'setProp' && s.prop === 'sequential')).toBe(false);
  });

  it('duplicate tempId throws at build time', () => {
    expect(() =>
      build([
        { tempId: 'a', name: 'First' },
        { tempId: 'a', name: 'Shadow' },
      ]),
    ).toThrow('Duplicate tempId in batch: a');
  });

  it('FORWARD parentTempId reference throws at build time, naming tempId and item index', () => {
    expect(() =>
      build([
        { tempId: 'c1', name: 'Child', parentTempId: 'p1' },
        { tempId: 'p1', name: 'Parent' },
      ]),
    ).toThrow('parentTempId "p1" not created earlier in batch (item 0)');
  });

  it('MISSING parentTempId reference throws at build time, naming tempId and item index', () => {
    expect(() =>
      build([
        { tempId: 'a', name: 'First' },
        { tempId: 'b', name: 'Orphan', parentTempId: 'nope' },
      ]),
    ).toThrow('parentTempId "nope" not created earlier in batch (item 1)');
  });

  // Plan test 3: stopOnError scaffolding is emitted only when requested.
  it('stopOnError=true: emitProgram declares let _aborted = false and gates every item; false: neither', () => {
    const specs: BatchTaskSpec[] = [
      { tempId: 'a', name: 'First' },
      { tempId: 'b', name: 'Second' },
    ];

    const stop = emitProgram(build(specs, true));
    expect(stop).toContain('let _aborted = false;');
    expect((stop.match(/if \(!_aborted\) \{/g) || []).length).toBe(2); // every item gated

    const cont = emitProgram(build(specs, false));
    expect(cont).not.toContain('_aborted');
    expect(cont).not.toContain('if (!_aborted)');
  });

  // Carry-forward C: empty-string projectId → inbox (legacy-faithful truthy routing).
  it('empty-string projectId routes to inbox: no resolveProject, no guard, no moveTasks', () => {
    const p = build([{ tempId: 'a', name: 'X', projectId: '' }]);
    const item = p.statements[1] as { type: string; statements: Array<{ type: string; container?: unknown }> };
    expect(item.type).toBe('batchItem');
    expect(item.statements.some((s) => s.type === 'resolveProject')).toBe(false);
    const ct = item.statements.find((s) => s.type === 'constructTask') as { container: unknown };
    expect(ct.container).toEqual({ kind: 'inbox' });
    expect(p.snippetDeps).not.toContain('resolveProjectFlexible');
    expect(emitProgram(p)).not.toContain('moveTasks');
  });

  it('snippetDeps are the deduped union across items', () => {
    const p = build([
      { tempId: 'a', name: 'A', projectId: 'Work', tags: ['__test-a'] },
      { tempId: 'b', name: 'B', projectId: 'Home', tags: ['__test-b'] },
    ]);
    expect(p.snippetDeps).toEqual(['resolveProjectFlexible', 'resolveOrCreateTagByPath']);
  });

  // Representative programs satisfy ALL validator rules (uniqueness, throw-mode
  // inner guards, taskVar↔constructTask coupling, reserved identifiers).
  it('validateMutationProgram passes on representative batch programs', () => {
    const representative = [
      build([{ tempId: 'solo', name: 'Solo' }]),
      build(
        [
          { tempId: 'p', name: 'Parent', projectId: 'Work', tags: ['__test-a'] },
          { tempId: 'c', name: 'Child', parentTempId: 'p' },
          { tempId: 's', name: 'Sub', parentTaskId: 'real-id', estimatedMinutes: 30 },
        ],
        true,
      ),
    ];
    for (const program of representative) {
      expect(() => validateMutationProgram(program)).not.toThrow();
    }
  });
});

describe('emitted batch program executes (vm)', () => {
  // Plan test 4: per-item tag bindings coexist at runtime (the §2.4 collision fix).
  it('vm: 2-item batch with tags on both → both success:true with empty warnings', () => {
    const program = emitProgram(
      build([
        { tempId: 'a', name: 'W0', tags: ['__test-a'] },
        { tempId: 'b', name: 'W1', tags: ['__test-b'] },
      ]),
    );
    const { sandbox, taskCalls } = makeSandbox();
    const { results } = runBatch(program, sandbox);

    expect(results).toEqual([
      { tempId: 'a', taskId: 'id-0', success: true, warnings: [] },
      { tempId: 'b', taskId: 'id-1', success: true, warnings: [] },
    ]);
    expect(taskCalls).toEqual(['W0', 'W1']);
  });

  // Plan test 5 (carry-forward B): the chain executes END-TO-END — item 1's
  // moveTasks destination IS item 0's task object's .ending (identity, not just
  // success). Guards the cross-item `var`-hoist contract in constructTask: a
  // `const` bind inside item 0's try would be invisible to item 1.
  it('vm: 2-item parentTempId chain — child moves to the parent INSTANCE ending (identity)', () => {
    const program = emitProgram(
      build([
        { tempId: 'p1', name: 'Parent' },
        { tempId: 'c1', name: 'Child', parentTempId: 'p1' },
      ]),
    );
    const { sandbox, taskInstances, moveCalls } = makeSandbox();
    const { results } = runBatch(program, sandbox);

    expect(results.map((r) => r.success)).toEqual([true, true]);
    expect(moveCalls).toHaveLength(1);
    expect((moveCalls[0] as unknown[][])[0]).toEqual([taskInstances[1]]);
    // THE identity assertion: destination is item 0's task object's .ending.
    expect((moveCalls[0] as unknown[])[1]).toBe(taskInstances[0].ending);
  });

  // FAILED-parent chain (review fix): the parent CONSTRUCTS but then fails
  // (moveTasks throws, stopOnError=false). Without binding invalidation + the
  // child's pre-construct guard, the stale `var _t0` would let the child
  // silently nest under the failed parent while reporting success:true — the
  // silent-partial-failure class the legacy byTempId runtime check prevented.
  it('vm: parent constructs then FAILS — chained child fails loud and is never constructed', () => {
    const POISON = { marker: 'poison-ending' };
    const program = emitProgram(
      build(
        [
          { tempId: 'p1', name: 'Parent', parentTaskId: 'ext-parent' },
          { tempId: 'c1', name: 'Child', parentTempId: 'p1' },
        ],
        false,
      ),
    );
    const { sandbox, taskCalls } = makeSandbox({
      parentTasksById: { 'ext-parent': { ending: POISON } },
      moveThrowsForEnding: POISON,
    });
    const { results } = runBatch(program, sandbox);

    expect(results.map((r) => [r.tempId, r.success])).toEqual([
      ['p1', false],
      ['c1', false],
    ]);
    expect(results[1].error).toContain('Parent not created in batch: p1');
    expect(results[1].taskId).toBeNull();
    // The pre-construct guard runs BEFORE the child's constructTask: the child
    // Task is never even constructed (constructor spy, not just absent result).
    expect(taskCalls).toEqual(['Parent']);
  });

  // Plan test 6: middle item throws (moveTasks stubbed to throw for its container).
  it('vm: middle item fails, stopOnError=false → [ok, fail, ok]; all three constructed', () => {
    const POISON = { marker: 'poison-ending' };
    const program = emitProgram(
      build(
        [
          { tempId: 'a', name: 'First' },
          { tempId: 'b', name: 'Middle', parentTaskId: 'mid-parent' },
          { tempId: 'c', name: 'Last' },
        ],
        false,
      ),
    );
    const { sandbox, taskCalls } = makeSandbox({
      parentTasksById: { 'mid-parent': { ending: POISON } },
      moveThrowsForEnding: POISON,
    });
    const { results } = runBatch(program, sandbox);

    expect(results.map((r) => [r.tempId, r.success])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
    ]);
    expect(results[1].error).toBe('moveTasks boom');
    expect(results[1].taskId).toBeNull();
    expect(taskCalls).toEqual(['First', 'Middle', 'Last']);
  });

  it('vm: middle item fails, stopOnError=true → [ok, fail] ONLY and the third task is never CONSTRUCTED', () => {
    const POISON = { marker: 'poison-ending' };
    const program = emitProgram(
      build(
        [
          { tempId: 'a', name: 'First' },
          { tempId: 'b', name: 'Middle', parentTaskId: 'mid-parent' },
          { tempId: 'c', name: 'Last' },
        ],
        true,
      ),
    );
    const { sandbox, taskCalls } = makeSandbox({
      parentTasksById: { 'mid-parent': { ending: POISON } },
      moveThrowsForEnding: POISON,
    });
    const { results } = runBatch(program, sandbox);

    expect(results.map((r) => [r.tempId, r.success])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    // Not just absent from results: the Task constructor spy proves item 3
    // never even STARTED (the _aborted gate short-circuits the whole item).
    expect(taskCalls).toEqual(['First', 'Middle']);
  });

  // Plan test 7: per-item warnings isolation via the _w<i> watermark slices.
  it('vm: item 0 best-effort tag failure lands in item 0 warnings ONLY', () => {
    const program = emitProgram(
      build([
        { tempId: 'a', name: 'W0', tags: ['__test-a'] },
        { tempId: 'b', name: 'W1', tags: ['__test-b'] },
      ]),
    );
    const { sandbox } = makeSandbox({ addTagThrowsForName: 'W0' });
    const { results } = runBatch(program, sandbox);

    expect(results.map((r) => r.success)).toEqual([true, true]); // best-effort: creation still succeeds
    expect(results[0].warnings).toEqual(['tags: addTag boom']);
    expect(results[1].warnings).toEqual([]);
  });
});

// Plan test 8: the OMN-119/120 non-bypass property for the batch dispatch key,
// covering BOTH validateBatchTaskSpecs paths (full validateTaskCreate vs the
// transitive in-batch-parent tag-only check).
describe('dispatchMutation batch-create/tasks guard (OMN-119/120 non-bypass)', () => {
  async function withGuard(fn: () => Promise<void>): Promise<void> {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await fn();
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  }

  it('rejects a non-sandbox inbox spec when the sandbox guard is enabled', async () => {
    await withGuard(async () => {
      await expect(
        dispatchMutation('batch-create/tasks', { specs: [{ tempId: 'x', name: 'Not a sandbox task' }] }),
      ).rejects.toThrow(/TEST GUARD/);
    });
  });

  it('a parentTempId-chained spec skips container validation but still rejects a bad tag prefix', async () => {
    await withGuard(async () => {
      // Child name is NOT __TEST__-prefixed: only the transitive-parent path
      // can let it through, so the rejection being the TAG message proves the
      // container/name check was skipped AND the tag check still ran.
      await expect(
        dispatchMutation('batch-create/tasks', {
          specs: [
            { tempId: 'p', name: '__TEST__-parent' },
            { tempId: 'c', name: 'unscoped child', parentTempId: 'p', tags: ['real-tag'] },
          ],
        }),
      ).rejects.toThrow(/TEST GUARD: Tags must start with/);

      // Same chain with sandbox-prefixed tags passes (container check skipped).
      await expect(
        dispatchMutation('batch-create/tasks', {
          specs: [
            { tempId: 'p', name: '__TEST__-parent' },
            { tempId: 'c', name: 'unscoped child', parentTempId: 'p', tags: ['__test-ok'] },
          ],
        }),
      ).resolves.toBeDefined();
    });
  });
});
