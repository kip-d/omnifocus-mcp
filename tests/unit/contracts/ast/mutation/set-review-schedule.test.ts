// tests/unit/contracts/ast/mutation/set-review-schedule.test.ts
// OMN-106 PR-2 — golden-first migration of set-review-schedule to the AST
// mutation pipeline. These goldens pin CURRENT (legacy) behavior with exact
// expected JSON — not old-vs-new equality — so the port happens behind them
// ([[feedback_parity_test_tautology]]).
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { buildSetReviewScheduleScript } from '../../../../../src/omnifocus/scripts/reviews.js';
import { SET_SCHEDULE_TYPED_SCHEMA } from '../../../../../src/omnifocus/response-schemas/write.js';

// ── Fixture: fake OmniFocus projects keyed by id + two-layer vm execution ────

interface FakeReviewInterval {
  unit: string;
  steps: number;
}

interface FakeProject {
  id: { primaryKey: string };
  name: string;
  nextReviewDate: Date | null;
  reviewInterval: FakeReviewInterval | null;
}

function makeProject(id: string, name: string, reviewInterval: FakeReviewInterval | null): FakeProject {
  return { id: { primaryKey: id }, name, nextReviewDate: null, reviewInterval };
}

function runScript(script: string, projects: Record<string, FakeProject>): unknown {
  const inner = { Project: { byIdentifier: (id: string) => projects[id] ?? null }, JSON };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string);
}

const NEXT_DATE = '2026-08-01T12:00:00.000Z';

describe('set-review-schedule — behavior goldens (exact JSON, vm-executed)', () => {
  it('interval + explicit date: read-modify-reassign, normalized plural unit, exact envelope', () => {
    const project = makeProject('p1', 'Alpha', { unit: 'months', steps: 1 });
    const script = buildSetReviewScheduleScript({
      projectIds: ['p1'],
      reviewInterval: { unit: 'week', steps: 2 },
      nextReviewDate: NEXT_DATE,
    });
    const parsed = runScript(script, { p1: project });

    expect(parsed).toEqual({
      success: true,
      results: {
        successful: [
          {
            projectId: 'p1',
            projectName: 'Alpha',
            changes: ['Review interval set to every 2 weeks', `Next review date set to ${NEXT_DATE}`],
            reviewInterval: { unit: 'weeks', steps: 2 },
            nextReviewDate: NEXT_DATE,
          },
        ],
        failed: [],
        summary: { total_requested: 1, successful_count: 1, failed_count: 0 },
      },
      message: 'Batch review schedule update completed: 1 successful, 0 failed',
    });
    // The typed instance was mutated and reassigned, and the date landed.
    expect(project.reviewInterval).toEqual({ unit: 'weeks', steps: 2 });
    expect(project.nextReviewDate?.toISOString()).toBe(NEXT_DATE);
    expect(SET_SCHEDULE_TYPED_SCHEMA.safeParse(parsed).success).toBe(true);
  });

  it('interval without a date calculates the next review from NOW using the RAW unit spec', () => {
    const project = makeProject('p1', 'Alpha', { unit: 'months', steps: 1 });
    const before = Date.now();
    const script = buildSetReviewScheduleScript({
      projectIds: ['p1'],
      reviewInterval: { unit: 'day', steps: 10 },
      nextReviewDate: null,
    });
    const parsed = runScript(script, { p1: project }) as {
      results: { successful: Array<{ nextReviewDate: string; changes: string[] }> };
    };
    const after = Date.now();

    const next = new Date(parsed.results.successful[0].nextReviewDate).getTime();
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    expect(next).toBeGreaterThanOrEqual(before + tenDays - 5000);
    expect(next).toBeLessThanOrEqual(after + tenDays + 5000);
    expect(parsed.results.successful[0].changes[1]).toMatch(/^Next review date calculated and set to /);
  });

  it('project without a reviewInterval instance fails loudly per-item (OMN-58 no-construct)', () => {
    const project = makeProject('p1', 'Alpha', null);
    const script = buildSetReviewScheduleScript({
      projectIds: ['p1'],
      reviewInterval: { unit: 'week', steps: 1 },
      nextReviewDate: null,
    });
    const parsed = runScript(script, { p1: project });

    expect(parsed).toEqual({
      success: true,
      results: {
        successful: [],
        failed: [
          {
            projectId: 'p1',
            projectName: 'Alpha',
            error:
              'Project has no existing reviewInterval instance to modify; OmniJS cannot construct one (OMN-41/OMN-58)',
          },
        ],
        summary: { total_requested: 1, successful_count: 0, failed_count: 1 },
      },
      message: 'Batch review schedule update completed: 0 successful, 1 failed',
    });
    expect(SET_SCHEDULE_TYPED_SCHEMA.safeParse(parsed).success).toBe(true);
  });

  it('mixed batch: found + missing ids partition into successful/failed with exact summary', () => {
    const project = makeProject('p1', 'Alpha', { unit: 'weeks', steps: 1 });
    const script = buildSetReviewScheduleScript({
      projectIds: ['p1', 'ghost'],
      reviewInterval: null,
      nextReviewDate: NEXT_DATE,
    });
    const parsed = runScript(script, { p1: project });

    expect(parsed).toEqual({
      success: true,
      results: {
        successful: [
          {
            projectId: 'p1',
            projectName: 'Alpha',
            changes: [`Next review date set to ${NEXT_DATE}`],
            reviewInterval: { unit: 'weeks', steps: 1 },
            nextReviewDate: NEXT_DATE,
          },
        ],
        failed: [{ projectId: 'ghost', error: 'Project not found' }],
        summary: { total_requested: 2, successful_count: 1, failed_count: 1 },
      },
      message: 'Batch review schedule update completed: 1 successful, 1 failed',
    });
  });

  it('empty projectIds: the early error envelope', () => {
    const script = buildSetReviewScheduleScript({ projectIds: [], reviewInterval: null, nextReviewDate: null });
    const parsed = runScript(script, {});
    expect(parsed).toEqual({
      success: false,
      error: true,
      message: 'No project IDs provided',
      results: {
        successful: [],
        failed: [],
        summary: { total_requested: 0, successful_count: 0, failed_count: 0 },
      },
    });
  });

  it('CURRENT clear_schedule shape (both params null) silently succeeds with empty changes', () => {
    // Pins the exact silent no-op OMN-106/OMN-136 flagged: nothing is cleared,
    // yet the envelope reports success. The port replaces this with a loud
    // failure per Kip's 2026-07-06 fail-loud decision — this test documents
    // what the loudness replaces.
    const project = makeProject('p1', 'Alpha', { unit: 'weeks', steps: 1 });
    const script = buildSetReviewScheduleScript({ projectIds: ['p1'], reviewInterval: null, nextReviewDate: null });
    const parsed = runScript(script, { p1: project });

    expect(parsed).toEqual({
      success: true,
      results: {
        successful: [
          {
            projectId: 'p1',
            projectName: 'Alpha',
            changes: [],
            reviewInterval: { unit: 'weeks', steps: 1 },
            nextReviewDate: null,
          },
        ],
        failed: [],
        summary: { total_requested: 1, successful_count: 1, failed_count: 0 },
      },
      message: 'Batch review schedule update completed: 1 successful, 0 failed',
    });
    // Nothing was actually mutated.
    expect(project.reviewInterval).toEqual({ unit: 'weeks', steps: 1 });
    expect(project.nextReviewDate).toBeNull();
  });
});
