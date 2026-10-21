// tests/unit/omnifocus/scripts/reviews/projects-for-review-sort-before-cap.test.ts
// OMN-340 slice 2 (D1/D5) — projects-for-review.ts used to cap in
// flattenedProjects' DB-encounter order, sorting by nextReviewDate only
// AFTER the maxTasks=100 cap, so the detail array held 100 arbitrary
// matching projects rather than the 100 nearest-due. The fix: collect EVERY
// matching project uncapped, sort by nextReviewDate, THEN slice to the cap
// — same sort-before-slice principle as overdue_analysis (slice 1).
import { describe, it, expect } from 'vitest';
import { buildProjectsForReviewScript } from '../../../../../src/omnifocus/scripts/reviews/projects-for-review.js';
import { runAnalyticsScript, FAKE_PROJECT_STATUS } from '../analytics/run-analytics-script.js';

const DAY = 24 * 60 * 60 * 1000;

function makeProject(id: string, nextReviewDate: Date): Record<string, unknown> {
  return {
    id: { primaryKey: id },
    name: `Project ${id}`,
    status: FAKE_PROJECT_STATUS.Active,
    flagged: false,
    note: null,
    parentFolder: null,
    dueDate: null,
    deferDate: null,
    lastReviewDate: null,
    nextReviewDate,
    reviewInterval: { unit: 'week', steps: 1 },
    sequential: false,
    completedByChildren: false,
  };
}

interface ScriptResult {
  success: boolean;
  projects: Array<{ id: string; nextReviewDate?: string }>;
  metadata: {
    total_found: number;
    capped: boolean;
    cap: number;
    review_summary: {
      total_projects: number;
      overdue: number;
      due_today: number;
      due_soon: number;
      no_schedule: number;
    };
  };
}

describe('OMN-340 — list_for_review sorts before the cap (D1/D5)', () => {
  // 150 stub projects. DB order (index 0..149): index 149 ("the-earliest")
  // has the EARLIEST nextReviewDate (most overdue for review); indices 0..148
  // have progressively later dates. A pre-fix cap-in-DB-order-then-sort
  // implementation would never see index 149's project in its capped sample
  // at all (it is encountered last, position 150 of 150, past the 100-row
  // cap) — proving the fix must collect everything before capping.
  const projects = Array.from({ length: 149 }, (_, i) => makeProject(`p${i}`, new Date(Date.now() + (i + 2) * DAY)));
  projects.push(makeProject('the-earliest', new Date(Date.now() - DAY)));

  // Wide daysAhead so every one of the 150 stub projects matches the review
  // filter (shouldInclude's daysUntilReview <= daysAhead), regardless of how
  // far out its nextReviewDate sits — isolates the sort-before-cap behavior
  // from the separate "which projects match" admission question.
  function run(): ScriptResult {
    const script = buildProjectsForReviewScript({ filter: { daysAhead: 100000 } });
    return runAnalyticsScript(script, {}, { flattenedProjects: projects }) as ScriptResult;
  }

  it('total_found is the TRUE pre-cap count of every matching project', () => {
    const parsed = run();
    expect(parsed.success).toBe(true);
    expect(parsed.metadata.total_found).toBe(150);
  });

  it('returns only the cap (100), not all 150', () => {
    const parsed = run();
    expect(parsed.projects.length).toBe(100);
    expect(parsed.metadata.cap).toBe(100);
    expect(parsed.metadata.capped).toBe(true);
  });

  it('the earliest nextReviewDate project (DB index 149, last encountered) sorts to the FRONT of the capped detail', () => {
    const parsed = run();
    expect(parsed.projects[0].id).toBe('the-earliest');
  });

  it('review_summary counts the WHOLE matched population (150), not the capped 100', () => {
    const parsed = run();
    expect(parsed.metadata.review_summary.total_projects).toBe(150);
  });
});

describe('OMN-340 — detail slice follows the sort (emitted-text assertion)', () => {
  it('sorts projects by nextReviewDate BEFORE slicing to the cap, and the admission loop never caps early', () => {
    const script = buildProjectsForReviewScript({ filter: {} });

    // The pre-fix bug: `if (projects.length >= limit) return;` inside the
    // forEach admission loop capped in DB order before the sort ever ran.
    expect(script).not.toContain('if (projects.length >= limit) return;');

    const sortIndex = script.indexOf('projects.sort((a, b) => {');
    const sliceIndex = script.indexOf('const cappedProjects = projects.slice(0, limit);');
    expect(sortIndex).toBeGreaterThan(-1);
    expect(sliceIndex).toBeGreaterThan(-1);
    expect(sliceIndex).toBeGreaterThan(sortIndex);

    // The response's `projects` field must read from the capped array, never
    // the full uncapped `projects` collection.
    const returnIndex = script.indexOf('projects: cappedProjects,');
    expect(returnIndex).toBeGreaterThan(sliceIndex);
  });
});
