// tests/unit/omnifocus/scripts/analytics/productivity-terminal-states.test.ts
// OMN-254 (OMN-148 drift D5) — productivity_stats availableTasks/overdueCount
// must exclude DROPPED tasks (effective status, the OMN-187 predicate).
// Pre-fix the loop filtered only on task.completed, so dropped tasks — and
// tasks inside dropped/completed projects — counted as "available" and
// "overdue": the three-terminal-states violation.
import { describe, it, expect } from 'vitest';
import { PRODUCTIVITY_STATS_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/productivity-stats-v3.js';
import { PRODUCTIVITY_STATS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { runAnalyticsScript, FAKE_TASK_STATUS } from './run-analytics-script.js';

const DAY = 24 * 60 * 60 * 1000;

interface FakeTask {
  completed: boolean;
  taskStatus: unknown;
  dueDate: Date | null;
  deferDate: Date | null;
  completionDate: Date | null;
}

function task(overrides: Partial<FakeTask>): FakeTask {
  return {
    completed: false,
    taskStatus: FAKE_TASK_STATUS.Available,
    dueDate: null,
    deferDate: null,
    completionDate: null,
    ...overrides,
  };
}

function runScript(tasks: FakeTask[]): {
  ok: boolean;
  data: { summary: { totalTasks: number; completedTasks: number; availableTasks: number; overdueCount: number } };
} {
  const options = { period: 'week', includeProjectStats: false, includeTagStats: false };
  return runAnalyticsScript(PRODUCTIVITY_STATS_SCRIPT_V3, options, {
    flattenedTasks: tasks,
  }) as ReturnType<typeof runScript>;
}

describe('OMN-254 — three terminal states in productivity populations', () => {
  it('a dropped task (even overdue) counts in NEITHER availableTasks NOR overdueCount', () => {
    const parsed = runScript([
      task({}), // genuinely available
      task({ taskStatus: FAKE_TASK_STATUS.Dropped, dueDate: new Date(Date.now() - 5 * DAY) }), // dropped AND past-due
      task({ completed: true, completionDate: new Date() }),
    ]);
    expect(parsed.ok).toBe(true);
    expect(PRODUCTIVITY_STATS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.summary.totalTasks).toBe(3); // whole-DB census unchanged
    expect(parsed.data.summary.completedTasks).toBe(1);
    // Pre-fix: available 2 (dropped counted), overdue 1 (dropped past-due counted).
    expect(parsed.data.summary.availableTasks).toBe(1);
    expect(parsed.data.summary.overdueCount).toBe(0);
  });

  it('a task in a COMPLETED project (own .completed false, effective status Completed) counts in NEITHER population', () => {
    // /code-review of this PR: the guard excluded only Dropped, but the OMN-187
    // effective-status predicate is two-sided — a live task inside a completed
    // project resolves to taskStatus Completed and is just as terminal.
    const parsed = runScript([
      task({}), // genuinely available
      task({ taskStatus: FAKE_TASK_STATUS.Completed, dueDate: new Date(Date.now() - 5 * DAY) }), // in a completed project, past-due
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.summary.completedTasks).toBe(0); // own .completed stays false
    expect(parsed.data.summary.availableTasks).toBe(1);
    expect(parsed.data.summary.overdueCount).toBe(0);
  });

  it('an ACTIVE past-due task still counts overdue; blocked/deferred still excluded from available', () => {
    const parsed = runScript([
      task({ dueDate: new Date(Date.now() - 2 * DAY) }), // active + overdue
      task({ taskStatus: FAKE_TASK_STATUS.Blocked }),
      task({ deferDate: new Date(Date.now() + 5 * DAY) }), // future-deferred
    ]);
    expect(parsed.data.summary.overdueCount).toBe(1);
    expect(parsed.data.summary.availableTasks).toBe(1);
  });
});
