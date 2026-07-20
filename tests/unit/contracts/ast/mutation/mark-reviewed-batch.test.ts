// tests/unit/contracts/ast/mutation/mark-reviewed-batch.test.ts
// OMN-256 — batch mark_reviewed (projectIds[]). Golden-first: these envelopes
// mirror set-review-schedule's results.{successful,failed,summary} grammar
// (same accumulator shape, same continue-on-error semantics) applied to the
// mark-reviewed body inherited from the single-id mutation
// ([[feedback_parity_test_tautology]] — these are behavior goldens, not
// old-vs-new equality).
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildMarkProjectsReviewedProgram,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';
import { buildMarkProjectsReviewedScript } from '../../../../../src/contracts/ast/mutation-script-builder.js';
import { MARK_REVIEWED_BATCH_TYPED_SCHEMA } from '../../../../../src/omnifocus/response-schemas/write.js';

interface FakeReviewInterval {
  unit: { name: string };
  steps: number;
}

interface FakeProject {
  id: { primaryKey: string };
  name: string;
  lastReviewDate: Date | null;
  nextReviewDate: Date | null;
  reviewInterval: FakeReviewInterval | null;
}

function makeProject(id: string, name: string, reviewInterval: FakeReviewInterval | null): FakeProject {
  return { id: { primaryKey: id }, name, lastReviewDate: null, nextReviewDate: null, reviewInterval };
}

function runScript(script: string, projects: Record<string, FakeProject>): unknown {
  const inner = { Project: { byIdentifier: (id: string) => projects[id] ?? null }, JSON };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string);
}

const REVIEW_DATE = '2026-07-01T12:00:00.000Z';

describe('mark-projects-reviewed batch — behavior goldens (exact JSON, vm-executed)', () => {
  it('two projects, both found, both with intervals: exact envelope', async () => {
    const alpha = makeProject('p1', 'Alpha', { unit: { name: 'months' }, steps: 2 });
    const beta = makeProject('p2', 'Beta', { unit: { name: 'weeks' }, steps: 1 });
    const { script } = await buildMarkProjectsReviewedScript({
      projectIds: ['p1', 'p2'],
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, { p1: alpha, p2: beta });

    expect(parsed).toEqual({
      success: true,
      results: {
        successful: [
          {
            projectId: 'p1',
            projectName: 'Alpha',
            changes: [
              `Last review date set to ${REVIEW_DATE}`,
              'Next review date calculated and set to 2026-09-01T12:00:00.000Z',
            ],
            lastReviewDate: REVIEW_DATE,
            nextReviewDate: '2026-09-01T12:00:00.000Z',
          },
          {
            projectId: 'p2',
            projectName: 'Beta',
            changes: [
              `Last review date set to ${REVIEW_DATE}`,
              'Next review date calculated and set to 2026-07-08T12:00:00.000Z',
            ],
            lastReviewDate: REVIEW_DATE,
            nextReviewDate: '2026-07-08T12:00:00.000Z',
          },
        ],
        failed: [],
        summary: { total_requested: 2, successful_count: 2, failed_count: 0 },
      },
      message: 'Batch mark-reviewed completed: 2 successful, 0 failed',
    });
    expect(alpha.lastReviewDate?.toISOString()).toBe(REVIEW_DATE);
    expect(beta.nextReviewDate?.toISOString()).toBe('2026-07-08T12:00:00.000Z');
    expect(MARK_REVIEWED_BATCH_TYPED_SCHEMA.safeParse(parsed).success).toBe(true);
  });

  it('project without a reviewInterval: honest "Note" change, nextReviewDate stays null', async () => {
    const project = makeProject('p1', 'Alpha', null);
    const { script } = await buildMarkProjectsReviewedScript({
      projectIds: ['p1'],
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, { p1: project });
    expect(parsed).toEqual({
      success: true,
      results: {
        successful: [
          {
            projectId: 'p1',
            projectName: 'Alpha',
            changes: [
              `Last review date set to ${REVIEW_DATE}`,
              'Note: No review interval set, next review date not calculated',
            ],
            lastReviewDate: REVIEW_DATE,
            nextReviewDate: null,
          },
        ],
        failed: [],
        summary: { total_requested: 1, successful_count: 1, failed_count: 0 },
      },
      message: 'Batch mark-reviewed completed: 1 successful, 0 failed',
    });
  });

  it('updateNextReviewDate:false skips the interval math even when an interval exists', async () => {
    const project = makeProject('p1', 'Alpha', { unit: { name: 'days' }, steps: 5 });
    const { script } = await buildMarkProjectsReviewedScript({
      projectIds: ['p1'],
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: false,
    });
    const parsed = runScript(script, { p1: project }) as {
      results: { successful: Array<{ changes: string[]; nextReviewDate: string | null }> };
    };
    expect(parsed.results.successful[0].changes).toEqual([`Last review date set to ${REVIEW_DATE}`]);
    expect(parsed.results.successful[0].nextReviewDate).toBeNull();
    expect(project.nextReviewDate).toBeNull();
  });

  it('mixed batch: found + missing ids partition into successful/failed, continue-on-error', async () => {
    const alpha = makeProject('p1', 'Alpha', { unit: { name: 'weeks' }, steps: 1 });
    const { script } = await buildMarkProjectsReviewedScript({
      projectIds: ['p1', 'ghost'],
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, { p1: alpha });
    expect(parsed).toEqual({
      success: true,
      results: {
        successful: [
          {
            projectId: 'p1',
            projectName: 'Alpha',
            changes: [
              `Last review date set to ${REVIEW_DATE}`,
              'Next review date calculated and set to 2026-07-08T12:00:00.000Z',
            ],
            lastReviewDate: REVIEW_DATE,
            nextReviewDate: '2026-07-08T12:00:00.000Z',
          },
        ],
        failed: [{ projectId: 'ghost', error: 'Project not found' }],
        summary: { total_requested: 2, successful_count: 1, failed_count: 1 },
      },
      message: 'Batch mark-reviewed completed: 1 successful, 1 failed',
    });
    // The valid project DID advance even though a sibling id failed (no abort-on-first).
    expect(alpha.lastReviewDate?.toISOString()).toBe(REVIEW_DATE);
  });

  it('unparseable reviewDate: reported failed AND leaves lastReviewDate UNMUTATED (validate-before-mutate)', async () => {
    // Regression for the round-7 finding: applyMarkReviewed set
    // project.lastReviewDate = new Date('bad') (Invalid Date) BEFORE the
    // toISOString() read-back threw, corrupting the live object while the row
    // was reported as failed. The guard now throws before any assignment.
    const alpha = makeProject('p1', 'Alpha', { unit: { name: 'weeks' }, steps: 1 });
    const { script } = await buildMarkProjectsReviewedScript({
      projectIds: ['p1'],
      reviewDate: 'not-a-date',
      updateNextReviewDate: true,
    });
    const parsed = runScript(script, { p1: alpha }) as {
      results: { successful: unknown[]; failed: Array<{ projectId: string; error: string }> };
    };
    expect(parsed.results.successful).toEqual([]);
    expect(parsed.results.failed).toHaveLength(1);
    expect(parsed.results.failed[0].projectId).toBe('p1');
    expect(parsed.results.failed[0].error).toContain('Invalid reviewDate');
    // The critical assertion: NOTHING was written to the live object.
    expect(alpha.lastReviewDate).toBeNull();
    expect(alpha.nextReviewDate).toBeNull();
  });

  it('empty projectIds: the early error envelope, mirrors set_schedule', async () => {
    const { script } = await buildMarkProjectsReviewedScript({
      projectIds: [],
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
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
});

describe('buildMarkProjectsReviewedProgram — golden emission', () => {
  it('emits json binds, empty-ids guard, apply loop, envelope — nothing else', () => {
    const program = buildMarkProjectsReviewedProgram({
      projectIds: ['p1', 'p2'],
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['bind', 'bind', 'bind', 'guard', 'bind', 'return']);
    expect(program.context).toBe('mark_projects_reviewed');
    expect(program.snippetDeps).toEqual(['applyMarkReviewedBatch']);

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const pids = ["p1","p2"];');
    expect(omnijs).toContain(`const reviewDateStr = "${REVIEW_DATE}";`);
    expect(omnijs).toContain('function applyMarkReviewedBatch(');
    expect(omnijs).toContain('function calculateNextReviewDate(');
    expect(omnijs).toContain('"No project IDs provided"');
  });

  it('quote-bearing project id cannot escape its JSON literal', () => {
    const omnijs = emitProgram(
      buildMarkProjectsReviewedProgram({
        projectIds: ['has"quote'],
        reviewDate: REVIEW_DATE,
        updateNextReviewDate: true,
      }),
    );
    expect(omnijs).toContain('const pids = ["has\\"quote"];');
  });
});

// The OMN-119/120 non-bypass property: pre-flight EVERY id before building
// (mirrors bulk_delete / set-review-schedule/project — spec §2.1).
describe('dispatchMutation mark-reviewed/projects guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox project id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(
        dispatchMutation('mark-reviewed/projects', {
          projectIds: ['not-a-sandbox-project-id'],
          reviewDate: REVIEW_DATE,
          updateNextReviewDate: true,
        }),
      ).rejects.toThrow(/TEST GUARD/);
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});
