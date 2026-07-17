// tests/unit/omnifocus/scripts/analytics/workflow-root-skip.test.ts
// OMN-270 — workflow_analysis's "skip project tasks" gate read
// task.numberOfTasks, which is undefined in OmniJS (live-probed 2026-07-16),
// so the gate never fired: every project ROOT task (present in the global
// flattenedTasks, and reading as actionable) was counted in task-level
// metrics — inflating per-project totals and the available counters.
// The real OmniJS root-task marker is a non-null task.project (PR #227,
// live-caught: counting roots turned 12 of 13 stalled projects "healthy").
//
// Also pins the OMN-270 dead-API class out of the script text entirely:
// PHASE 1 "accurate counts" (project.rootTask + numberOf* reads) never
// produced data and is deleted, not fixed — its consumer (the
// omniFocusAvailable branch) only ever shipped the fallback path.
import { describe, it, expect } from 'vitest';
import { WORKFLOW_ANALYSIS_V3 } from '../../../../../src/omnifocus/scripts/analytics/workflow-analysis-v3.js';
import { runAnalyticsScript, FAKE_TASK_STATUS } from './run-analytics-script.js';

interface FakeTask {
  completed: boolean;
  flagged: boolean;
  taskStatus: unknown;
  dueDate: Date | null;
  deferDate: Date | null;
  added: Date | null;
  modified: Date | null;
  estimatedMinutes: number;
  inInbox: boolean;
  /** Non-null marks a project ROOT task (the live OmniJS marker). */
  project: object | null;
  containingProject: { name: string } | null;
  tags: Array<{ name: string }>;
  name: string;
  id: { primaryKey: string };
}

function task(overrides: Partial<FakeTask>): FakeTask {
  return {
    completed: false,
    flagged: false,
    taskStatus: FAKE_TASK_STATUS.Available,
    dueDate: null,
    deferDate: null,
    added: null,
    modified: null,
    estimatedMinutes: 0,
    inInbox: false,
    project: null,
    containingProject: { name: 'P' },
    tags: [],
    name: 'Fixture task',
    id: { primaryKey: 't1' },
    ...overrides,
  };
}

function runScript(tasks: FakeTask[]): {
  ok: boolean;
  data: {
    totalTasks: number;
    patterns: {
      workloadDistribution: { byProject: Record<string, { totalTasks: number }> };
      workflowMetrics: { availablePercentage: number };
    };
  };
} {
  const options = {
    analysisDepth: 'full',
    focusAreas: ['productivity', 'workload', 'bottlenecks'],
    maxInsights: 15,
    includeRawData: false,
  };
  return runAnalyticsScript(WORKFLOW_ANALYSIS_V3, options, { flattenedTasks: tasks }) as ReturnType<typeof runScript>;
}

describe('OMN-270 — workflow_analysis skips project root tasks in task-level metrics', () => {
  it('a project root task counts in neither numerators nor the percentage denominator', () => {
    const parsed = runScript([
      task({ project: { marker: true }, name: 'P (root)' }), // root: reads as actionable
      task({ name: 'leaf available' }),
      task({ name: 'leaf blocked', taskStatus: FAKE_TASK_STATUS.Blocked }),
    ]);
    expect(parsed.ok).toBe(true);

    // Pre-fix: the root was processed as a task → per-project total 3 and
    // availablePercentage 66.7 (root + available leaf, over 3).
    expect(parsed.data.patterns.workloadDistribution.byProject['P'].totalTasks).toBe(2);
    // /code-review of this PR (round 1): the denominator must move WITH the
    // numerators — skipping roots only in the counters while totalTasks kept
    // counting them understated every workflowMetrics percentage (the OMN-200
    // numerator/denominator-agreement lesson, re-learned). 1 available of 2
    // real tasks is 50%, not 33.3% (over 3 including the root).
    expect(parsed.data.patterns.workflowMetrics.availablePercentage).toBe(50);
    expect(parsed.data.totalTasks).toBe(2);
  });

  it('the script text no longer references the JXA-only count API (dead in OmniJS)', () => {
    expect(WORKFLOW_ANALYSIS_V3).not.toMatch(/rootTask|numberOfTasks|numberOfAvailableTasks|numberOfCompletedTasks/);
  });
});
