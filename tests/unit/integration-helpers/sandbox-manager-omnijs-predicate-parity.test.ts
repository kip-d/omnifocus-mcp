/**
 * OMN-87 — OmniJS-side predicate parity with the TypeScript predicates.
 *
 * The sandbox-manager has two equivalent predicate implementations:
 *
 *   1. TypeScript: `isFixtureTaskByName` / `isFixtureProjectByName` — used by
 *      unit-level callers and pinned by the 23 tests in
 *      `sandbox-manager-predicate.test.ts`.
 *   2. OmniJS source: `OMNIJS_FIXTURE_PREDICATES_SOURCE` — interpolated into
 *      every deletion / scan sweep that runs inside OmniFocus's JS context
 *      (`deleteTestTasksEverywhere`, `deleteOrphanedProjects`,
 *      `scanForFixtures`). The TS predicates are unreachable from there;
 *      this string is the single source for what those sweeps enforce.
 *
 * Pre-OMN-87 the OmniJS side was three independently-maintained copies of
 * the predicate logic. A future edit to one copy (e.g. reintroducing
 * substring matching) would silently diverge — TS regression tests would
 * stay green, the sweep would behave differently. Same drift-risk shape as
 * OMN-46 / OMN-47.
 *
 * This test loads the OmniJS source via `new Function` (the source is pure
 * — no template-literal interpolation, no closure over module state) and
 * verifies it produces the same answers as the TypeScript predicates on
 * the OMN-83 fixture corpus. Any divergence — in either direction — fails
 * loudly here.
 *
 * Drives the production seam: extracts the EXACT string that gets
 * interpolated into the OmniJS scripts. A mutation that flips a `.startsWith`
 * to `.includes` in the OmniJS source would fail this test (mutation-verified
 * — see PR body).
 */

import { describe, it, expect } from 'vitest';
import {
  OMNIJS_FIXTURE_PREDICATES_SOURCE,
  isFixtureTaskByName,
  isFixtureProjectByName,
  SANDBOX_FOLDER_NAME,
  TEST_INBOX_PREFIX,
  TEST_TAG_PREFIX,
} from '../../integration/helpers/sandbox-manager.js';

type OmniJsTaskFn = (
  name: string | null | undefined,
  tagNames: ReadonlyArray<string | null | undefined> | null,
  namePrefix: string,
  tagPrefix: string,
) => boolean;

type OmniJsProjectFn = (
  name: string | null | undefined,
  parentFolderName: string | null,
  namePrefix: string,
  sandboxName: string,
) => boolean;

function instantiate(): { task: OmniJsTaskFn; project: OmniJsProjectFn } {
  // The source defines `isFixtureTask` and `isFixtureProject` as plain JS
  // function declarations. Wrap in an IIFE-style Function body and pull
  // them out as values. `new Function` is safe here — the source is a
  // module-level constant in this repo, not user input.
  const factory = new Function(
    `${OMNIJS_FIXTURE_PREDICATES_SOURCE}\nreturn { isFixtureTask: isFixtureTask, isFixtureProject: isFixtureProject };`,
  ) as () => { isFixtureTask: OmniJsTaskFn; isFixtureProject: OmniJsProjectFn };
  const { isFixtureTask, isFixtureProject } = factory();
  return { task: isFixtureTask, project: isFixtureProject };
}

describe('OMN-87: OmniJS predicate source parity with TS predicates', () => {
  const { task: omniTask, project: omniProject } = instantiate();

  describe('isFixtureTask parity', () => {
    type TaskCase = { label: string; name: string; tagNames?: ReadonlyArray<string> };
    const cases: ReadonlyArray<TaskCase> = [
      // Fixtures.
      { label: '__TEST__ prefix with space', name: `${TEST_INBOX_PREFIX} Protocol test task` },
      { label: '__TEST__ prefix no space', name: `${TEST_INBOX_PREFIX}Direct` },
      { label: 'task with __test- tag', name: 'Plan summer vacation 2025', tagNames: [`${TEST_TAG_PREFIX}travel`] },
      {
        label: 'task with one matching tag among many',
        name: 'Buy groceries',
        tagNames: ['urgent', `${TEST_TAG_PREFIX}batch`, 'home'],
      },
      // Non-fixtures (OMN-83 regression corpus — real user task names).
      { label: 'Test fire alarm', name: 'Test fire alarm' },
      { label: 'Test the new espresso machine', name: 'Test the new espresso machine' },
      { label: 'Quick Test of the projector', name: 'Quick Test of the projector' },
      { label: 'Performance Test results for Q1 report', name: 'Performance Test results for Q1 report' },
      { label: 'Completed 1 lap of pool', name: 'Completed 1 lap of pool' },
      { label: 'Velocity Test Task to evaluate sprint pace', name: 'Velocity Test Task to evaluate sprint pace' },
      { label: 'empty name no tags', name: '' },
      { label: 'task with only non-prefixed tags', name: 'Important meeting', tagNames: ['work', 'q1', 'review'] },
      { label: 'task with no tags array', name: 'Random task name' },
      { label: '__TEST__ as substring in middle', name: `Notes about ${TEST_INBOX_PREFIX} from yesterday` },
      {
        label: 'tag prefix as substring in middle of tag',
        name: 'Some task',
        tagNames: [`important-${TEST_TAG_PREFIX}lookalike`],
      },
    ];

    for (const c of cases) {
      it(`agrees on: ${c.label}`, () => {
        const tsResult = isFixtureTaskByName(c.name, c.tagNames);
        const omniResult = omniTask(c.name, c.tagNames ?? [], TEST_INBOX_PREFIX, TEST_TAG_PREFIX);
        expect(omniResult).toBe(tsResult);
      });
    }
  });

  describe('isFixtureProject parity', () => {
    type ProjectCase = { label: string; name: string; parent: string | null };
    const cases: ReadonlyArray<ProjectCase> = [
      // Fixtures.
      {
        label: '__TEST__ prefix in a normal folder',
        name: `${TEST_INBOX_PREFIX} TestBatch_Mapping_123`,
        parent: 'Work',
      },
      { label: '__TEST__ prefix at root', name: `${TEST_INBOX_PREFIX} TestBatch_Simple_456`, parent: null },
      { label: 'no prefix but inside sandbox folder', name: 'Plan Summer Vacation 2025', parent: SANDBOX_FOLDER_NAME },
      // Non-fixtures (real user projects).
      {
        label: 'Test Migration to Postgres outside sandbox',
        name: 'Test Migration to Postgres',
        parent: 'Engineering',
      },
      { label: 'TestBatch_NewProcess outside sandbox', name: 'TestBatch_NewProcess', parent: 'Ops' },
      {
        label: '__TEST__ in middle, real user project',
        name: `Notes on ${TEST_INBOX_PREFIX} debugging`,
        parent: 'Reference',
      },
      { label: 'real user project at root', name: 'Annual Review 2026', parent: null },
      { label: 'similarly-named-but-not-sandbox folder', name: 'My Project', parent: '__MCP_TEST_SANDBOX_OLD__' },
    ];

    for (const c of cases) {
      it(`agrees on: ${c.label}`, () => {
        const tsResult = isFixtureProjectByName(c.name, c.parent);
        const omniResult = omniProject(c.name, c.parent, TEST_INBOX_PREFIX, SANDBOX_FOLDER_NAME);
        expect(omniResult).toBe(tsResult);
      });
    }
  });

  describe('OmniJS source preconditions', () => {
    it('source does not contain backticks (would break JXA → OmniJS interpolation)', () => {
      // The source is interpolated into a JXA template literal that
      // itself contains an inner OmniJS backtick block. A backtick in
      // the source would terminate the inner block prematurely.
      expect(OMNIJS_FIXTURE_PREDICATES_SOURCE.includes('`')).toBe(false);
    });

    it('source declares both predicate functions by name', () => {
      // Sanity guard: if a refactor renames or removes one of these,
      // the deletion / scan sweeps will fail to find the symbol at
      // OmniJS-eval time — a runtime error inside OmniFocus that
      // bypasses TypeScript. Catch it at unit-test time instead.
      expect(OMNIJS_FIXTURE_PREDICATES_SOURCE).toMatch(/function\s+isFixtureTask\s*\(/);
      expect(OMNIJS_FIXTURE_PREDICATES_SOURCE).toMatch(/function\s+isFixtureProject\s*\(/);
    });
  });
});
