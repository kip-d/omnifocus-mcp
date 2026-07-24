// tests/unit/omnifocus/scripts/analytics/nonroot-population.test.ts
// OMN-290 (OMN-148 D11/D15) — "project root rows are never tasks in analytics."
// flattenedTasks includes each project's ROOT task; a non-null task.project is
// the live root marker (PR #227). Pre-fix, overdue_analysis counted roots in
// BOTH totalActive and the overdue numerator, productivity counted them in
// every summary census field, and task_velocity counted a completed project's
// root as a completed task. workflow_analysis already skips roots (OMN-270) —
// these tests bring the other three ops onto the same population rule.
import { describe, it, expect } from 'vitest';
import { PRODUCTIVITY_STATS_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/productivity-stats-v3.js';
import { TASK_VELOCITY_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/task-velocity-v3.js';
import { ANALYZE_OVERDUE_V3 } from '../../../../../src/omnifocus/scripts/analytics/analyze-overdue-v3.js';
import {
  PRODUCTIVITY_STATS_V3_SCHEMA,
  TASK_VELOCITY_V3_SCHEMA,
  OVERDUE_ANALYSIS_V3_SCHEMA,
} from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { stubTask } from '../../../contracts/ast/omnijs-vm-fixture.js';
import { runAnalyticsScript } from './run-analytics-script.js';

const DAY_MS = 86400000;
const now = Date.now();

/** A project ROOT row as it appears in flattenedTasks: task.project non-null.
 * Deliberately given "polluting" attributes (overdue due date, in-range
 * completion) so inclusion in any counter makes a test fail. */
function rootRow(name: string, extra: Record<string, unknown> = {}): unknown {
  return {
    ...stubTask(name),
    project: { name },
    dueDate: new Date(now - 10 * DAY_MS),
    ...extra,
  };
}

function child(name: string, extra: Record<string, unknown> = {}): unknown {
  return { ...stubTask(name), ...extra };
}

function isoDay(offsetDays: number): string {
  return new Date(now + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

describe('OMN-290 — non-root population everywhere', () => {
  it('productivity_stats: summary census fields exclude project root rows', () => {
    const db = {
      flattenedTasks: [
        // Root: not completed, overdue, available-looking — would pollute
        // totalTasks, availableTasks AND overdueCount if counted.
        rootRow('Project Alpha'),
        child('done in period', { completed: true, completionDate: new Date(now - DAY_MS) }),
        child('overdue leaf', { dueDate: new Date(now - 2 * DAY_MS) }),
      ],
    };
    const parsed = runAnalyticsScript(
      PRODUCTIVITY_STATS_SCRIPT_V3,
      { period: 'week', includeProjectStats: false, includeTagStats: false },
      db,
    ) as {
      ok: boolean;
      data: {
        summary: {
          totalTasks: number;
          completedTasks: number;
          completedInPeriod: number;
          availableTasks: number;
          overdueCount: number;
        };
      };
    };
    expect(parsed.ok).toBe(true);
    expect(PRODUCTIVITY_STATS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.summary.totalTasks).toBe(2); // root excluded
    expect(parsed.data.summary.completedTasks).toBe(1);
    expect(parsed.data.summary.completedInPeriod).toBe(1);
    expect(parsed.data.summary.overdueCount).toBe(1); // root's overdue dueDate NOT counted
    expect(parsed.data.summary.availableTasks).toBe(1); // the open leaf only; root NOT counted
  });

  it('overdue_analysis: totalActive and the overdue numerator exclude root rows', () => {
    const db = {
      flattenedTasks: [
        rootRow('Project Beta'), // active + overdue-looking root
        child('overdue leaf', { dueDate: new Date(now - 3 * DAY_MS) }),
        child('future leaf', { dueDate: new Date(now + 3 * DAY_MS) }),
      ],
    };
    const parsed = runAnalyticsScript(ANALYZE_OVERDUE_V3, { limit: 100 }, db) as {
      ok: boolean;
      data: { summary: { totalOverdue: number; totalActive: number; overduePercentage: number } };
    };
    expect(parsed.ok).toBe(true);
    expect(OVERDUE_ANALYSIS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.summary.totalActive).toBe(2); // root excluded from denominator
    expect(parsed.data.summary.totalOverdue).toBe(1); // root's past due date NOT an overdue task
    expect(parsed.data.summary.overduePercentage).toBe(50);
  });

  it('task_velocity: completed roots are not throughput; tasksAnalyzed is the non-root population', () => {
    const db = {
      flattenedTasks: [
        // Completed project: its root row carries an in-range completionDate.
        rootRow('Project Gamma', { completed: true, completionDate: new Date(now - DAY_MS) }),
        child('completed leaf', { completed: true, completionDate: new Date(now - DAY_MS) }),
        child('open leaf'),
      ],
    };
    const parsed = runAnalyticsScript(
      TASK_VELOCITY_SCRIPT_V3,
      { period: 'day', startDate: isoDay(-7), endDate: isoDay(0) },
      db,
    ) as {
      ok: boolean;
      data: { throughput: { totalCompleted: number }; breakdown: { tasksAnalyzed: number } };
    };
    expect(parsed.ok).toBe(true);
    expect(TASK_VELOCITY_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.throughput.totalCompleted).toBe(1); // root's completion excluded
    expect(parsed.data.breakdown.tasksAnalyzed).toBe(2); // analyzed population, not collection length
  });
});
