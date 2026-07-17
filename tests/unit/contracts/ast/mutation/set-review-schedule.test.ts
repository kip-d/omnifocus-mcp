// tests/unit/contracts/ast/mutation/set-review-schedule.test.ts
// OMN-106 PR-2 — golden-first migration of set-review-schedule to the AST
// mutation pipeline. The behavior goldens below were written against the
// LEGACY template FIRST (exact expected JSON, vm-executed — see the pre-port
// commit) and the port landed behind them unchanged — not old-vs-new equality
// ([[feedback_parity_test_tautology]]). The one deliberate delta: the
// clear_schedule silent no-op is now a LOUD failure (Kip 2026-07-06).
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  buildSetReviewScheduleProgram,
  dispatchMutation,
  validateMutationProgram,
  emitProgram,
} from '../../../../../src/contracts/ast/mutation/index.js';
import { buildSetReviewScheduleScript } from '../../../../../src/contracts/ast/mutation-script-builder.js';
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
  it('interval + explicit date: read-modify-reassign, normalized plural unit, exact envelope', async () => {
    const project = makeProject('p1', 'Alpha', { unit: 'months', steps: 1 });
    const { script } = await buildSetReviewScheduleScript({
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

  it('interval without a date calculates the next review from NOW using the RAW unit spec', async () => {
    const project = makeProject('p1', 'Alpha', { unit: 'months', steps: 1 });
    const before = Date.now();
    const { script } = await buildSetReviewScheduleScript({
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

  it('project without a reviewInterval instance fails loudly per-item (OMN-58 no-construct)', async () => {
    const project = makeProject('p1', 'Alpha', null);
    const { script } = await buildSetReviewScheduleScript({
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

  it('mixed batch: found + missing ids partition into successful/failed with exact summary', async () => {
    const project = makeProject('p1', 'Alpha', { unit: 'weeks', steps: 1 });
    const { script } = await buildSetReviewScheduleScript({
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

  it('empty projectIds: the early error envelope', async () => {
    const { script } = await buildSetReviewScheduleScript({
      projectIds: [],
      reviewInterval: null,
      nextReviewDate: NEXT_DATE,
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

  it('FAIL LOUD: the both-params-null shape throws at build time', async () => {
    // Replaces the legacy silent no-op pinned in the pre-port commit: the
    // script reported per-project success with empty changes while clearing
    // nothing (OMN-106/OMN-136 fail-loud decision, Kip 2026-07-06). The
    // clear_schedule operation that produced this shape was removed outright
    // in OMN-273, but the builder still refuses it so no future caller can
    // regress into the silent path.
    await expect(
      buildSetReviewScheduleScript({ projectIds: ['p1'], reviewInterval: null, nextReviewDate: null }),
    ).rejects.toThrow(/requires reviewInterval or nextReviewDate/);
  });
});

describe('buildSetReviewScheduleProgram — golden emission', () => {
  it('emits json binds, empty-ids guard, apply loop, envelope — nothing else', () => {
    const program = buildSetReviewScheduleProgram({
      projectIds: ['p1', 'p2'],
      reviewInterval: { unit: 'week', steps: 2 },
      nextReviewDate: null,
    });
    expect(() => validateMutationProgram(program)).not.toThrow();
    expect(program.statements.map((s) => s.type)).toEqual(['bind', 'bind', 'bind', 'bind', 'guard', 'bind', 'return']);
    expect(program.context).toBe('set_review_schedule');
    expect(program.snippetDeps).toEqual(['applySetReviewSchedule']);

    const omnijs = emitProgram(program);
    // User data crosses JSON-encoded; helpers assembled transitively.
    expect(omnijs).toContain('const pids = ["p1","p2"];');
    expect(omnijs).toContain('const intervalSpec = {"unit":"week","steps":2};');
    expect(omnijs).toContain('function applySetReviewSchedule(');
    expect(omnijs).toContain('function normalizeReviewUnit(');
    expect(omnijs).toContain('function calculateNextReviewFromSpec(');
    expect(omnijs).toContain('"No project IDs provided"');
  });

  it('quote-bearing project id cannot escape its JSON literal', () => {
    const omnijs = emitProgram(
      buildSetReviewScheduleProgram({
        projectIds: ['has"quote'],
        reviewInterval: null,
        nextReviewDate: '2026-08-01T12:00:00.000Z',
      }),
    );
    expect(omnijs).toContain('const pids = ["has\\"quote"];');
  });
});

// The OMN-119/120 non-bypass property: the legacy template ran this batch
// mutation with NO sandbox guard; dispatch pre-flights ALL ids before building.
describe('dispatchMutation set-review-schedule/project guard (OMN-119/120 non-bypass)', () => {
  it('rejects a non-sandbox project id when the sandbox guard is enabled', async () => {
    const prev = { NODE_ENV: process.env.NODE_ENV, SG: process.env.SANDBOX_GUARD_ENABLED };
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    try {
      await expect(
        dispatchMutation('set-review-schedule/project', {
          projectIds: ['not-a-sandbox-project-id'],
          reviewInterval: { unit: 'week', steps: 1 },
          nextReviewDate: null,
        }),
      ).rejects.toThrow(/TEST GUARD/);
    } finally {
      process.env.NODE_ENV = prev.NODE_ENV;
      process.env.SANDBOX_GUARD_ENABLED = prev.SG;
    }
  });
});
