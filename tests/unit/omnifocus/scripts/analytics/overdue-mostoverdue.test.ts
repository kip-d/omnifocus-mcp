// tests/unit/omnifocus/scripts/analytics/overdue-mostoverdue.test.ts
// OMN-253 (OMN-148 drift D12) — summary.mostOverdue must be selected over the
// FULL overdue population (like oldestOverdueDate, tracked uncapped), not from
// the maxTasks-capped detail rows. Pre-fix it was overdueTasks[0] of the
// capped first-100 (DB order), so with >100 overdue the true global max could
// be missed. The detail arrays stay capped (payload size) — the OMN-187
// contract: caps gate DETAIL, never aggregates.
import { describe, it, expect } from 'vitest';
import { ANALYZE_OVERDUE_V3 } from '../../../../../src/omnifocus/scripts/analytics/analyze-overdue-v3.js';
import { OVERDUE_ANALYSIS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { runAnalyticsScript } from './run-analytics-script.js';

const DAY = 24 * 60 * 60 * 1000;

function makeOverdueTask(id: string, daysOverdue: number): Record<string, unknown> {
  return {
    id: { primaryKey: id },
    name: `Task ${id}`,
    taskStatus: 'available',
    dueDate: new Date(Date.now() - daysOverdue * DAY - 60_000),
    containingProject: { name: 'Fixture Project' },
    tags: [],
  };
}

function makeBadIdTask(daysOverdue: number): Record<string, unknown> {
  // No `id` — task.id.primaryKey throws inside the record builder, simulating
  // a record-build failure for the task holding the true global max.
  return {
    name: 'Bad ID task',
    taskStatus: 'available',
    dueDate: new Date(Date.now() - daysOverdue * DAY - 60_000),
    containingProject: { name: 'Fixture Project' },
    tags: [],
  };
}

function runScript(tasks: Array<Record<string, unknown>>): {
  ok: boolean;
  data: {
    summary: { totalOverdue: number; mostOverdue: { id: string; daysOverdue: number } | null };
    groupedByUrgency: Record<string, unknown[]>;
    metadata: { tasksAnalyzed: number };
  };
} {
  const options = { limit: 100, includeRecentlyCompleted: true, groupBy: 'project' };
  return runAnalyticsScript(ANALYZE_OVERDUE_V3, options, {
    flattenedTasks: tasks,
  }) as ReturnType<typeof runScript>;
}

describe('OMN-253 — summary.mostOverdue is full-population', () => {
  it('finds the true max even when it sits past the 100-row detail cap', () => {
    // 150 overdue tasks: indexes 0..149 overdue by 1..150 days EXCEPT the
    // global max (400 days) parked at DB index 120 — beyond the capped
    // first-100 the old selection could see.
    const tasks = Array.from({ length: 150 }, (_, i) => makeOverdueTask(`t${i}`, i + 1));
    tasks[120] = makeOverdueTask('the-global-max', 400);

    const parsed = runScript(tasks);
    expect(parsed.ok).toBe(true);
    expect(OVERDUE_ANALYSIS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.summary.totalOverdue).toBe(150);
    // Pre-fix: mostOverdue was the max of the first 100 in DB order (t99, 100
    // days) — the 400-day task at index 120 was invisible to the summary.
    expect(parsed.data.summary.mostOverdue?.id).toBe('the-global-max');
    expect(parsed.data.summary.mostOverdue?.daysOverdue).toBe(400);
    // The detail arrays stay capped: exactly 100 rows across the buckets.
    const detailRows = Object.values(parsed.data.groupedByUrgency).reduce((n, arr) => n + arr.length, 0);
    expect(detailRows).toBe(100);
    expect(parsed.data.metadata.tasksAnalyzed).toBe(100);
  });

  it('under the cap: mostOverdue matches the detail sort head (no behavior change)', () => {
    const tasks = [makeOverdueTask('a', 3), makeOverdueTask('b', 12), makeOverdueTask('c', 7)];
    const parsed = runScript(tasks);
    expect(parsed.data.summary.mostOverdue?.id).toBe('b');
    expect(parsed.data.summary.mostOverdue?.daysOverdue).toBe(12);
  });

  it('zero overdue: mostOverdue is null (regression pin)', () => {
    const parsed = runScript([]);
    expect(parsed.data.summary.mostOverdue).toBeNull();
    expect(parsed.data.summary.totalOverdue).toBe(0);
  });

  it('fails honest (null) rather than reviving the capped-head bug when the global-max record build throws', () => {
    // /code-review of #210/#212: catching a record-build failure and falling
    // back to overdueTasks[0] would silently revive the exact capped-head bug
    // OMN-253 fixes. A throw building the TRUE-max task's record must surface
    // as mostOverdue: null (an honest "couldn't build it"), never a
    // plausible-but-wrong capped answer.
    const tasks = [makeOverdueTask('a', 3), makeOverdueTask('b', 12), makeBadIdTask(400)];
    const parsed = runScript(tasks);
    expect(parsed.ok).toBe(true);
    expect(OVERDUE_ANALYSIS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.summary.totalOverdue).toBe(3); // full-population count unaffected
    expect(parsed.data.summary.mostOverdue).toBeNull(); // NOT 'b' (the capped head)
  });
});
