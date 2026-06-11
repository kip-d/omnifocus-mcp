// tests/unit/contracts/ast/mutation/complete.test.ts
// OMN-128 slice 5 — golden + vm-execution tests for the complete lowerings.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildCompleteTaskProgram,
  buildCompleteProjectProgram,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';

describe('buildCompleteTaskProgram — golden emission', () => {
  it('emits resolve, guard, markComplete, read-back envelope — nothing else', () => {
    const program = buildCompleteTaskProgram({ taskId: 't1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTask', 'guard', 'callMethod', 'return']);
    expect(program.context).toBe('complete_task');

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const task = Task.byIdentifier("t1") || null;');
    expect(omnijs).toContain(
      'if (task === null) return JSON.stringify({ error: true, message: "Task not found: t1", context: "complete_task" });',
    );
    expect(omnijs).toContain('task.markComplete();'); // no completionDate → bare call ("now"), spec §3
    expect(omnijs).toContain('task.completionDate ? task.completionDate.toISOString() : null'); // live read-back
    expect(omnijs).not.toContain('_warnings.push'); // §2.4: no best-effort steps
  });

  it('lowers completionDate to a markComplete Date argument', () => {
    const omnijs = emitProgram(buildCompleteTaskProgram({ taskId: 't1', completionDate: '2026-06-10T16:00:00.000Z' }));
    expect(omnijs).toContain('task.markComplete(new Date("2026-06-10T16:00:00.000Z"));');
  });
});

describe('buildCompleteProjectProgram — golden emission', () => {
  it('resolves strictly by id with the entity-named guard message (§2.2 delta from bare "Not found")', () => {
    const program = buildCompleteProjectProgram({ projectId: 'p1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
    expect(omnijs).toContain('"Project not found: p1"');
    expect(omnijs).toContain('proj.markComplete();');
    expect(omnijs).toContain('projectId: proj.id.primaryKey'); // §2.3: live ids
    expect(omnijs).not.toContain('success'); // §2.3: no success key anywhere
  });
});

// The OMN-119/120 non-bypass property for the complete family: dispatch runs the
// sandbox guard BEFORE building (mirrors update-task.test.ts's guard describe).
describe('dispatchMutation complete/task guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox task id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(dispatchMutation('complete/task', { taskId: 'not-a-sandbox-task-id' })).rejects.toThrow(
        /TEST GUARD/,
      );
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

describe('dispatchMutation complete/project guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox project id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(dispatchMutation('complete/project', { projectId: 'not-a-sandbox-project-id' })).rejects.toThrow(
        /TEST GUARD/,
      );
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

describe('emitted complete programs execute (vm)', () => {
  function makeSandbox(found: boolean) {
    const calls: unknown[][] = [];
    const completionDate = new Date('2026-06-10T16:00:00.000Z');
    const task = {
      id: { primaryKey: 't1' },
      name: 'Fixture',
      completionDate,
      markComplete: (...args: unknown[]) => calls.push(args),
    };
    return {
      calls,
      sandbox: { Task: { byIdentifier: () => (found ? task : null) }, JSON },
    };
  }

  it('returns the read-back envelope on success', () => {
    const { sandbox, calls } = makeSandbox(true);
    const program = emitProgram(buildCompleteTaskProgram({ taskId: 't1' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expect(parsed).toEqual({
      taskId: 't1',
      name: 'Fixture',
      completed: true,
      completionDate: '2026-06-10T16:00:00.000Z',
    });
    expect(calls).toHaveLength(1);
  });

  it('not-found returns the typed error envelope with ZERO mutations', () => {
    const { sandbox, calls } = makeSandbox(false);
    const program = emitProgram(buildCompleteTaskProgram({ taskId: 'missing' }));
    const parsed = JSON.parse(vm.runInNewContext(program, sandbox) as string);
    expect(parsed).toEqual({ error: true, message: 'Task not found: missing', context: 'complete_task' });
    expect(calls).toHaveLength(0);
  });
});
