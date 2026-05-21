import { describe, it, expect } from 'vitest';
import { buildSetReviewScheduleScript } from '../../../../../src/omnifocus/scripts/reviews/set-review-schedule';

describe('buildSetReviewScheduleScript', () => {
  it('serializes all three params (set-interval call site shape)', () => {
    const script = buildSetReviewScheduleScript({
      projectIds: ['p1', 'p2'],
      reviewInterval: { unit: 'week', steps: 2 },
      nextReviewDate: '2026-05-21T17:00:00',
    });
    expect(script).toContain('"projectIds":["p1","p2"]');
    expect(script).toContain('"reviewInterval":{"unit":"week","steps":2}');
    expect(script).toContain('"nextReviewDate":"2026-05-21T17:00:00"');
  });

  it('serializes the clear-schedule call site (both nullable fields explicit)', () => {
    const script = buildSetReviewScheduleScript({
      projectIds: ['p1'],
      reviewInterval: null,
      nextReviewDate: null,
    });
    expect(script).toContain('"projectIds":["p1"]');
    expect(script).toContain('"reviewInterval":null');
    expect(script).toContain('"nextReviewDate":null');
  });

  it('handles empty projectIds (returns the early no-IDs error in JXA)', () => {
    const script = buildSetReviewScheduleScript({
      projectIds: [],
      reviewInterval: null,
      nextReviewDate: null,
    });
    expect(script).toContain('"projectIds":[]');
    expect(script).toContain('"No project IDs provided"');
  });

  it('emits a JXA IIFE with Project.byIdentifier + OMN-58/60 setter pattern', () => {
    const script = buildSetReviewScheduleScript({
      projectIds: ['p'],
      reviewInterval: { unit: 'month', steps: 1 },
      nextReviewDate: null,
    });
    expect(script).toMatch(/Application\('OmniFocus'\)/);
    expect(script).toContain('app.evaluateJavascript(omniJsScript)');
    expect(script).toContain('Project.byIdentifier(projectId)');
    expect(script).toContain('targetProject.reviewInterval = ri;');
    expect(script).toContain("operation: 'set_review_schedule'");
  });

  it('escapes quote characters in projectIds via JSON.stringify', () => {
    const script = buildSetReviewScheduleScript({
      projectIds: ['has"quote'],
      reviewInterval: null,
      nextReviewDate: null,
    });
    expect(script).toContain('"projectIds":["has\\"quote"]');
  });
});
