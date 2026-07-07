// tests/unit/contracts/ast/mutation/review-date-snippets.test.ts
// OMN-249 — the two next-review-date snippets (mark_reviewed's typed-instance
// reader and set_schedule's raw-spec reader) share ONE arithmetic body. A
// future date-math fix (month-end clamping, leap years) lands once; these
// parity tests fail if the paths ever diverge again.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { collectSnippets } from '../../../../../src/contracts/ast/mutation/snippets.js';
import {
  buildMarkProjectReviewedProgram,
  buildSetReviewScheduleProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';

/** Load both adapters (and their deps) into one vm context. */
function loadSnippets(): Record<string, (...args: unknown[]) => unknown> {
  const src = collectSnippets(['calculateNextReviewDate', 'calculateNextReviewFromSpec']);
  const ctx: Record<string, unknown> = {};
  vm.runInNewContext(
    `${src}\nthis.calculateNextReviewDate = calculateNextReviewDate;\nthis.calculateNextReviewFromSpec = calculateNextReviewFromSpec;`,
    ctx,
  );
  return ctx as Record<string, (...args: unknown[]) => unknown>;
}

const BASE = '2026-07-01T12:00:00.000Z';

describe('OMN-249 — next-review-date path parity (typed instance vs raw spec)', () => {
  const CASES: Array<{ typedUnit: string; specUnit: string; steps: number; expected: string }> = [
    { typedUnit: 'days', specUnit: 'day', steps: 10, expected: '2026-07-11T12:00:00.000Z' },
    { typedUnit: 'weeks', specUnit: 'week', steps: 3, expected: '2026-07-22T12:00:00.000Z' },
    { typedUnit: 'months', specUnit: 'month', steps: 2, expected: '2026-09-01T12:00:00.000Z' },
    { typedUnit: 'years', specUnit: 'year', steps: 1, expected: '2027-07-01T12:00:00.000Z' },
  ];

  for (const c of CASES) {
    it(`${c.typedUnit}/${c.steps}: both paths produce the same date`, () => {
      const fns = loadSnippets();
      const viaTyped = fns.calculateNextReviewDate({ unit: { name: c.typedUnit }, steps: c.steps }, BASE) as Date;
      const viaSpec = fns.calculateNextReviewFromSpec({ unit: c.specUnit, steps: c.steps }, BASE) as Date;
      expect(viaTyped.toISOString()).toBe(c.expected);
      expect(viaSpec.toISOString()).toBe(c.expected);
    });
  }

  it('unknown units fall back to weekly on BOTH paths (legacy default)', () => {
    const fns = loadSnippets();
    const viaTyped = fns.calculateNextReviewDate({ unit: { name: 'fortnights' }, steps: 2 }, BASE) as Date;
    const viaSpec = fns.calculateNextReviewFromSpec({ unit: 'fortnights', steps: 2 }, BASE) as Date;
    expect(viaTyped.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(viaSpec.toISOString()).toBe(viaTyped.toISOString());
  });

  it('null typed interval still returns null (mark_reviewed adapter guard)', () => {
    const fns = loadSnippets();
    expect(fns.calculateNextReviewDate(null, BASE)).toBeNull();
  });

  it('spec path without a base date still computes from now (set_schedule adapter guard)', () => {
    const fns = loadSnippets();
    const before = Date.now();
    const d = fns.calculateNextReviewFromSpec({ unit: 'day', steps: 1 }, null) as Date;
    expect(d.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 5000);
  });
});

describe('OMN-249 — ONE shared arithmetic body', () => {
  it('both emitted programs route through the shared advanceDateByReviewUnit snippet', () => {
    const markReviewed = emitProgram(
      buildMarkProjectReviewedProgram({ projectId: 'p1', reviewDate: BASE, updateNextReviewDate: true }),
    );
    const setSchedule = emitProgram(
      buildSetReviewScheduleProgram({
        projectIds: ['p1'],
        reviewInterval: { unit: 'week', steps: 1 },
        nextReviewDate: null,
      }),
    );
    for (const program of [markReviewed, setSchedule]) {
      expect(program).toContain('function advanceDateByReviewUnit(');
    }
    // The duplicated switch is gone: exactly one arithmetic body per program.
    expect(markReviewed.match(/setFullYear\(/g)).toHaveLength(1);
    expect(setSchedule.match(/setFullYear\(/g)).toHaveLength(1);
  });
});
