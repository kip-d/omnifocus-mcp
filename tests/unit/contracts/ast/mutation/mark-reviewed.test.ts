// tests/unit/contracts/ast/mutation/mark-reviewed.test.ts
// OMN-106 PR-1 — golden-first migration of mark-project-reviewed to the AST
// mutation pipeline. The behavior goldens below were written against the
// LEGACY template FIRST (exact expected JSON, vm-executed — see the pre-port
// commit) and the port landed behind them unchanged: the envelopes here ARE
// the legacy wire shapes, not old-vs-new equality
// ([[feedback_parity_test_tautology]]).
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildMarkProjectReviewedProgram,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';
import { buildMarkProjectReviewedScript } from '../../../../../src/contracts/ast/mutation-script-builder.js';
import { MARK_REVIEWED_TYPED_SCHEMA } from '../../../../../src/omnifocus/response-schemas/write.js';

// ── Fixture: a fake OmniFocus project + the two-layer vm execution ──────────
// The launcher is a JXA wrapper that sends its OmniJS body through
// app.evaluateJavascript — the same boundary the legacy template used, so the
// pre-port goldens ran on this exact harness.

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

async function buildScript(params: {
  projectId: string | null;
  reviewDate: string;
  updateNextReviewDate: boolean;
}): Promise<string> {
  const { script } = await buildMarkProjectReviewedScript(params);
  return script;
}

const REVIEW_DATE = '2026-07-01T12:00:00.000Z';

describe('mark-project-reviewed — behavior goldens (exact JSON, vm-executed)', () => {
  it('with a months interval: sets lastReviewDate, advances nextReviewDate, exact envelope', async () => {
    const project = makeProject({ unit: { name: 'months' }, steps: 2 });
    const script = await buildScript({ projectId: 'p1', reviewDate: REVIEW_DATE, updateNextReviewDate: true });
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

  it('weeks interval advances by steps*7 days', async () => {
    const project = makeProject({ unit: { name: 'weeks' }, steps: 3 });
    const script = await buildScript({ projectId: 'p1', reviewDate: REVIEW_DATE, updateNextReviewDate: true });
    const parsed = runScript(script, project) as { project: { nextReviewDate: string } };
    expect(parsed.project.nextReviewDate).toBe('2026-07-22T12:00:00.000Z');
  });

  it('no review interval: lastReviewDate set, Note change, nextReviewDate stays null', async () => {
    const project = makeProject(null);
    const script = await buildScript({ projectId: 'p1', reviewDate: REVIEW_DATE, updateNextReviewDate: true });
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

  it('updateNextReviewDate:false skips the interval math even when an interval exists', async () => {
    const project = makeProject({ unit: { name: 'days' }, steps: 5 });
    const script = await buildScript({ projectId: 'p1', reviewDate: REVIEW_DATE, updateNextReviewDate: false });
    const parsed = runScript(script, project) as { changes: string[]; project: { nextReviewDate: string | null } };
    expect(parsed.changes).toEqual([`Last review date set to ${REVIEW_DATE}`]);
    expect(parsed.project.nextReviewDate).toBeNull();
    expect(project.nextReviewDate).toBeNull();
  });

  it('not-found: exact legacy error envelope, ZERO mutations', async () => {
    const script = await buildScript({ projectId: 'missing', reviewDate: REVIEW_DATE, updateNextReviewDate: true });
    const parsed = runScript(script, null);
    expect(parsed).toEqual({
      error: true,
      message:
        "Project with ID 'missing' not found. Use 'list_projects' or 'projects_for_review' tools to see available projects.",
    });
  });

  it('null projectId reproduces the legacy in-script not-found (message names null)', async () => {
    const script = await buildScript({ projectId: null, reviewDate: REVIEW_DATE, updateNextReviewDate: true });
    const parsed = runScript(script, null);
    expect(parsed).toEqual({
      error: true,
      message:
        "Project with ID 'null' not found. Use 'list_projects' or 'projects_for_review' tools to see available projects.",
    });
  });
});

describe('buildMarkProjectReviewedProgram — golden emission', () => {
  it('emits resolve, guard, date bind, apply bind, envelope — nothing else', () => {
    const program = buildMarkProjectReviewedProgram({
      projectId: 'p1',
      reviewDate: REVIEW_DATE,
      updateNextReviewDate: true,
    });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['resolveProjectById', 'guard', 'bind', 'bind', 'return']);
    expect(program.context).toBe('mark_project_reviewed');
    expect(program.snippetDeps).toEqual(['applyMarkReviewed']);

    const omnijs = emitProgram(program);
    expect(omnijs).toContain('const proj = Project.byIdentifier("p1") || null;');
    expect(omnijs).toContain(
      "if (proj === null) return JSON.stringify({ error: true, message: \"Project with ID 'p1' not found. Use 'list_projects' or 'projects_for_review' tools to see available projects.\" });",
    );
    // Snippet bodies assembled (transitive dep included).
    expect(omnijs).toContain('function applyMarkReviewed(');
    expect(omnijs).toContain('function calculateNextReviewDate(');
    expect(omnijs).toContain('applyMarkReviewed(proj, reviewDateStr, true)');
  });

  it('user data crosses the boundary JSON-encoded (quote-bearing id cannot escape its literal)', () => {
    const omnijs = emitProgram(
      buildMarkProjectReviewedProgram({
        projectId: 'has"quote',
        reviewDate: REVIEW_DATE,
        updateNextReviewDate: true,
      }),
    );
    expect(omnijs).toContain('Project.byIdentifier("has\\"quote")');
    // The date string enters via a json() bind, never raw interpolation.
    expect(omnijs).toContain(`const reviewDateStr = "${REVIEW_DATE}";`);
  });
});

// The OMN-119/120 non-bypass property: the legacy template ran this mutation
// with NO sandbox guard; dispatch closes that.
describe('dispatchMutation mark-reviewed/project guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox project id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(
        dispatchMutation('mark-reviewed/project', {
          projectId: 'not-a-sandbox-project-id',
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
