/**
 * OMN-130: Read surface honesty tests
 *
 * Three changes tested here:
 *  1. hasNote in MINIMAL_FIELDS + generateFieldProjection
 *  2. available redefined as "actionable now" (Available | DueSoon | Next | Overdue)
 *  3. (Change 2 is description-only — no code assertions needed)
 *
 * VM behavioral tests use node:vm to confirm the generated OmniJS code behaves
 * correctly when evaluated with stub task objects, confirming the generated
 * artifact — not just the script text.
 */

import * as vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { buildFilteredTasksScript, MINIMAL_FIELDS } from '../../../../src/contracts/ast/script-builder.js';
import { TaskFieldEnum } from '../../../../src/tools/unified/schemas/read-schema.js';
import { TaskRowSchema } from '../../../../src/omnifocus/script-response-schemas.js';

// =============================================================================
// Change 1 — hasNote in MINIMAL_FIELDS and generateFieldProjection
// =============================================================================

describe('OMN-130 Change 1: hasNote in MINIMAL_FIELDS', () => {
  it('MINIMAL_FIELDS includes hasNote', () => {
    expect(MINIMAL_FIELDS).toContain('hasNote');
  });
});

describe('OMN-130 Change 1: generateFieldProjection emits hasNote', () => {
  it('emits hasNote projection when hasNote is in fields', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'hasNote'] });
    // hasNote: (task.note || '').length > 0
    expect(result.script).toMatch(/hasNote\s*:/);
    expect(result.script).toContain('task.note');
    expect(result.script).toContain('.length > 0');
  });

  it('MINIMAL_FIELDS projection includes hasNote in default script (no explicit fields)', () => {
    // buildFilteredTasksScript with no fields uses MINIMAL_FIELDS
    const result = buildFilteredTasksScript({});
    expect(result.script).toMatch(/hasNote\s*:/);
  });

  it('hasNote projection coalesces null note to empty string (no .length on null)', () => {
    const result = buildFilteredTasksScript({}, { fields: ['hasNote'] });
    // Must coalesce: (task.note || '')
    expect(result.script).toContain("task.note || ''");
  });
});

describe('OMN-130 Change 1: TaskFieldEnum includes hasNote', () => {
  it('TaskFieldEnum includes hasNote', () => {
    expect(TaskFieldEnum.options).toContain('hasNote');
  });
});

describe('OMN-130 Change 1: TaskRowSchema accepts hasNote', () => {
  it('accepts hasNote: true', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', hasNote: true });
    expect(result.success).toBe(true);
  });

  it('accepts hasNote: false', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', hasNote: false });
    expect(result.success).toBe(true);
  });

  it('accepts hasNote: undefined (optional)', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task' });
    expect(result.success).toBe(true);
  });

  it('rejects hasNote with non-boolean (strict schema)', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', hasNote: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown extra fields (schema stays strict)', () => {
    const result = TaskRowSchema.safeParse({ id: 'abc', name: 'Task', unknownField: true });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Change 1: VM behavioral — hasNote emits boolean, not string
// =============================================================================

describe('OMN-130 Change 1: VM behavioral — hasNote projection', () => {
  // Stub Task.Status for the OMN-157 dropped-exclusion predicate
  const Task = {
    Status: {
      Dropped: 'Dropped',
      Available: 'Available',
      Blocked: 'Blocked',
      DueSoon: 'DueSoon',
      Next: 'Next',
      Overdue: 'Overdue',
    },
  };

  function makeTask(name: string, note: string | null, taskStatus = Task.Status.Available) {
    return {
      id: { primaryKey: `id-${name}` },
      name,
      flagged: false,
      completed: false,
      taskStatus,
      inInbox: false,
      tags: [],
      dueDate: null,
      deferDate: null,
      containingProject: null,
      project: null,
      note,
    };
  }

  function runScript(script: string, tasks: unknown[]): { tasks: Array<Record<string, unknown>> } {
    const sandbox: Record<string, unknown> = { flattenedTasks: tasks, inbox: tasks, Task, JSON };
    return JSON.parse(vm.runInNewContext(script, sandbox) as string) as {
      tasks: Array<Record<string, unknown>>;
    };
  }

  it('hasNote is true when task has a non-empty note', () => {
    const tasks = [makeTask('alpha', 'some context here')];
    const { script } = buildFilteredTasksScript({}, { fields: ['id', 'name', 'hasNote'] });
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.hasNote).toBe(true);
  });

  it('hasNote is false when task has an empty string note', () => {
    const tasks = [makeTask('beta', '')];
    const { script } = buildFilteredTasksScript({}, { fields: ['id', 'name', 'hasNote'] });
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.hasNote).toBe(false);
  });

  it('hasNote is false when task has null note', () => {
    const tasks = [makeTask('gamma', null)];
    const { script } = buildFilteredTasksScript({}, { fields: ['id', 'name', 'hasNote'] });
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.hasNote).toBe(false);
  });

  it('hasNote is in default output (MINIMAL_FIELDS)', () => {
    const tasks = [makeTask('delta', 'context'), makeTask('epsilon', null)];
    // No explicit fields → uses MINIMAL_FIELDS which now includes hasNote
    const { script } = buildFilteredTasksScript({});
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(2);
    // All tasks in default output should have hasNote field
    for (const task of result.tasks) {
      expect(typeof task.hasNote).toBe('boolean');
    }
    const taskWithNote = result.tasks.find((t) => t.name === 'delta');
    const taskWithoutNote = result.tasks.find((t) => t.name === 'epsilon');
    expect(taskWithNote?.hasNote).toBe(true);
    expect(taskWithoutNote?.hasNote).toBe(false);
  });
});

// =============================================================================
// Change 3 — available redefined as "actionable now"
// {Available, DueSoon, Next, Overdue} → true; Blocked → false
// =============================================================================

describe('OMN-130 Change 3: available projection emits 4-status membership check', () => {
  it('generated script references Task.Status.Available in the available projection', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'available'] });
    expect(result.script).toContain('Task.Status.Available');
  });

  it('generated script references Task.Status.DueSoon in the available projection', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'available'] });
    expect(result.script).toContain('Task.Status.DueSoon');
  });

  it('generated script references Task.Status.Next in the available projection', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'available'] });
    expect(result.script).toContain('Task.Status.Next');
  });

  it('generated script references Task.Status.Overdue in the available projection', () => {
    const result = buildFilteredTasksScript({}, { fields: ['id', 'name', 'available'] });
    expect(result.script).toContain('Task.Status.Overdue');
  });

  it('available projection does NOT use bare task.taskStatus === Task.Status.Available (single-status form)', () => {
    // The old single-status form must be gone from the available projection.
    // The new form is a multi-member check (indexOf or || chain).
    const result = buildFilteredTasksScript({}, { fields: ['available'] });
    // Old exact form: available: task.taskStatus === Task.Status.Available
    // We check that it's NOT just the single equality (which would mean DueSoon/Next/Overdue are missed)
    // by requiring that at least DueSoon also appears alongside Available in the available: line.
    const availableLine = result.script.match(/available\s*:.*?(?=,\s*\n|\n\s*[a-z]|$)/s)?.[0] ?? '';
    expect(availableLine).toContain('Task.Status.DueSoon');
  });
});

// =============================================================================
// Change 3: VM behavioral — available/blocked semantics
// =============================================================================

describe('OMN-130 Change 3: VM behavioral — available reflects 4-status set', () => {
  const Task = {
    Status: {
      Dropped: 'Dropped',
      Available: 'Available',
      Blocked: 'Blocked',
      DueSoon: 'DueSoon',
      Next: 'Next',
      Overdue: 'Overdue',
    },
  };

  function makeTask(name: string, taskStatus: string) {
    return {
      id: { primaryKey: `id-${name}` },
      name,
      flagged: false,
      completed: false,
      taskStatus,
      inInbox: false,
      tags: [],
      dueDate: null,
      deferDate: null,
      containingProject: null,
      project: null,
      note: null,
    };
  }

  function runScript(script: string, tasks: unknown[]): { tasks: Array<Record<string, unknown>> } {
    const sandbox: Record<string, unknown> = { flattenedTasks: tasks, inbox: tasks, Task, JSON };
    return JSON.parse(vm.runInNewContext(script, sandbox) as string) as {
      tasks: Array<Record<string, unknown>>;
    };
  }

  it('Overdue task: available=true, blocked=false', () => {
    const tasks = [makeTask('overdue', Task.Status.Overdue)];
    const { script } = buildFilteredTasksScript(
      { dropped: false },
      { fields: ['id', 'name', 'available', 'blocked'], includeCompleted: false },
    );
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.available).toBe(true);
    expect(result.tasks[0]?.blocked).toBe(false);
  });

  it('DueSoon task: available=true, blocked=false', () => {
    const tasks = [makeTask('due-soon', Task.Status.DueSoon)];
    const { script } = buildFilteredTasksScript(
      { dropped: false },
      { fields: ['id', 'name', 'available', 'blocked'], includeCompleted: false },
    );
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.available).toBe(true);
    expect(result.tasks[0]?.blocked).toBe(false);
  });

  it('Next task: available=true, blocked=false', () => {
    const tasks = [makeTask('next', Task.Status.Next)];
    const { script } = buildFilteredTasksScript(
      { dropped: false },
      { fields: ['id', 'name', 'available', 'blocked'], includeCompleted: false },
    );
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.available).toBe(true);
    expect(result.tasks[0]?.blocked).toBe(false);
  });

  it('Available task: available=true, blocked=false', () => {
    const tasks = [makeTask('avail', Task.Status.Available)];
    const { script } = buildFilteredTasksScript(
      { dropped: false },
      { fields: ['id', 'name', 'available', 'blocked'], includeCompleted: false },
    );
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.available).toBe(true);
    expect(result.tasks[0]?.blocked).toBe(false);
  });

  it('Blocked task (deferred or sequential): available=false, blocked=true', () => {
    const tasks = [makeTask('deferred', Task.Status.Blocked)];
    const { script } = buildFilteredTasksScript(
      { dropped: false },
      { fields: ['id', 'name', 'available', 'blocked'], includeCompleted: false },
    );
    const result = runScript(script, tasks);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.available).toBe(false);
    expect(result.tasks[0]?.blocked).toBe(true);
  });

  it('available XOR blocked: Overdue is available NOT blocked', () => {
    const overdueTask = makeTask('overdue', Task.Status.Overdue);
    const blockedTask = makeTask('blocked', Task.Status.Blocked);
    const { script } = buildFilteredTasksScript(
      { dropped: false },
      { fields: ['id', 'name', 'available', 'blocked'], includeCompleted: false },
    );
    const result = runScript(script, [overdueTask, blockedTask]);
    expect(result.tasks).toHaveLength(2);
    const overdue = result.tasks.find((t) => t.name === 'overdue');
    const blocked = result.tasks.find((t) => t.name === 'blocked');
    expect(overdue?.available).toBe(true);
    expect(overdue?.blocked).toBe(false);
    expect(blocked?.available).toBe(false);
    expect(blocked?.blocked).toBe(true);
  });
});
