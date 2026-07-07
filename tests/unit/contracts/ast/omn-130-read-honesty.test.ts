/**
 * OMN-130: Read surface honesty tests
 *
 * Three changes tested here:
 *  1. hasNote in MINIMAL_FIELDS + generateFieldProjection
 *  2. smart_suggest description only (no logic assertions — tested in task-query-pipeline)
 *  3. available redefined as "actionable now" (Available | DueSoon | Next | Overdue)
 *     — projection AND filter-side emitter use the same shared ACTIONABLE_STATUSES constant
 *
 * Plus code-review follow-ups (#3, #4):
 *  #3: smart_suggest auto-injects 'available' into scriptFields (reliable scoring)
 *  #4: hasNote comment corrected (materializes full note string, not a lazy API)
 *
 * VM behavioral tests use node:vm to confirm the generated OmniJS code behaves
 * correctly when evaluated with stub task objects, confirming the generated
 * artifact — not just the script text.
 */

import { describe, it, expect } from 'vitest';
import { Task, stubTask, runListScript } from './omnijs-vm-fixture.js';
import { buildFilteredTasksScript, MINIMAL_FIELDS } from '../../../../src/contracts/ast/script-builder.js';
import { TaskFieldEnum } from '../../../../src/tools/unified/schemas/read-schema.js';
import { TaskRowSchema } from '../../../../src/omnifocus/script-response-schemas.js';
import { scoreForSmartSuggest } from '../../../../src/tools/tasks/task-query-pipeline.js';
import type { OmniFocusTask } from '../../../../src/omnifocus/types.js';

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
  // Task.Status comes from the shared omnijs-vm-fixture — extend it THERE, not locally
  const makeTask = (name: string, note: string | null, taskStatus: string = Task.Status.Available) =>
    stubTask(name, { note, taskStatus });
  const runScript = runListScript;

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
  const makeTask = (name: string, taskStatus: string) => stubTask(name, { taskStatus });
  const runScript = runListScript;

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

// =============================================================================
// #1 (review follow-up) — ACTIONABLE_STATUSES shared constant used in projection
// =============================================================================

describe('OMN-130 #1: ACTIONABLE_STATUSES shared constant used in projection', () => {
  it('available projection references all 4 actionable statuses (same set as filter-side)', () => {
    // Verify the projection uses the shared set — if ACTIONABLE_STATUSES is updated,
    // both the WHERE and SELECT sides must change together.
    const result = buildFilteredTasksScript({}, { fields: ['available'] });
    expect(result.script).toContain('Task.Status.Available');
    expect(result.script).toContain('Task.Status.DueSoon');
    expect(result.script).toContain('Task.Status.Next');
    expect(result.script).toContain('Task.Status.Overdue');
  });
});

// =============================================================================
// #3 (review follow-up) — smart_suggest auto-injects 'available' into scriptFields
// =============================================================================

describe('OMN-130 #3: smart_suggest scoring uses available field (injected into scriptFields)', () => {
  // scoreForSmartSuggest uses task.available to award +30 pts.
  // With the broadened projection, Overdue/DueSoon/Next tasks now get available:true
  // from the script. This test confirms the scoring logic responds to the available field.

  function makeTask(overrides: Partial<OmniFocusTask>): OmniFocusTask {
    return {
      id: 'test-id',
      name: 'Test task',
      completed: false,
      flagged: false,
      available: false,
      dueDate: undefined,
      deferDate: undefined,
      tags: [],
      ...overrides,
    } as OmniFocusTask;
  }

  it('overdue task with available:true scores higher than one with available:false', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const overdueAvailable = makeTask({ name: 'avail', dueDate: yesterday.toISOString(), available: true });
    const overdueNotAvailable = makeTask({ name: 'blocked', dueDate: yesterday.toISOString(), available: false });

    // scoreForSmartSuggest returns top-N tasks sorted by score
    const result = scoreForSmartSuggest([overdueAvailable, overdueNotAvailable], 10);
    // Both should appear (both have score > 0 from overdue bonus)
    expect(result.length).toBe(2);
    // The available one should rank first (100 + days_overdue*10 + 30 > 100 + days_overdue*10)
    expect(result[0]?.name).toBe('avail');
  });

  it('smart_suggest scriptFields include available — default MINIMAL_FIELDS already contains it', () => {
    // MINIMAL_FIELDS now contains 'available', so even without explicit fields injection,
    // a default smart_suggest script will carry the available projection.
    // This is the belt: the suspenders is the explicit injection in buildTaskQuery.
    expect(MINIMAL_FIELDS).toContain('available');
  });
});
