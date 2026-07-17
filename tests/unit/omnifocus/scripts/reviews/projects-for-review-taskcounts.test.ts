// tests/unit/omnifocus/scripts/reviews/projects-for-review-taskcounts.test.ts
// OMN-270 — projects_for_review's taskCounts read numberOfTasks /
// numberOfAvailableTasks / numberOfCompletedTasks on the project root task.
// All three are undefined in OmniJS (live-probed 2026-07-16), so every
// project serialized taskCounts as {} — the review context the field exists
// to provide never shipped.
//
// Replacement formulas: see productivity-project-counts.test.ts (same
// live-probed parity set).
import { describe, it, expect } from 'vitest';
import { buildProjectsForReviewScript } from '../../../../../src/omnifocus/scripts/reviews/projects-for-review.js';
import { runAnalyticsScript, FAKE_PROJECT_STATUS } from '../analytics/run-analytics-script.js';

interface FakeTask {
  completed: boolean;
  taskStatus: string;
  /** Non-null marks a project ROOT task (the live OmniJS marker). */
  project: object | null;
  containingProject: { id: { primaryKey: string } } | null;
}

function task(overrides: Partial<FakeTask>): FakeTask {
  return {
    completed: false,
    taskStatus: 'available',
    project: null,
    containingProject: { id: { primaryKey: 'p1' } },
    ...overrides,
  };
}

function makeProject(children: FakeTask[]): Record<string, unknown> {
  return {
    id: { primaryKey: 'p1' },
    name: 'Review Me',
    status: FAKE_PROJECT_STATUS.Active,
    flagged: false,
    note: null,
    parentFolder: null,
    dueDate: null,
    deferDate: null,
    lastReviewDate: null,
    nextReviewDate: null,
    reviewInterval: null,
    sequential: false,
    completedByChildren: false,
    task: { children },
  };
}

interface ReviewProject {
  name: string;
  taskCounts?: { total: number; available: number; completed: number };
}

describe('OMN-270 — projects_for_review emits real taskCounts', () => {
  it('taskCounts carries total/available/completed instead of serializing as {}', () => {
    const done = task({ completed: true, taskStatus: 'completed' });
    const open = task({});
    const root = task({ project: { marker: true } }); // actionable-reading root: must not count

    const script = buildProjectsForReviewScript({ filter: {} });
    const parsed = runAnalyticsScript(
      script,
      {},
      {
        flattenedTasks: [root, done, open],
        flattenedProjects: [makeProject([done, open])],
      },
    ) as { success: boolean; projects: ReviewProject[] };

    expect(parsed.success).toBe(true);
    expect(parsed.projects).toHaveLength(1);
    // Pre-fix: all three values were undefined → JSON.stringify dropped the
    // keys and taskCounts arrived as {}.
    expect(parsed.projects[0].taskCounts).toEqual({ total: 2, available: 1, completed: 1 });
  });

  it('the script text no longer references the JXA-only count API (dead in OmniJS)', () => {
    const script = buildProjectsForReviewScript({ filter: {} });
    expect(script).not.toMatch(/rootTask|numberOfTasks|numberOfAvailableTasks|numberOfCompletedTasks/);
  });
});
