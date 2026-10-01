// OMN-339 — workflow_analysis classified a task as overdue on
// `dueDate && !task.completed`. Dropped tasks (and tasks inside dropped
// projects, whose effective taskStatus is Dropped) keep completed === false,
// so they inflated overdueTasks / overduePercentage / timeBuckets / per-project
// overdueRate, and inbox counts. productivity_stats and overdue_analysis
// already gate on TERMINAL_STATUS_HELPER (OMN-254/OMN-187); this pins the same
// definition here so the ops agree on "overdue" for one database.
import { describe, it, expect } from 'vitest';
import { WORKFLOW_ANALYSIS_V3 } from '../../../../../src/omnifocus/scripts/analytics/workflow-analysis-v3.js';
import { TERMINAL_STATUS_HELPER } from '../../../../../src/omnifocus/scripts/shared/helpers.js';
import {
  runAnalyticsScript,
  FAKE_TASK_STATUS,
  fakeWorkflowTask as task,
  type FakeWorkflowTask,
} from './run-analytics-script.js';

const DAY = 24 * 60 * 60 * 1000;

interface WorkflowOut {
  totalTasks: number;
  patterns: {
    workflowMetrics: { overduePercentage: number; inboxPercentage: number };
    workloadDistribution: {
      byProject: Record<string, { overdueRate: number }>;
      timeBuckets: Record<string, number>;
    };
  };
}

function run(tasks: FakeWorkflowTask[]): WorkflowOut {
  const out = runAnalyticsScript(WORKFLOW_ANALYSIS_V3, { includeRawData: false }, { flattenedTasks: tasks }) as {
    data: WorkflowOut;
  };
  return out.data;
}

describe('OMN-339 — workflow_analysis excludes terminal-status tasks from overdue and inbox', () => {
  it('splices the shared terminal helper and gates the overdue branch on it', () => {
    expect(WORKFLOW_ANALYSIS_V3).toContain(TERMINAL_STATUS_HELPER);
    expect(WORKFLOW_ANALYSIS_V3).toContain('const terminal = isTerminalStatus(task.taskStatus);');
    expect(WORKFLOW_ANALYSIS_V3).toContain('if (dueDate && !terminal) {');
  });

  it('a dropped task (or a task in a dropped project) with a past due date is not overdue', () => {
    const pastDue = new Date(Date.now() - 10 * DAY);
    const out = run([
      task({ id: { primaryKey: 'live' }, dueDate: pastDue }),
      task({ id: { primaryKey: 'dropped' }, dueDate: pastDue, taskStatus: FAKE_TASK_STATUS.Dropped }),
      task({ id: { primaryKey: 'done-status' }, dueDate: pastDue, taskStatus: FAKE_TASK_STATUS.Completed }),
      task({ id: { primaryKey: 'future' }, dueDate: new Date(Date.now() + 10 * DAY) }),
    ]);

    expect(out.totalTasks).toBe(4);
    // Only 'live' is overdue: 1 of 4.
    expect(out.patterns.workflowMetrics.overduePercentage).toBe(25);
    expect(out.patterns.workloadDistribution.byProject.P.overdueRate).toBe(25);
  });

  // Live verify (2026-10-01) found workflow overdue 155 vs overdue_analysis
  // totalOverdue 157: workflow counted a task only once Math.floor(daysPast) > 0,
  // so a task 1-23 hours past due was not overdue. OmniFocus (and
  // overdue_analysis) treat any past due time as overdue.
  it('a task past due by less than a day is overdue', () => {
    const out = run([
      task({ id: { primaryKey: 'hours-late' }, dueDate: new Date(Date.now() - 6 * 60 * 60 * 1000) }),
      task({ id: { primaryKey: 'future' }, dueDate: new Date(Date.now() + 10 * DAY) }),
    ]);

    expect(out.patterns.workflowMetrics.overduePercentage).toBe(50);
    expect(out.patterns.workloadDistribution.byProject.P.overdueRate).toBe(50);
  });

  // /code-review on #287: timeBuckets fell through on overdueDays, so every
  // non-overdue task (future-due, no due date, terminal) landed in '0-1 days'.
  // The buckets are overdue-age clusters ("Most overdue tasks cluster in…").
  it('timeBuckets count only overdue tasks, by how late they are', () => {
    const out = run([
      task({ id: { primaryKey: 'hours-late' }, dueDate: new Date(Date.now() - 6 * 60 * 60 * 1000) }),
      task({ id: { primaryKey: 'ten-days' }, dueDate: new Date(Date.now() - 10 * DAY) }),
      task({ id: { primaryKey: 'future' }, dueDate: new Date(Date.now() + 10 * DAY) }),
      task({ id: { primaryKey: 'no-due' } }),
      task({
        id: { primaryKey: 'dropped-old' },
        dueDate: new Date(Date.now() - 400 * DAY),
        taskStatus: FAKE_TASK_STATUS.Dropped,
      }),
    ]);

    expect(out.patterns.workloadDistribution.timeBuckets).toEqual({
      '0-1 days': 1,
      '1-3 days': 0,
      '3-7 days': 0,
      '1-2 weeks': 1,
      '2-4 weeks': 0,
      '1-3 months': 0,
      '3+ months': 0,
    });
  });

  it('a dropped inbox task is not counted in the inbox', () => {
    const out = run([
      task({ id: { primaryKey: 'inbox-live' }, inInbox: true, containingProject: null }),
      task({
        id: { primaryKey: 'inbox-dropped' },
        inInbox: true,
        containingProject: null,
        taskStatus: FAKE_TASK_STATUS.Dropped,
      }),
    ]);

    expect(out.patterns.workflowMetrics.inboxPercentage).toBe(50);
  });
});
