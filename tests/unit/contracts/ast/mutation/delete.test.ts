// tests/unit/contracts/ast/mutation/delete.test.ts
// OMN-128 slice 5 — golden + vm tests for single + bulk delete lowerings.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildDeleteTaskProgram,
  buildDeleteProjectProgram,
  buildBulkDeleteTasksProgram,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';

describe('buildDeleteTaskProgram — golden emission', () => {
  it('captures name BEFORE deleteObject and echoes the requested id (spec §3)', () => {
    const program = buildDeleteTaskProgram({ taskId: 't1' });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveTask', 'guard', 'bind', 'deleteObject', 'return']);
    const omnijs = emitProgram(program);
    expect(omnijs.indexOf('task.name')).toBeLessThan(omnijs.indexOf('deleteObject(task);'));
    expect(omnijs).toContain('"Task not found: t1"');
    expect(omnijs).toContain('taskId: "t1"'); // deliberate echo — object unreadable post-delete
    expect(omnijs).not.toContain('success');
  });
});

describe('buildDeleteProjectProgram — golden emission', () => {
  it('strict byIdentifier resolve, entity-named message (§2.2 delta)', () => {
    const omnijs = emitProgram(buildDeleteProjectProgram({ projectId: 'p1' }));
    expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
    expect(omnijs).toContain('"Project not found: p1"');
    expect(omnijs).toContain('deleteObject(proj);');
    expect(omnijs).toContain('projectId: "p1"');
  });
});

describe('buildBulkDeleteTasksProgram — golden emission', () => {
  it('unrolls one bulkDeleteItem per id plus the accumulator envelope', () => {
    const program = buildBulkDeleteTasksProgram({ taskIds: ['a', 'b', 'c'] });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual([
      'bulkDeleteItem',
      'bulkDeleteItem',
      'bulkDeleteItem',
      'return',
    ]);
    const omnijs = emitProgram(program);
    expect(omnijs).toContain('let _deleted = [];');
    expect(omnijs).toContain('"Deleted " + _deleted.length + " of " + 3 + " tasks"');
  });
});

// The OMN-119/120 non-bypass property for the delete family: dispatch runs the
// sandbox guard BEFORE building (mirrors update-task.test.ts's guard describe).
describe('dispatchMutation delete/task guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox task id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(dispatchMutation('delete/task', { taskId: 'not-a-sandbox-task-id' })).rejects.toThrow(/TEST GUARD/);
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

describe('dispatchMutation delete/project guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox project id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(dispatchMutation('delete/project', { projectId: 'not-a-sandbox-project-id' })).rejects.toThrow(
        /TEST GUARD/,
      );
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

describe('dispatchMutation bulk_delete/task guard (OMN-119/120 non-bypass)', () => {
  // In the unit env ALL three ids fail validation (the __TEST__ prefix check runs
  // against a resolved task's NAME in live OmniFocus; these ids resolve not_found),
  // so this can't distinguish all-ids pre-flight from a first-id-only guard — the
  // true mixed-ids case needs real sandbox fixtures (Task 10 integration coverage).
  it('rejects dispatch when an id fails sandbox validation (all-ids pre-flight proven live in integration)', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(
        dispatchMutation('bulk_delete/task', {
          taskIds: ['__test__sandbox-id', 'not-a-sandbox-task-id', '__test__sandbox-id-2'],
        }),
      ).rejects.toThrow(/TEST GUARD/);
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});

describe('emitted delete programs execute (vm)', () => {
  it('single task delete: envelope with pre-delete name; deleteObject called once', () => {
    const deleted: unknown[] = [];
    const task = { id: { primaryKey: 't1' }, name: 'Doomed' };
    const sandbox = { Task: { byIdentifier: () => task }, deleteObject: (o: unknown) => deleted.push(o), JSON };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildDeleteTaskProgram({ taskId: 't1' })), sandbox) as string,
    );
    expect(parsed).toEqual({ taskId: 't1', name: 'Doomed', deleted: true });
    expect(deleted).toEqual([task]);
  });

  it('single project delete: same shape through Project.byIdentifier', () => {
    const deleted: unknown[] = [];
    const proj = { id: { primaryKey: 'p1' }, name: 'Doomed Project' };
    const sandbox = { Project: { byIdentifier: () => proj }, deleteObject: (o: unknown) => deleted.push(o), JSON };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildDeleteProjectProgram({ projectId: 'p1' })), sandbox) as string,
    );
    expect(parsed).toEqual({ projectId: 'p1', name: 'Doomed Project', deleted: true });
    expect(deleted).toEqual([proj]);
  });

  it('single delete not-found: typed error, deleteObject NEVER called', () => {
    const deleted: unknown[] = [];
    const sandbox = { Task: { byIdentifier: () => null }, deleteObject: (o: unknown) => deleted.push(o), JSON };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildDeleteTaskProgram({ taskId: 'x' })), sandbox) as string,
    );
    expect(parsed).toEqual({ error: true, message: 'Task not found: x', context: 'delete_task' });
    expect(deleted).toEqual([]);
  });

  it('bulk: continue-on-error with mixed found/not-found/throwing ids', () => {
    const tasks: Record<string, { id: { primaryKey: string }; name: string }> = {
      a: { id: { primaryKey: 'a' }, name: 'A' },
      c: { id: { primaryKey: 'c' }, name: 'C' },
    };
    const deleted: string[] = [];
    const sandbox = {
      Task: { byIdentifier: (id: string) => tasks[id] ?? null },
      deleteObject: (o: { name: string }) => {
        if (o.name === 'C') throw new Error('locked');
        deleted.push(o.name);
      },
      JSON,
    };
    const parsed = JSON.parse(
      vm.runInNewContext(emitProgram(buildBulkDeleteTasksProgram({ taskIds: ['a', 'b', 'c'] })), sandbox) as string,
    );
    expect(parsed.deleted).toEqual([{ id: 'a', name: 'A' }]);
    expect(parsed.errors).toEqual([
      { taskId: 'b', error: 'Task not found' },
      { taskId: 'c', error: 'locked' },
    ]);
    expect(parsed.message).toBe('Deleted 1 of 3 tasks');
    expect(deleted).toEqual(['A']); // 'b' skipped, 'c' threw, loop continued
  });
});
