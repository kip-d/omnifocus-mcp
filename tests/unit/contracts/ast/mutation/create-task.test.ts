import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
// Imports go through the barrel deliberately — this file is the test that
// exercises the public surface of src/contracts/ast/mutation/index.ts.
import {
  buildCreateTaskProgram,
  lowerTaskCreate,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
  type TaskLoweringNames,
} from '../../../../../src/contracts/ast/mutation/index.js';
import type { TaskCreateData } from '../../../../../src/contracts/mutations.js';
import { TaskWriteResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
import { expectMatchesSchema } from './assert-schema.js';

/** A TaskCreateData exercising every field (project container variant). */
const FULL_FIELD_DATA: TaskCreateData = {
  name: 'Full',
  note: 'a note',
  project: 'Work',
  tags: ['__test-a'],
  dueDate: '2026-06-10 17:00',
  deferDate: '2026-06-10 08:00',
  plannedDate: '2026-06-11 12:00',
  flagged: true,
  sequential: true,
  estimatedMinutes: 30,
  repetitionRule: { frequency: 'weekly', interval: 1 },
};

describe('buildCreateTaskProgram', () => {
  // Case 1: inbox minimal
  it('inbox minimal: new Task only, no moveTasks, full envelope keys', () => {
    const p = buildCreateTaskProgram({ name: 'X' });
    expect(() => validateMutationProgram(p)).not.toThrow();

    const ct = p.statements.find((s) => s.type === 'constructTask') as any;
    expect(ct.bind).toBe('task');
    expect(ct.container).toEqual({ kind: 'inbox' });
    expect(p.statements.some((s) => s.type === 'resolveProject' || s.type === 'resolveTask')).toBe(false);

    const out = emitProgram(p);
    expect(out).toContain('new Task("X")');
    expect(out).not.toContain('moveTasks');

    const ret = p.statements.at(-1) as any;
    expect(ret.type).toBe('return');
    expect(Object.keys(ret.envelope)).toEqual(
      expect.arrayContaining([
        'taskId',
        'name',
        'note',
        'flagged',
        'dueDate',
        'deferDate',
        'plannedDate',
        'estimatedMinutes',
        'tags',
        'project',
        'inInbox',
        'warnings',
        'created',
      ]),
    );
    expect(ret.envelope.warnings).toEqual({ type: 'ref', name: '_warnings' });
    expect(p.context).toBe('create_task');
  });

  // Case 2: project by ref — the DELIBERATE behavior delta (spec §3.1.1): not-found
  // is LOUD (guard returns the error envelope) instead of the legacy silent inbox fall.
  it('project container: resolveProjectFlexible dep + loud return-mode guard + moveTasks to .ending', () => {
    const p = buildCreateTaskProgram({ name: 'X', project: 'Work' });
    expect(() => validateMutationProgram(p)).not.toThrow();
    expect(p.snippetDeps).toContain('resolveProjectFlexible');

    expect(p.statements[0].type).toBe('resolveProject');
    expect((p.statements[0] as any).bind).toBe('targetProject');
    const g = p.statements[1] as any;
    expect(g.type).toBe('guard');
    expect(g.mode).toBeUndefined(); // absent = return mode (single path)
    expect(g.cond).toContain('targetProject');

    const out = emitProgram(p);
    expect(out).toContain('if (targetProject === null) return JSON.stringify(');
    expect(out).toContain('"Project not found: Work"');
    expect(out).toContain('"create_task"');
    expect(out).toContain('moveTasks([task], targetProject.ending);');
  });

  // Case 3: parentTaskId container
  it('parentTaskId container: Task.byIdentifier + guard + move', () => {
    const p = buildCreateTaskProgram({ name: 'X', parentTaskId: 'abc123' });
    expect(() => validateMutationProgram(p)).not.toThrow();

    expect(p.statements[0].type).toBe('resolveTask');
    expect((p.statements[0] as any).bind).toBe('parentTask');
    expect(p.statements[1].type).toBe('guard');

    const out = emitProgram(p);
    expect(out).toContain('Task.byIdentifier("abc123")');
    expect(out).toContain('"Parent task not found: abc123"');
    expect(out).toContain('moveTasks([task], parentTask.ending);');
  });

  // Case 4: container priority — parentTaskId WINS over project; project is then
  // ignored entirely (no resolveProject statement, no snippet dep).
  it('parentTaskId wins over project when both set; no resolveProject emitted', () => {
    const p = buildCreateTaskProgram({ name: 'X', parentTaskId: 'abc123', project: 'Work' });
    expect(p.statements.some((s) => s.type === 'resolveProject')).toBe(false);
    expect(p.snippetDeps).not.toContain('resolveProjectFlexible');
    const ct = p.statements.find((s) => s.type === 'constructTask') as any;
    expect(ct.container).toEqual({ kind: 'parentTask', var: 'parentTask' });
  });

  // Case 5: all scalar fields; estimatedMinutes truthy emitted, 0 DROPPED (legacy
  // falsy check, deliberately preserved).
  it('scalar fields: note/flagged defaults, dateExpr dates, estimatedMinutes only when truthy', () => {
    const p = buildCreateTaskProgram(FULL_FIELD_DATA);
    const setProps = p.statements.filter((s) => s.type === 'setProp') as any[];
    const byProp = (prop: string) => setProps.find((s) => s.prop === prop);

    expect(byProp('note').value).toEqual({ type: 'json', value: 'a note' });
    expect(byProp('flagged').value).toEqual({ type: 'json', value: true });
    for (const field of ['dueDate', 'deferDate', 'plannedDate']) {
      expect(byProp(field).strategy).toBe('dateExpr');
    }
    expect(byProp('estimatedMinutes').value).toEqual({ type: 'json', value: 30 });

    // Legacy defaults when absent: note '' and flagged false are STILL emitted.
    const minimal = buildCreateTaskProgram({ name: 'X' });
    const minProps = minimal.statements.filter((s) => s.type === 'setProp') as any[];
    expect(minProps.find((s) => s.prop === 'note').value).toEqual({ type: 'json', value: '' });
    expect(minProps.find((s) => s.prop === 'flagged').value).toEqual({ type: 'json', value: false });

    // estimatedMinutes: 0 → NOT emitted (assert absence in tree AND emitted string).
    const zero = buildCreateTaskProgram({ name: 'X', estimatedMinutes: 0 });
    expect(zero.statements.some((s) => s.type === 'setProp' && (s as any).prop === 'estimatedMinutes')).toBe(false);
    expect(emitProgram(zero)).not.toContain('task.estimatedMinutes = ');
  });

  // Case 6: tags
  it('tags: best-effort assignTags bound to appliedTags + resolveOrCreateTagByPath dep', () => {
    const p = buildCreateTaskProgram({ name: 'X', tags: ['__test-a', 'home : office'] });
    const at = p.statements.find((s) => s.type === 'assignTags') as any;
    expect(at.bind).toBe('appliedTags');
    expect(at.bestEffort).toBe(true);
    expect(at.label).toBe('tags');
    expect(p.snippetDeps).toContain('resolveOrCreateTagByPath');
    const ret = p.statements.at(-1) as any;
    expect(ret.envelope.tags).toEqual({ type: 'ref', name: 'appliedTags' });

    // No tags → envelope tags is a literal empty array, no assignTags statement.
    const bare = buildCreateTaskProgram({ name: 'X' });
    expect(bare.statements.some((s) => s.type === 'assignTags')).toBe(false);
    expect((bare.statements.at(-1) as any).envelope.tags).toEqual({ type: 'json', value: [] });
  });

  // Case 7: repetitionRule lowered at build time into a labeled best-effort setProp
  it('repetitionRule: new Task.RepetitionRule(...) inside a labeled best-effort wrap', () => {
    const p = buildCreateTaskProgram({ name: 'X', repetitionRule: { frequency: 'weekly', interval: 1 } });
    const rr = p.statements.find((s) => s.type === 'setProp' && (s as any).prop === 'repetitionRule') as any;
    expect(rr.bestEffort).toBe(true);
    expect(rr.label).toBe('repetitionRule');

    const out = emitProgram(p);
    expect(out).toContain(
      'new Task.RepetitionRule("FREQ=WEEKLY", null, Task.RepetitionScheduleType.Regularly, Task.AnchorDateKey.DueDate, true)',
    );
    expect(out).toContain('try { task.repetitionRule = new Task.RepetitionRule(');
    expect(out).toContain('_warnings.push("repetitionRule"');
  });

  // Case 8: exhaustiveness — the Record<keyof TaskCreateData, true> guard is
  // compile-time; at runtime, prove a full-field input drops NOTHING.
  it('full-field data lowers every field (nothing silently dropped)', () => {
    const p = buildCreateTaskProgram(FULL_FIELD_DATA);
    expect(() => validateMutationProgram(p)).not.toThrow();

    const types = p.statements.map((s) => s.type);
    expect(types).toEqual([
      'resolveProject', // project
      'guard',
      'constructTask', // name + container
      'setProp', // note
      'setProp', // flagged
      'setProp', // sequential (OMN-198)
      'setProp', // dueDate
      'setProp', // deferDate
      'setProp', // plannedDate
      'setProp', // estimatedMinutes
      'assignTags', // tags
      'setProp', // repetitionRule
      'return',
    ]);
    const props = p.statements.filter((s) => s.type === 'setProp').map((s) => (s as any).prop);
    expect(props).toEqual([
      'note',
      'flagged',
      'sequential',
      'dueDate',
      'deferDate',
      'plannedDate',
      'estimatedMinutes',
      'repetitionRule',
    ]);
  });

  // OMN-198: sequential lowers to a setProp on CREATE (was silently dropped — the
  // field reached the tool bridge but TaskCreateData/lowerTaskCreate never emitted it).
  it('sequential lowers to a setProp on create', () => {
    const p = buildCreateTaskProgram({ name: 'Group', sequential: true });
    const seq = p.statements.find((s) => s.type === 'setProp' && (s as any).prop === 'sequential') as any;
    expect(seq).toBeDefined();
    expect(emitProgram(p)).toContain('sequential = true');
  });

  it('omits the sequential setProp when not provided', () => {
    const p = buildCreateTaskProgram({ name: 'Leaf' });
    expect(p.statements.some((s) => s.type === 'setProp' && (s as any).prop === 'sequential')).toBe(false);
  });
});

describe('lowerTaskCreate (parameterized names)', () => {
  it('batch-style names parameterize every binding; throw-mode guard carries only a message', () => {
    const names: TaskLoweringNames = {
      taskVar: '_t0',
      tagsVar: 'appliedTags_0',
      resolveVar: (base) => `${base}_0`,
      guardMode: 'throw',
    };
    const { statements, snippetDeps } = lowerTaskCreate({ name: 'B', project: 'Work', tags: ['__test-a'] }, names);
    expect((statements[0] as any).bind).toBe('targetProject_0');
    const g = statements[1] as any;
    expect(g.mode).toBe('throw');
    expect(Object.keys(g.envelope)).toEqual(['message']); // no error/context — the item catch wraps it
    const ct = statements.find((s) => s.type === 'constructTask') as any;
    expect(ct.bind).toBe('_t0');
    expect(ct.container).toEqual({ kind: 'project', var: 'targetProject_0' });
    expect((statements.find((s) => s.type === 'assignTags') as any).bind).toBe('appliedTags_0');
    expect(snippetDeps).toContain('resolveProjectFlexible');
  });

  it('containerOverride (batch tempIdRef) skips data-derived container resolution entirely', () => {
    const names: TaskLoweringNames = {
      taskVar: '_t1',
      tagsVar: 'appliedTags_1',
      resolveVar: (base) => `${base}_1`,
      guardMode: 'throw',
    };
    const { statements, snippetDeps } = lowerTaskCreate({ name: 'C', project: 'Work', parentTaskId: 'abc' }, names, {
      kind: 'tempIdRef',
      var: '_t0',
    });
    expect(statements.some((s) => s.type === 'resolveProject' || s.type === 'resolveTask')).toBe(false);
    expect(snippetDeps).not.toContain('resolveProjectFlexible');
    expect((statements.find((s) => s.type === 'constructTask') as any).container).toEqual({
      kind: 'tempIdRef',
      var: '_t0',
    });
  });
});

// Case 9: the OMN-119/120 non-bypass property, now async.
describe('dispatchMutation create/task guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox inbox create when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(dispatchMutation('create/task', { name: 'Not a sandbox task' })).rejects.toThrow(/TEST GUARD/);
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

// Case 10: EXECUTE the emitted program in a vm with stubbed OmniFocus globals.
describe('emitted create-task program executes (vm)', () => {
  function makeTaskStub(taskCalls: unknown[], repetitionCalls: unknown[][]): Record<string, unknown> {
    const TaskStub = function (this: Record<string, unknown>, name: string) {
      taskCalls.push(name);
      this.id = { primaryKey: 'fake-task-id' };
      this.name = name;
      this.inInbox = false;
      this.addTag = (): void => {};
    } as unknown as Record<string, unknown>;
    TaskStub.byIdentifier = (): null => null;
    TaskStub.RepetitionRule = function (this: Record<string, unknown>, ...args: unknown[]) {
      repetitionCalls.push(args);
      this.args = args;
    };
    TaskStub.RepetitionScheduleType = { Regularly: 'REGULARLY', FromCompletion: 'FROM_COMPLETION', None: 'NONE' };
    TaskStub.AnchorDateKey = { DueDate: 'DUE', DeferDate: 'DEFER', PlannedDate: 'PLANNED' };
    return TaskStub;
  }

  it('vm A: full-field program runs to a valid success envelope', () => {
    const program = emitProgram(buildCreateTaskProgram(FULL_FIELD_DATA));
    const taskCalls: unknown[] = [];
    const repetitionCalls: unknown[][] = [];
    const moveCalls: unknown[][] = [];
    const fakeProject = { name: 'Work', ending: { marker: 'work-end' } };
    const sandbox: Record<string, unknown> = {
      Task: makeTaskStub(taskCalls, repetitionCalls),
      Project: { byIdentifier: () => null },
      flattenedProjects: [fakeProject],
      moveTasks: (...args: unknown[]) => {
        moveCalls.push(args);
      },
      Tag: function (this: Record<string, unknown>, name: string) {
        this.name = name;
      },
      flattenedTags: [],
      tags: [],
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    const parsed = JSON.parse(result);

    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(parsed.created).toBe(true);
    expect(parsed.taskId).toBe('fake-task-id');
    expect(parsed.name).toBe('Full');
    expect(parsed.note).toBe('a note');
    expect(parsed.flagged).toBe(true);
    expect(parsed.estimatedMinutes).toBe(30);
    expect(parsed.tags).toEqual(['__test-a']);
    expect(parsed.warnings).toEqual([]);
    expect(typeof parsed.dueDate).toBe('string'); // set via new Date(...), serialized back
    expect(typeof parsed.deferDate).toBe('string');
    expect(typeof parsed.plannedDate).toBe('string');

    expect(taskCalls).toEqual(['Full']);
    expect(moveCalls).toHaveLength(1);
    expect((moveCalls[0] as unknown[])[1]).toBe(fakeProject.ending);
    // Repetition constructed with the lowered build-time literals + stub enums.
    expect(repetitionCalls).toEqual([['FREQ=WEEKLY', null, 'REGULARLY', 'DUE', true]]);
  });

  it('vm B: project-not-found returns the error envelope and NEVER constructs a Task', () => {
    const program = emitProgram(buildCreateTaskProgram({ name: 'X', project: 'Nope' }));
    const taskCalls: unknown[] = [];
    const sandbox: Record<string, unknown> = {
      Task: makeTaskStub(taskCalls, []),
      Project: { byIdentifier: () => null },
      flattenedProjects: [],
      moveTasks: () => {
        throw new Error('moveTasks must not be called when the guard fires');
      },
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    expect(JSON.parse(result)).toEqual({ error: true, message: 'Project not found: Nope', context: 'create_task' });
    expect(taskCalls).toHaveLength(0);
  });
});
