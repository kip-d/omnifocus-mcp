// tests/unit/contracts/ast/mutation/mark-reviewed.test.ts
// OMN-106 PR-1 — golden-first migration of mark-project-reviewed to the AST
// mutation pipeline. Per the ticket mandate, these goldens pin CURRENT (legacy)
// behavior with exact expected JSON — not old-vs-new equality — so the port
// happens behind them ([[feedback_parity_test_tautology]]).
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { buildMarkProjectReviewedScript } from '../../../../../src/omnifocus/scripts/reviews.js';
import { MARK_REVIEWED_TYPED_SCHEMA } from '../../../../../src/omnifocus/response-schemas/write.js';

// ── Fixture: a fake OmniFocus project + the two-layer vm execution ──────────
// The legacy script is a JXA wrapper that sends its OmniJS body through
// app.evaluateJavascript; the sandbox mirrors that boundary so the SAME
// harness can execute the post-port launcher unchanged.

interface FakeProject {
  id: { primaryKey: string };
  name: string;
  lastReviewDate: Date | null;
  nextReviewDate: Date | null;
  reviewInterval: { unit: { name: string }; steps: number } | null;
}

function makeProject(reviewInterval: FakeProject['reviewInterval']): FakeProject {
  return {
    id: { primaryKey: 'p1' },
    name: 'Fixture',
    lastReviewDate: null,
    nextReviewDate: null,
    reviewInterval,
  };
}

function runScript(script: string, project: FakeProject | null): unknown {
  const inner = { Project: { byIdentifier: () => project }, JSON };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string);
}

const REVIEW_DATE = '2026-07-01T12:00:00.000Z';

describe('mark-project-reviewed — behavior goldens (exact JSON, vm-executed)', () => {
  it('with a months interval: sets lastReviewDate, advances nextReviewDate, exact envelope', () => {
    const project = makeProject({ unit: { name: 'months' }, steps: 2 });
    const script = buildMarkProjectReviewedScript({
      projectId: 'p1',
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, project);

    expect(parsed).toEqual({
      success: true,
      project: {
        id: 'p1',
        name: 'Fixture',
        lastReviewDate: REVIEW_DATE,
        nextReviewDate: '2026-09-01T12:00:00.000Z',
        reviewInterval: { unit: 'months', steps: 2 },
      },
      changes: [
        `Last review date set to ${REVIEW_DATE}`,
        'Next review date calculated and set to 2026-09-01T12:00:00.000Z',
      ],
      message: "Project 'Fixture' marked as reviewed",
    });
    // The mutations actually landed on the object, not just the echo.
    expect(project.lastReviewDate?.toISOString()).toBe(REVIEW_DATE);
    expect(project.nextReviewDate?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
    // Golden B: the strict wire schema accepts the envelope unchanged.
    expect(MARK_REVIEWED_TYPED_SCHEMA.safeParse(parsed).success).toBe(true);
  });

  it('weeks interval advances by steps*7 days', () => {
    const project = makeProject({ unit: { name: 'weeks' }, steps: 3 });
    const script = buildMarkProjectReviewedScript({
      projectId: 'p1',
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, project) as { project: { nextReviewDate: string } };
    expect(parsed.project.nextReviewDate).toBe('2026-07-22T12:00:00.000Z');
  });

  it('no review interval: lastReviewDate set, Note change, nextReviewDate stays null', () => {
    const project = makeProject(null);
    const script = buildMarkProjectReviewedScript({
      projectId: 'p1',
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, project);

    expect(parsed).toEqual({
      success: true,
      project: {
        id: 'p1',
        name: 'Fixture',
        lastReviewDate: REVIEW_DATE,
        nextReviewDate: null,
        reviewInterval: null,
      },
      changes: [
        `Last review date set to ${REVIEW_DATE}`,
        'Note: No review interval set, next review date not calculated',
      ],
      message: "Project 'Fixture' marked as reviewed",
    });
    expect(MARK_REVIEWED_TYPED_SCHEMA.safeParse(parsed).success).toBe(true);
  });

  it('updateNextReviewDate:false skips the interval math even when an interval exists', () => {
    const project = makeProject({ unit: { name: 'days' }, steps: 5 });
    const script = buildMarkProjectReviewedScript({
      projectId: 'p1',
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: false,
    });
    const parsed = runScript(script, project) as { changes: string[]; project: { nextReviewDate: string | null } };
    expect(parsed.changes).toEqual([`Last review date set to ${REVIEW_DATE}`]);
    expect(parsed.project.nextReviewDate).toBeNull();
    expect(project.nextReviewDate).toBeNull();
  });

  it('not-found: exact legacy error envelope, ZERO mutations', () => {
    const script = buildMarkProjectReviewedScript({
      projectId: 'missing',
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, null);
    expect(parsed).toEqual({
      error: true,
      message:
        "Project with ID 'missing' not found. Use 'list_projects' or 'projects_for_review' tools to see available projects.",
    });
  });
});
