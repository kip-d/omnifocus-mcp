// tests/unit/contracts/ast/mutation/update-task.test.ts
// OMN-128 slice 4 — golden + vm-execution + dispatch-guard tests for the
// update/task lowering (buildUpdateTaskProgram). Mirrors create-task.test.ts.
import vm from 'node:vm';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// OMN-286 guard-boundary mock — see complete.test.ts's comment for the full
// rationale (CI has no osascript; unmocked guard tests fail closed there
// regardless of which case is under test).
const mockStdoutQueue: string[] = [];
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: unknown, out: { stdout: string }) => void) => {
    cb(null, { stdout: mockStdoutQueue.shift() ?? '{}' });
  }),
}));

// Imports go through the barrel deliberately — this file exercises the public
// surface of src/contracts/ast/mutation/index.ts.
import {
  buildUpdateTaskProgram,
  callMethod,
  dispatchMutation,
  emitProgram,
  guard,
  json,
  ref,
  resolveTask,
  return_,
  validateMutationProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';
import type { TaskUpdateData } from '../../../../../src/contracts/mutations.js';
import { TaskWriteResultSchema } from '../../../../../src/omnifocus/script-response-schemas.js';
import { clearSandboxCache } from '../../../../../src/contracts/ast/mutation-script-builder.js';
import { expectMatchesSchema } from './assert-schema.js';

beforeEach(() => {
  mockStdoutQueue.length = 0;
  // OMN-286: reset the sandbox-folder-id/validated-id caches so the guard
  // test below doesn't implicitly depend on prior-test ordering (fragile
  // under -t / .only — see the comment on sandbox-guard-notfound.test.ts).
  clearSandboxCache();
});

function emit(changes: TaskUpdateData, taskId = 't1'): string {
  const program = buildUpdateTaskProgram({ taskId, changes });
  validateMutationProgram(program);
  return emitProgram(program);
}

describe('buildUpdateTaskProgram — golden emission', () => {
  // Build-time conditional lowering (spec §1): only-what-changed.
  it('rename-only update emits resolve, guard, one setProp, return — nothing else', () => {
    const program = buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'New name' } });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTask', 'guard', 'setProp', 'return']);
    expect(program.context).toBe('update_task');
    expect(program.snippetDeps).toEqual([]);

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const task = Task.byIdentifier("t1") || null;');
    expect(omnijs).toContain(
      'if (task === null) return JSON.stringify({ error: true, message: "Task not found: t1", context: "update_task" });',
    );
    expect(omnijs).toContain('task.name = "New name";');
    expect(omnijs).not.toContain('moveTasks');
    expect(omnijs).not.toContain('dueDate');
    expect(omnijs).not.toContain('addTag');
  });

  // Resolve-first ordering (spec §2.2): destination guards precede ALL applies.
  it('emits destination resolve+guard BEFORE any setProp, and applies before moves', () => {
    const omnijs = emit({ name: 'x', project: 'Work' });
    expect(omnijs.indexOf('Project not found: Work')).toBeLessThan(omnijs.indexOf('task.name = "x";'));
    expect(omnijs.indexOf('task.name = "x";')).toBeLessThan(omnijs.indexOf('moveTasks'));
  });

  it('full-field input lowers in legacy apply order: scalars → dates → estimatedMinutes → moves → tags → repetition → status', () => {
    const program = buildUpdateTaskProgram({
      taskId: 't1',
      changes: {
        name: 'n',
        note: 'o',
        flagged: true,
        sequential: true,
        dueDate: '2026-06-12 17:00',
        estimatedMinutes: 15,
        project: 'Work',
        parentTaskId: 'parent1',
        tags: ['__test-a'],
        addTags: ['__test-b'],
        removeTags: ['__test-c'],
        repetitionRule: { frequency: 'weekly', interval: 1 },
        status: 'completed',
      },
    });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual([
      'resolveTask', // target
      'guard',
      'resolveProject', // destination: project
      'guard',
      'resolveTask', // destination: parentTaskId
      'guard',
      'setProp', // name
      'setProp', // note
      'setProp', // flagged
      'setProp', // sequential
      'setProp', // dueDate
      'setProp', // estimatedMinutes
      'moveTask', // project move
      'moveTask', // parent move
      'assignTags', // tags (replace)
      'assignTags', // addTags (add)
      'assignTags', // removeTags (remove)
      'setProp', // repetitionRule
      'callMethod', // status
      'return',
    ]);
    expect(program.statements[4]).toMatchObject({ type: 'resolveTask', bind: 'parentTask', ref: 'parent1' });
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('"Parent task not found: parent1"');
  });

  // Set-vs-clear, BOTH representations (spec §3 plan note): the tool sanitizer
  // normalizes clearX → null on the task path, but the builder is the public
  // contract, so both must lower to the null assignment.
  it('dueDate: null and clearDueDate: true both emit a null assignment', () => {
    for (const changes of [{ dueDate: null }, { clearDueDate: true }] as const) {
      const omnijs = emit(changes);
      expect(omnijs).toContain('task.dueDate = null;');
      expect(omnijs).not.toContain('new Date');
    }
  });

  it("dueDate: '' lowers to null (shared lowerDateSetClear empty-string handling)", () => {
    const omnijs = emit({ dueDate: '' });
    expect(omnijs).toContain('task.dueDate = null;');
    expect(omnijs).not.toContain('new Date');
  });

  it('clear flag WINS over a simultaneous value (legacy clear-applied-last)', () => {
    const omnijs = emit({ dueDate: '2026-06-12 17:00', clearDueDate: true });
    expect(omnijs).toContain('task.dueDate = null;');
    expect(omnijs).not.toContain('new Date("2026-06-12 17:00")');
  });

  it('deferDate/plannedDate get the same set-vs-clear treatment', () => {
    const omnijs = emit({ deferDate: null, plannedDate: '2026-06-13 12:00', clearPlannedDate: true });
    expect(omnijs).toContain('task.deferDate = null;');
    expect(omnijs).toContain('task.plannedDate = null;');
    expect(omnijs).not.toContain('new Date');

    const set = emit({ deferDate: '2026-06-13 08:00' });
    expect(set).toContain('task.deferDate = new Date("2026-06-13 08:00");');
  });

  // estimatedMinutes: !== undefined, NOT truthy — update sets 0 (legacy; create
  // drops 0 — pre-existing asymmetry, preserved per spec §3).
  it('estimatedMinutes: 0 emits an assignment of 0; clear flag wins over a value', () => {
    expect(emit({ estimatedMinutes: 0 })).toContain('task.estimatedMinutes = 0;');
    const cleared = emit({ estimatedMinutes: 30, clearEstimatedMinutes: true });
    expect(cleared).toContain('task.estimatedMinutes = null;');
    expect(cleared).not.toContain('task.estimatedMinutes = 30;');
  });

  // Moves — all best-effort labeled 'move' (OMN-137).
  it('project: null moves to inbox.beginning, best-effort labeled move', () => {
    const omnijs = emit({ project: null });
    expect(omnijs).toContain('try { moveTasks([task], inbox.beginning); }');
    expect(omnijs).toContain('_warnings.push("move"');
  });

  it('project string resolves flexibly and moves to projectBeginning', () => {
    const program = buildUpdateTaskProgram({ taskId: 't1', changes: { project: 'Work' } });
    expect(program.snippetDeps).toContain('resolveProjectFlexible');
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const targetProject = resolveProjectFlexible("Work");');
    expect(omnijs).toContain('"Project not found: Work"');
    expect(omnijs).toContain('moveTasks([task], targetProject.beginning);');
  });

  // Legacy-faithful: even an EMPTY-string project goes through resolution
  // (string → resolveProject; only undefined means "no move", only null means inbox).
  it('project: "" resolves (and guards) rather than silently skipping', () => {
    const omnijs = emit({ project: '' });
    expect(omnijs).toContain('resolveProjectFlexible("")');
    expect(omnijs).toContain('"Project not found: "');
  });

  it('parentTaskId: null emits the containerRoot ternary', () => {
    const omnijs = emit({ parentTaskId: null });
    expect(omnijs).toContain(
      'moveTasks([task], task.containingProject ? task.containingProject.beginning : inbox.beginning);',
    );
    expect(omnijs).toContain('_warnings.push("move"');
  });

  it('parentTaskId: "" behaves like null (legacy)', () => {
    expect(emit({ parentTaskId: '' })).toBe(emit({ parentTaskId: null }));
  });

  it('parentTaskId string resolves strictly by identifier with a loud guard', () => {
    const omnijs = emit({ parentTaskId: 'parent1' });
    expect(omnijs).toContain('const parentTask = Task.byIdentifier("parent1") || null;');
    expect(omnijs).toContain(
      'if (parentTask === null) return JSON.stringify({ error: true, message: "Parent task not found: parent1", context: "update_task" });',
    );
    expect(omnijs).toContain('moveTasks([task], parentTask.ending);');
  });

  // Tags: three modes, distinct binds, best-effort labeled 'tags' (OMN-137).
  it('tags + addTags + removeTags emit three mode blocks with distinct binds', () => {
    const program = buildUpdateTaskProgram({
      taskId: 't1',
      changes: { tags: ['__test-a'], addTags: ['__test-b'], removeTags: ['__test-c'] },
    });
    const tagStmts = program.statements.filter((s) => s.type === 'assignTags') as any[];
    expect(tagStmts.map((s) => [s.mode, s.bind, s.bestEffort, s.label])).toEqual([
      ['replace', 'replacedTags', true, 'tags'],
      ['add', 'addedTags', true, 'tags'],
      ['remove', 'removedTags', true, 'tags'],
    ]);
    expect(program.snippetDeps).toContain('resolveOrCreateTagByPath');
    expect(program.snippetDeps).toContain('resolveTagByPath');

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('task.clearTags();');
    expect(omnijs).toContain('removeTag');
    expect(omnijs).toContain('_warnings.push("tags"');
  });

  it('tags: [] emits clearTags (truthy-empty-array legacy semantics)', () => {
    const omnijs = emit({ tags: [] });
    expect(omnijs).toContain('task.clearTags();');
  });

  it('addTags alone needs only resolveOrCreateTagByPath; removeTags alone only resolveTagByPath', () => {
    expect(buildUpdateTaskProgram({ taskId: 't1', changes: { addTags: ['__test-a'] } }).snippetDeps).toEqual([
      'resolveOrCreateTagByPath',
    ]);
    expect(buildUpdateTaskProgram({ taskId: 't1', changes: { removeTags: ['__test-a'] } }).snippetDeps).toEqual([
      'resolveTagByPath',
    ]);
  });

  // Repetition.
  it('repetitionRule: null assigns null', () => {
    const omnijs = emit({ repetitionRule: null });
    expect(omnijs).toContain('task.repetitionRule = null;');
    expect(omnijs).not.toContain('new Task.RepetitionRule');
  });

  it('repetitionRule object lowers at build time via lowerRepetitionRule, best-effort labeled', () => {
    const omnijs = emit({ repetitionRule: { frequency: 'weekly', interval: 1 } });
    expect(omnijs).toContain(
      'new Task.RepetitionRule("FREQ=WEEKLY", null, Task.RepetitionScheduleType.Regularly, Task.AnchorDateKey.DueDate, true)',
    );
    expect(omnijs).toContain('try { task.repetitionRule = new Task.RepetitionRule(');
    expect(omnijs).toContain('_warnings.push("repetitionRule"');
  });

  // Status — applied LAST (legacy order), best-effort labeled 'status'.
  // OMN-377 (gate finding 1): markComplete's RETURN is the completed task —
  // for a repeating task a new-id copy, while `task` advances. The lowering
  // binds it (callMethod.bind) so the envelope can name the copy.
  it("status completed binds markComplete(new Date())'s result, best-effort labeled status", () => {
    const omnijs = emit({ status: 'completed' });
    expect(omnijs).toContain('let completedTask = null;');
    expect(omnijs).toContain('try { completedTask = task.markComplete(new Date()); }');
    expect(omnijs).toContain('_warnings.push("status"');
  });

  it('status dropped emits task.drop(true, new Date())', () => {
    const omnijs = emit({ status: 'dropped' });
    expect(omnijs).toContain('try { task.drop(true, new Date()); }');
    expect(omnijs).toContain('_warnings.push("status"');
  });

  // OMN-377: 'active' reopens. Both calls are no-ops on a task not in that
  // terminal state (markIncomplete only acts on a completed task; active=true
  // on an active one changes nothing), so no build-time branching is needed.
  it('status active emits markIncomplete() then active = true, best-effort labeled status', () => {
    const omnijs = emit({ status: 'active' });
    expect(omnijs).toContain('try { task.markIncomplete(); }');
    expect(omnijs).toContain('try { task.active = true; }');
    expect(omnijs.indexOf('task.markIncomplete()')).toBeLessThan(omnijs.indexOf('task.active = true'));
    expect(omnijs).not.toContain('task.drop(');
    expect(omnijs).not.toContain('task.markComplete(');
  });

  // Envelope: live read-backs, never input echoes (spec §2.4).
  it('envelope reads back primaryKey/name/flagged and carries warnings', () => {
    const omnijs = emit({ name: 'x' });
    expect(omnijs).toContain('taskId: task.id.primaryKey');
    expect(omnijs).toContain('name: task.name');
    expect(omnijs).toContain('flagged: task.flagged');
    expect(omnijs).toContain('updated: true');
    expect(omnijs).toContain('warnings: _warnings');
  });

  // OMN-377: the status outcome is read back live on EVERY update (not only
  // when status changed — conditional field presence caused OMN-207's
  // read-after-write gaps), in omnifocus_read's field names.
  it('envelope reads back completed and dropDate live', () => {
    for (const changes of [{ name: 'x' }, { status: 'dropped' as const }]) {
      const omnijs = emit(changes);
      expect(omnijs).toContain('completed: task.completed');
      expect(omnijs).toContain('dropDate: task.dropDate ? task.dropDate.toISOString() : null');
    }
  });

  // sequential is LIVE (spec §3 — action groups; the shared schema + sanitizer
  // forward it; only the TS type was missing it).
  it('sequential lowers to a setProp', () => {
    expect(emit({ sequential: true })).toContain('task.sequential = true;');
  });

  // OMN-377: callMethod.bind substrate. Non-best-effort binds a const; a
  // best-effort bind is declared before the try so it stays in scope (null
  // when the call threw); the bind name is under the reserved-name rule.
  it('callMethod.bind emits const (plain) or let+try assignment (best-effort)', () => {
    const plain = emitProgram({
      statements: [
        resolveTask('task', 't1'),
        guard('task === null', { error: json(true) }),
        callMethod(ref('task'), 'markComplete', [], false, undefined, 'done'),
        return_({ ok: json(true) }),
      ],
      context: 'update_task',
      snippetDeps: [],
    });
    expect(plain).toContain('const done = task.markComplete();');
    const best = emitProgram({
      statements: [
        resolveTask('task', 't1'),
        guard('task === null', { error: json(true) }),
        callMethod(ref('task'), 'markComplete', [], true, 'status', 'done'),
        return_({ ok: json(true) }),
      ],
      context: 'update_task',
      snippetDeps: [],
    });
    expect(best).toContain('let done = null;\ntry { done = task.markComplete(); } catch (e) { _warnings.push("status"');
  });

  it('validator rejects a reserved identifier as a callMethod bind', () => {
    const program = {
      statements: [
        resolveTask('task', 't1'),
        guard('task === null', { error: json(true) }),
        callMethod(ref('task'), 'markComplete', [], true, 'status', '_warnings'),
        return_({ ok: json(true) }),
      ],
      context: 'update_task',
      snippetDeps: [],
    };
    expect(() => validateMutationProgram(program)).toThrow(/reserved/i);
  });

  // Rule-7 sensitivity at the lowering's shape: stripping the target guard from
  // the EMITTED program tree must fail validation — proving the lowering's
  // resolve-first shape is actually under rule-7 protection (not vacuously valid).
  it('stripping the target guard makes the program fail rule 7 (without a guard)', () => {
    const program = buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'x' } });
    expect(() => validateMutationProgram(program)).not.toThrow();
    const guardIndex = program.statements.findIndex((s) => s.type === 'guard');
    expect(guardIndex).toBeGreaterThan(-1);
    program.statements.splice(guardIndex, 1);
    expect(() => validateMutationProgram(program)).toThrow(/without a guard/i);
  });
});

// EXECUTE the emitted program in a vm with stubbed OmniJS globals.
describe('emitted update-task program executes (vm)', () => {
  const MUTATING_PROPS = [
    'name',
    'note',
    'flagged',
    'sequential',
    'dueDate',
    'deferDate',
    'plannedDate',
    'estimatedMinutes',
    'repetitionRule',
  ] as const;

  /** A task stub whose setters RECORD — readable id/name/flagged, loud sets.
   *  OMN-377: status state is modeled on the live OmniJS behavior verified
   *  2026-10-16 — drop() sets dropDate and clears `active`; `active = true`
   *  clears dropDate; markIncomplete() clears `completed`. */
  function makeRecordingTask(initial: Record<string, unknown> = {}): {
    task: Record<string, unknown>;
    sets: string[];
    calls: string[];
  } {
    const sets: string[] = [];
    const calls: string[] = [];
    const values: Record<string, unknown> = {
      name: 'Old name',
      flagged: false,
      repetitionRule: null,
      ...initial,
    };
    const status = {
      completed: (initial.completed as boolean | undefined) ?? false,
      dropDate: (initial.dropDate as Date | null | undefined) ?? null,
    };
    const task: Record<string, unknown> = {
      id: { primaryKey: 'fake-task-id' },
      clearTags: () => {
        calls.push('clearTags');
      },
      addTag: () => {
        calls.push('addTag');
      },
      removeTag: () => {
        calls.push('removeTag');
      },
      // Live behavior (verified 2026-10-19): on a repeating task markComplete
      // completes and RETURNS a new-id copy ('<id>.0'); the original stays
      // incomplete (it advances to the next occurrence). Otherwise it
      // completes in place and returns the task itself.
      markComplete: () => {
        calls.push('markComplete');
        if (values.repetitionRule) return { id: { primaryKey: 'fake-task-id.0' }, completed: true };
        status.completed = true;
        return task;
      },
      markIncomplete: () => {
        calls.push('markIncomplete');
        status.completed = false;
      },
      drop: () => {
        calls.push('drop');
        status.dropDate = new Date('2026-10-16T14:46:34.039Z');
      },
    };
    Object.defineProperty(task, 'completed', { get: () => status.completed });
    Object.defineProperty(task, 'dropDate', { get: () => status.dropDate });
    Object.defineProperty(task, 'active', {
      get: () => status.dropDate === null,
      set: (v: unknown) => {
        sets.push('active');
        if (v === true) status.dropDate = null;
      },
    });
    for (const prop of MUTATING_PROPS) {
      Object.defineProperty(task, prop, {
        get: () => values[prop],
        set: (v: unknown) => {
          sets.push(prop);
          values[prop] = v;
        },
      });
    }
    return { task, sets, calls };
  }

  it('vm: not-found target returns the error envelope and mutates NOTHING', () => {
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 'missing', changes: { name: 'x', project: null } }));
    const sandbox: Record<string, unknown> = {
      Task: { byIdentifier: () => null },
      moveTasks: () => {
        throw new Error('moveTasks must not be called when the target guard fires');
      },
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    expect(JSON.parse(result)).toEqual({
      error: true,
      message: 'Task not found: missing',
      context: 'update_task',
    });
  });

  it('vm: not-found DESTINATION fails loud with zero mutations applied (resolve-first)', () => {
    const { task, sets, calls } = makeRecordingTask();
    const program = emitProgram(
      buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'x', flagged: true, project: 'Nope' } }),
    );
    const sandbox: Record<string, unknown> = {
      Task: { byIdentifier: () => task },
      Project: { byIdentifier: () => null },
      flattenedProjects: [],
      moveTasks: () => {
        throw new Error('moveTasks must not be called when a destination guard fires');
      },
    };
    const result = vm.runInNewContext(program, sandbox) as string;
    expect(JSON.parse(result)).toEqual({
      error: true,
      message: 'Project not found: Nope',
      context: 'update_task',
    });
    expect(sets).toEqual([]); // no setter touched — zero partial apply
    expect(calls).toEqual([]);
  });

  it('vm: rename-only update returns the read-back envelope with empty warnings', () => {
    const { task } = makeRecordingTask();
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'New name' } }));
    const sandbox: Record<string, unknown> = { Task: { byIdentifier: () => task } };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(parsed).toEqual({
      taskId: 'fake-task-id',
      name: 'New name', // read back from the stub, not echoed
      flagged: false,
      completed: false,
      dropDate: null,
      updated: true,
      warnings: [],
    });
  });

  // OMN-377: status outcomes read back live, through the response schema.
  it('vm: dropped on a non-repeating task reads back dropDate, no repeat warning', () => {
    const { task, calls } = makeRecordingTask();
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'dropped' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(calls).toEqual(['drop']);
    expect(parsed.completed).toBe(false);
    expect(parsed.dropDate).toBe('2026-10-16T14:46:34.039Z');
    expect(parsed.warnings).toEqual([]);
  });

  it('vm: dropped on a repeating task warns that the whole series was dropped', () => {
    const { task } = makeRecordingTask({ repetitionRule: { ruleString: 'FREQ=DAILY' } });
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'dropped' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(parsed.dropDate).toBe('2026-10-16T14:46:34.039Z');
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toMatch(/repeating/i);
    expect(parsed.warnings[0]).toMatch(/all future occurrences/i);
  });

  it('vm: a repeating task whose rule is cleared in the same update gets no repeat warning', () => {
    const { task } = makeRecordingTask({ repetitionRule: { ruleString: 'FREQ=DAILY' } });
    const program = emitProgram(
      buildUpdateTaskProgram({ taskId: 't1', changes: { repetitionRule: null, status: 'dropped' } }),
    );
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expect(parsed.warnings).toEqual([]);
  });

  it('vm: a failed drop on a repeating task reports the failure, not the series notice', () => {
    const { task } = makeRecordingTask({ repetitionRule: { ruleString: 'FREQ=DAILY' } });
    task.drop = () => {
      throw new Error('boom');
    };
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'dropped' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expect(parsed.dropDate).toBeNull();
    expect(parsed.warnings).toEqual(['status: boom']);
  });

  it('vm: completed on a non-repeating task reads back completed:true, no occurrence notice', () => {
    const { task, calls } = makeRecordingTask();
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'completed' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(calls).toEqual(['markComplete']);
    expect(parsed.completed).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  // Gate finding 1: the live read of `task` says completed:false here (it is
  // now the next occurrence) — the notice names the completed copy's id so
  // the caller isn't left reading a contradiction.
  it('vm: completed on a repeating task names the completed copy and the advanced id', () => {
    const { task } = makeRecordingTask({ repetitionRule: { ruleString: 'FREQ=DAILY' } });
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'completed' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(parsed.completed).toBe(false);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('fake-task-id.0');
    expect(parsed.warnings[0]).toMatch(/fake-task-id now holds the next occurrence/);
  });

  it('vm: a failed markComplete reports only its own failure', () => {
    const { task } = makeRecordingTask({ repetitionRule: { ruleString: 'FREQ=DAILY' } });
    task.markComplete = () => {
      throw new Error('boom');
    };
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'completed' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expect(parsed.warnings).toEqual(['status: boom']);
  });

  it('vm: active on a dropped task undrops it and reads back dropDate null', () => {
    const { task, calls, sets } = makeRecordingTask({ dropDate: new Date('2026-10-01T12:00:00Z') });
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'active' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(calls).toEqual(['markIncomplete']);
    expect(sets).toEqual(['active']);
    expect(parsed.dropDate).toBeNull();
    expect(parsed.completed).toBe(false);
    expect(parsed.warnings).toEqual([]);
  });

  it('vm: active on a completed task reopens it', () => {
    const { task } = makeRecordingTask({ completed: true });
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { status: 'active' } }));
    const parsed = JSON.parse(vm.runInNewContext(program, { Task: { byIdentifier: () => task } }) as string);
    expect(parsed.completed).toBe(false);
    expect(parsed.dropDate).toBeNull();
  });

  it('vm: a throwing moveTasks records a labeled move warning but the update still succeeds', () => {
    const { task, sets } = makeRecordingTask();
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { name: 'x', project: null } }));
    const sandbox: Record<string, unknown> = {
      Task: { byIdentifier: () => task },
      inbox: { beginning: { marker: 'inbox-start' } },
      moveTasks: () => {
        throw new Error('boom');
      },
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(parsed.updated).toBe(true);
    expect(parsed.name).toBe('x'); // the other change persisted
    expect(parsed.warnings).toEqual(['move: boom']);
    expect(sets).toContain('name');
  });

  // OMN-248: remove mode used to drop unresolvable tag names with zero signal —
  // success with warnings: [] while nothing was removed (the same silent-skip
  // shape OMN-136 eliminated in readModifyReassign).
  it('vm: remove mode with an unresolvable tag name records a labeled warning, update still succeeds', () => {
    const { task, calls } = makeRecordingTask();
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { removeTags: ['no-such-tag'] } }));
    const sandbox: Record<string, unknown> = {
      Task: { byIdentifier: () => task },
      flattenedTags: [], // nothing resolves
      tags: [],
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(parsed.updated).toBe(true);
    expect(parsed.warnings).toEqual(['tags: tag not found — not removed: no-such-tag']);
    expect(calls).not.toContain('removeTag');
  });

  it('vm: remove mode with a resolvable tag removes it warning-free (happy path unchanged)', () => {
    const { task, calls } = makeRecordingTask();
    const existingTag = { name: 'real-tag' };
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { removeTags: ['real-tag'] } }));
    const sandbox: Record<string, unknown> = {
      Task: { byIdentifier: () => task },
      flattenedTags: [existingTag],
      tags: [existingTag],
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expect(parsed.warnings).toEqual([]);
    expect(calls).toContain('removeTag');
  });

  it('vm: replace mode calls clearTags before addTag', () => {
    const { task, calls } = makeRecordingTask();
    const program = emitProgram(buildUpdateTaskProgram({ taskId: 't1', changes: { tags: ['__test-a'] } }));
    const sandbox: Record<string, unknown> = {
      Task: { byIdentifier: () => task },
      Tag: function (this: Record<string, unknown>, name: string) {
        this.name = name;
      },
      flattenedTags: [],
      tags: [],
    };
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expectMatchesSchema(TaskWriteResultSchema, parsed);
    expect(parsed.updated).toBe(true);
    expect(parsed.warnings).toEqual([]);
    expect(calls).toEqual(['clearTags', 'addTag']);
  });
});

// The OMN-119/120 non-bypass property for the update family: dispatch runs the
// sandbox guard BEFORE building (mirrors create-task.test.ts's guard test).
describe('dispatchMutation update/task guard (OMN-119/120 non-bypass)', () => {
  it('passes a not-found task id through the guard; build succeeds with the script-level not-found check (OMN-286)', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      // OMN-286: the guard no longer aborts on not-found — it passes
      // through to the script's own strict-byIdentifier handling (live-
      // verified in mark-reviewed-batch-live.test.ts). Guard-before-build
      // for a FOUND-but-outside-sandbox id is covered by
      // sandbox-guard-task-notfound.test.ts's mocked "still throws" case.
      // First guard call also resolves (and caches) the sandbox folder id.
      mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
      mockStdoutQueue.push(JSON.stringify({ inSandbox: false, error: 'not_found' }));
      const program = await dispatchMutation('update/task', {
        taskId: 'not-a-sandbox-task-id',
        changes: { name: 'x' },
      });
      expect(emitProgram(program)).toContain('Task not found: not-a-sandbox-task-id');
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});
