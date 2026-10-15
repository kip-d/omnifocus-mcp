// tests/unit/omnifocus/scripts/analytics/overdue-uncapped-aggregates.test.ts
// OMN-340 slice 1 (overdue_analysis) — urgency bucket counts and per-project
// overdue totals must be computed over the WHOLE overdue population, inside
// the uncapped aggregate pass (OMN-187's totalOverdue/avgDaysOverdue/etc.),
// never from the maxTasks-capped detail sample. Detail arrays (groupedByUrgency's
// per-bucket task lists) hold only the N MOST overdue — collected uncapped,
// sorted by daysOverdue desc, THEN sliced to the cap (D1a) — not the first N
// encountered in DB order.
import { describe, it, expect } from 'vitest';
import { ANALYZE_OVERDUE_V3 } from '../../../../../src/omnifocus/scripts/analytics/analyze-overdue-v3.js';
import { OVERDUE_ANALYSIS_V3_SCHEMA } from '../../../../../src/omnifocus/response-schemas/analyze.js';
import { runAnalyticsScript, FAKE_TASK_STATUS } from './run-analytics-script.js';

const DAY = 24 * 60 * 60 * 1000;
const PROJECTS = ['Project A', 'Project B', 'Project C'];

function makeOverdueTask(id: string, daysOverdue: number, project: string): Record<string, unknown> {
  return {
    id: { primaryKey: id },
    name: `Task ${id}`,
    taskStatus: FAKE_TASK_STATUS.Available,
    dueDate: new Date(Date.now() - daysOverdue * DAY - 60_000),
    containingProject: { name: project },
    tags: [],
  };
}

interface ScriptResult {
  ok: boolean;
  data: {
    summary: { totalOverdue: number };
    groupedByUrgency: Record<string, Array<{ id: string; daysOverdue: number }>>;
    urgencyCounts: { critical: number; high: number; medium: number; low: number };
    projectBottlenecks: Array<{ name: string; overdueCount: number }>;
    metadata: { tasksAnalyzed: number };
  };
}

function runScript(tasks: Array<Record<string, unknown>>): ScriptResult {
  return runAnalyticsScript(ANALYZE_OVERDUE_V3, { limit: 100 }, { flattenedTasks: tasks }) as ScriptResult;
}

describe('OMN-340 — overdue_analysis urgency/project aggregates are uncapped', () => {
  // 150 overdue tasks, daysOverdue 1..150, round-robin across 3 projects (50
  // each). The single most-overdue task (500 days) sits at DB index 140 —
  // well past the 100-row detail cap in DB-encounter order, proving the
  // detail must be sort-then-slice, not first-100-then-sort.
  const tasks = Array.from({ length: 150 }, (_, i) => makeOverdueTask(`t${i}`, i + 1, PROJECTS[i % PROJECTS.length]));
  tasks[140] = makeOverdueTask('the-most-overdue', 500, PROJECTS[140 % PROJECTS.length]);

  it('bucket counts sum to totalOverdue and match the uncapped full-population split', () => {
    const parsed = runScript(tasks);
    expect(parsed.ok).toBe(true);
    expect(OVERDUE_ANALYSIS_V3_SCHEMA.safeParse(parsed).success).toBe(true);
    expect(parsed.data.summary.totalOverdue).toBe(150);

    const { urgencyCounts } = parsed.data;
    // low: daysOverdue 1-2 (2 tasks); medium: 3-7 (5); high: 8-30 (23);
    // critical: 31+ (the-most-overdue's 500 plus days 31..150, 120 tasks).
    expect(urgencyCounts.low).toBe(2);
    expect(urgencyCounts.medium).toBe(5);
    expect(urgencyCounts.high).toBe(23);
    expect(urgencyCounts.critical).toBe(120);
    expect(urgencyCounts.critical + urgencyCounts.high + urgencyCounts.medium + urgencyCounts.low).toBe(
      parsed.data.summary.totalOverdue,
    );
  });

  it('per-project overdue totals are exact over the full population, not the capped sample', () => {
    const parsed = runScript(tasks);
    const byName = Object.fromEntries(parsed.data.projectBottlenecks.map((p) => [p.name, p.overdueCount]));
    // Every project has exactly 50 overdue tasks (150 / 3), even though only
    // 100 of the 150 tasks survive the detail cap.
    for (const name of PROJECTS) {
      expect(byName[name]).toBe(50);
    }
  });

  it('the most-overdue task (DB index 140, beyond the 100-row cap in DB order) appears in the detail', () => {
    const parsed = runScript(tasks);
    const detailRows = Object.values(parsed.data.groupedByUrgency).flat();
    expect(detailRows.length).toBe(100);
    expect(parsed.data.metadata.tasksAnalyzed).toBe(100);

    const found = detailRows.find((t) => t.id === 'the-most-overdue');
    expect(found).toBeTruthy();
    expect(found?.daysOverdue).toBe(500);
    // It is the single most overdue task, so it is sorted to the very front
    // of the critical bucket (the first bucket populated from the sorted set).
    expect(parsed.data.groupedByUrgency.critical[0].id).toBe('the-most-overdue');
  });
});

describe('OMN-340 — detail slice follows the sort (emitted-text assertion)', () => {
  it('sorts overdueTasks by daysOverdue BEFORE slicing to maxTasks', () => {
    // norms_testing_empirical §emission_not_execution: assert the emitted
    // script text applies the cap strictly after the sort, not before —
    // guards against a future edit reviving the pre-OMN-340 "cap during the
    // per-task loop, sort afterward" bug (which capped in DB order).
    const sortIndex = ANALYZE_OVERDUE_V3.indexOf('overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);');
    const sliceIndex = ANALYZE_OVERDUE_V3.indexOf('const cappedOverdueTasks = overdueTasks.slice(0, maxTasks);');

    expect(sortIndex).toBeGreaterThan(-1);
    expect(sliceIndex).toBeGreaterThan(-1);
    expect(sliceIndex).toBeGreaterThan(sortIndex);

    // The detail-bucketing loop (groupedByUrgency) must read from the CAPPED
    // array, never the full uncapped `overdueTasks`.
    const groupingLoopIndex = ANALYZE_OVERDUE_V3.indexOf('for (let i = 0; i < cappedOverdueTasks.length; i++) {');
    expect(groupingLoopIndex).toBeGreaterThan(sliceIndex);
  });
});
