// tests/unit/omnifocus/scripts/reviews/projects-for-review-status-vocab.test.ts
// OMN-272 follow-up (PR #229 review finding): projects-for-review carried its
// own inline Project.Status map that had drifted — 'on-hold' (hyphen) where
// fetchSlimmedData and productivity-stats-v3 say 'onHold', plus an 'unknown'
// fallback where the others fail open with String(s). All three now splice
// PROJECT_STATUS_STRING_SNIPPET (contracts/ast/types) — one definition, one
// vocabulary. These tests pin the unified vocabulary on this script and pin
// the single-definition structure so a fourth inline copy can't reappear
// silently.
import { describe, it, expect } from 'vitest';
import { buildProjectsForReviewScript } from '../../../../../src/omnifocus/scripts/reviews/projects-for-review.js';
import { PRODUCTIVITY_STATS_SCRIPT_V3 } from '../../../../../src/omnifocus/scripts/analytics/productivity-stats-v3.js';
import { PROJECT_STATUS_STRING_SNIPPET } from '../../../../../src/contracts/ast/types.js';
import { runAnalyticsScript, FAKE_PROJECT_STATUS } from '../analytics/run-analytics-script.js';

function onHoldProject() {
  return {
    id: { primaryKey: 'p-hold' },
    name: 'Held Project',
    status: FAKE_PROJECT_STATUS.OnHold,
    flagged: false,
    note: null,
    parentFolder: null,
    task: { children: [] },
    nextReviewDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // overdue for review
    lastReviewDate: null,
    reviewInterval: { unit: 'week', steps: 1 },
  };
}

describe('OMN-272 — projects_for_review status vocabulary (unified, no drift)', () => {
  it("emits 'onHold' (not the drifted 'on-hold') and filters by the same vocabulary", () => {
    const script = buildProjectsForReviewScript({ filter: { status: ['onHold'], overdue: true } });
    const parsed = runAnalyticsScript(script, {}, { flattenedProjects: [onHoldProject()] }) as {
      success: boolean;
      projects: Array<{ status: string }>;
    };
    expect(parsed.success).toBe(true);
    // Pre-unification: getProjectStatus returned 'on-hold', so a filter of
    // ['onHold'] matched nothing and an emitted row would have said 'on-hold'.
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].status).toBe('onHold');
  });

  it('every status-emitting template splices the ONE canonical map (no inline copies)', () => {
    expect(buildProjectsForReviewScript({ filter: {} })).toContain(PROJECT_STATUS_STRING_SNIPPET);
    expect(PRODUCTIVITY_STATS_SCRIPT_V3).toContain(PROJECT_STATUS_STRING_SNIPPET);
    // The drifted vocabulary and the drifted fallback are gone from this script.
    const script = buildProjectsForReviewScript({ filter: {} });
    expect(script).not.toContain("'on-hold'");
    expect(script).not.toContain('getProjectStatus');
  });
});
