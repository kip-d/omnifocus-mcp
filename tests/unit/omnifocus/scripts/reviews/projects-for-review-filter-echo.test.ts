// tests/unit/omnifocus/scripts/reviews/projects-for-review-filter-echo.test.ts
// OMN-340 slice 2 (gate finding B) — OmniFocusAnalyzeTool passes
// `filter: { ...args, now: now.toISOString() }` into this script so the
// script's own review_summary classification agrees with the tool's
// per-row reviewStatus classification (same instant). The script then
// echoed `filter` verbatim as `metadata.filter_applied`, leaking the
// internal `now` key to clients that never sent it. Fix: the echo must be
// a shallow copy of `filter` with `now` omitted — every OTHER key (the
// pre-existing `operation`/`daysAhead`/etc.) stays.
import { describe, it, expect } from 'vitest';
import { buildProjectsForReviewScript } from '../../../../../src/omnifocus/scripts/reviews/projects-for-review.js';
import { runAnalyticsScript } from '../analytics/run-analytics-script.js';

interface ScriptResult {
  success: boolean;
  metadata: {
    filter_applied: Record<string, unknown>;
  };
}

describe('OMN-340 slice 2 (gate finding B) — filter_applied omits the internal `now` key', () => {
  it('drops `now` from filter_applied when the caller supplied it, keeping other keys', () => {
    // Mirrors OmniFocusAnalyzeTool.reviewsListForReview: `args` carries keys
    // (e.g. `operation`) outside ProjectsForReviewFilter's declared shape,
    // spread into `filter` alongside `now` — a variable spread, not an
    // object literal, so it isn't subject to excess-property checking.
    const args = { operation: 'list_for_review', daysAhead: 14 };
    const script = buildProjectsForReviewScript({
      filter: { ...args, now: '2026-06-12T10:00:00.000Z' },
    });
    const parsed = runAnalyticsScript(script, {}, { flattenedProjects: [] }) as ScriptResult;

    expect(parsed.success).toBe(true);
    expect(parsed.metadata.filter_applied).not.toHaveProperty('now');
    expect(parsed.metadata.filter_applied.operation).toBe('list_for_review');
    expect(parsed.metadata.filter_applied.daysAhead).toBe(14);
  });

  it('still emits filter_applied (possibly empty) when `now` was never supplied', () => {
    const script = buildProjectsForReviewScript({ filter: { overdue: true } });
    const parsed = runAnalyticsScript(script, {}, { flattenedProjects: [] }) as ScriptResult;

    expect(parsed.success).toBe(true);
    expect(parsed.metadata.filter_applied).not.toHaveProperty('now');
    expect(parsed.metadata.filter_applied.overdue).toBe(true);
  });
});
