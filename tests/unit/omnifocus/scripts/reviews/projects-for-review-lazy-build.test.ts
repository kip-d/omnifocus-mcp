// tests/unit/omnifocus/scripts/reviews/projects-for-review-lazy-build.test.ts
// OMN-340 slice 2 (gate finding A) — the admission loop used to build the
// full projectObj (note, folder lookup, taskCounts, reviewInterval, …) for
// EVERY project that matched the review filter, before sorting and slicing
// to the `limit` (default 100) actually returned. Fix: the admission loop
// pushes only a slim record (the project reference + nextReviewDate); the
// full row is built AFTER the sort+slice, only for the rows the response
// actually returns.
import { describe, it, expect } from 'vitest';
import { buildProjectsForReviewScript } from '../../../../../src/omnifocus/scripts/reviews/projects-for-review.js';
import { runAnalyticsScript, FAKE_PROJECT_STATUS } from '../analytics/run-analytics-script.js';

const DAY = 24 * 60 * 60 * 1000;

describe('OMN-340 slice 2 (gate finding A) — full project row built only for the returned page', () => {
  it('reads project.note (a full-row-only field) exactly `limit` (100) times for 150 matches, not 150', () => {
    let noteAccessCount = 0;

    function makeLazyProject(id: string, nextReviewDate: Date): Record<string, unknown> {
      const project: Record<string, unknown> = {
        id: { primaryKey: id },
        name: `Project ${id}`,
        status: FAKE_PROJECT_STATUS.Active,
        flagged: false,
        parentFolder: null,
        dueDate: null,
        deferDate: null,
        lastReviewDate: null,
        nextReviewDate,
        reviewInterval: { unit: 'week', steps: 1 },
        sequential: false,
        completedByChildren: false,
      };
      // `note` is only ever read while building the full response row
      // (never during admission/classification) — a getter here proves
      // which phase actually touches it, and how many times.
      Object.defineProperty(project, 'note', {
        enumerable: true,
        get() {
          noteAccessCount++;
          return null;
        },
      });
      return project;
    }

    const projects = Array.from({ length: 150 }, (_, i) =>
      makeLazyProject(`p${i}`, new Date(Date.now() + (i + 1) * DAY)),
    );

    // Wide daysAhead so all 150 stubs match the review filter — isolates
    // "how many get the expensive full-row build" from "which ones match".
    const script = buildProjectsForReviewScript({ filter: { daysAhead: 100000 } });
    const parsed = runAnalyticsScript(script, {}, { flattenedProjects: projects }) as {
      success: boolean;
      projects: unknown[];
      metadata: { total_found: number; cap: number; capped: boolean };
    };

    expect(parsed.success).toBe(true);
    // review_summary / total_found still cover the whole matched population.
    expect(parsed.metadata.total_found).toBe(150);
    expect(parsed.metadata.cap).toBe(100);
    expect(parsed.metadata.capped).toBe(true);
    expect(parsed.projects).toHaveLength(100);

    // The expensive field was read once per RETURNED row, not once per
    // matched project — proving the full build runs after the cap.
    expect(noteAccessCount).toBe(100);
  });

  it('emitted text: the full-row builder is a function invoked after the sort+slice, never inside the admission loop', () => {
    const script = buildProjectsForReviewScript({ filter: {} });

    const sliceIndex = script.indexOf('const cappedProjects = projects.slice(0, limit);');
    const buildFnDeclIndex = script.indexOf('function buildProjectRow(project)');
    const buildFnCallIndex = script.lastIndexOf('buildProjectRow(');

    expect(sliceIndex).toBeGreaterThan(-1);
    expect(buildFnDeclIndex).toBeGreaterThan(-1);
    // The function must be declared after the slice (so it's visibly
    // scoped to post-cap work), and invoked after its own declaration.
    expect(buildFnDeclIndex).toBeGreaterThan(sliceIndex);
    expect(buildFnCallIndex).toBeGreaterThan(buildFnDeclIndex);

    // The admission loop (before the slice) must never construct the
    // full projectObj shape — `note`/`taskCounts` field-building lines
    // appear only once each, inside buildProjectRow, after the slice.
    const admissionLoopText = script.slice(0, sliceIndex);
    expect(admissionLoopText).not.toContain('projectObj.taskCounts');
    expect(admissionLoopText).not.toContain('if (project.note) projectObj.note = project.note;');
  });
});
