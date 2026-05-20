/**
 * OMN-83 — Predicate-tightening regression.
 *
 * `isFixtureTaskByName` and `isFixtureProjectByName` are the single source
 * of truth for "is this OmniFocus item a leaked test fixture?". Pre-OMN-83
 * the predicate was a 30-entry pattern list (`ORPHAN_TASK_PATTERNS`) that
 * matched real-user task names by loose prefix — a task literally named
 * `"Test fire alarm"` would have been classified as a fixture and purged.
 *
 * Post-OMN-83 the predicate collapses to:
 *   - Task: `name.startsWith('__TEST__')` OR any tag with `__test-` prefix
 *   - Project: `name.startsWith('__TEST__')` OR parent folder is the sandbox
 *
 * These tests pin that contract. They drive the production seam directly
 * (the exported predicates, not a copy) so a regression that re-introduces
 * substring/loose matching fails here, not in production at 04:00 on a
 * Sunday after a destructive test-cleanup sweep.
 */

import { describe, it, expect } from 'vitest';
import {
  isFixtureTaskByName,
  isFixtureProjectByName,
  SANDBOX_FOLDER_NAME,
  TEST_INBOX_PREFIX,
  TEST_TAG_PREFIX,
} from '../../integration/helpers/sandbox-manager.js';

describe('isFixtureTaskByName (OMN-83)', () => {
  describe('classifies as fixture', () => {
    it('name with __TEST__ prefix (canonical inbox fixture)', () => {
      expect(isFixtureTaskByName(`${TEST_INBOX_PREFIX} Protocol test task`)).toBe(true);
    });

    it('name with __TEST__ prefix and no separating space', () => {
      // Defensive: some test fixtures concatenate without a space.
      expect(isFixtureTaskByName(`${TEST_INBOX_PREFIX}Direct`)).toBe(true);
    });

    it('task with a __test- tag, regardless of name', () => {
      // The tag-prefix carrier is the second leg of the OMN-83 contract:
      // round-trip / batch tests can name fixtures freely so long as the
      // tag is carried. This matches MCPTestClient.createTestTask().
      expect(isFixtureTaskByName('Plan summer vacation 2025', [`${TEST_TAG_PREFIX}travel`])).toBe(true);
    });

    it('task with one matching tag among several non-matching tags', () => {
      expect(isFixtureTaskByName('Buy groceries', ['urgent', `${TEST_TAG_PREFIX}batch`, 'home'])).toBe(true);
    });
  });

  describe('does NOT classify as fixture (regression for OMN-83 / OMN-46)', () => {
    it('REAL USER TASK: "Test fire alarm" must not be swept', () => {
      // The exact case OMN-83 was filed to guard. Pre-OMN-83, "Test " family
      // patterns were in ORPHAN_TASK_PATTERNS; this name would have been
      // dragged into the orphan sweep if it ever landed in Miscellaneous
      // with no tags. Post-OMN-83: no pattern list, no false positive.
      expect(isFixtureTaskByName('Test fire alarm')).toBe(false);
    });

    it('"Test the new espresso machine" — substring containing "Test " is not a fixture', () => {
      expect(isFixtureTaskByName('Test the new espresso machine')).toBe(false);
    });

    it('"Quick Test of the projector" — would have matched "Quick Test" in old list', () => {
      expect(isFixtureTaskByName('Quick Test of the projector')).toBe(false);
    });

    it('"Performance Test results for Q1 report" — would have matched "Performance Test"', () => {
      expect(isFixtureTaskByName('Performance Test results for Q1 report')).toBe(false);
    });

    it('"Completed 1 lap of pool" — would have matched "Completed 1"', () => {
      expect(isFixtureTaskByName('Completed 1 lap of pool')).toBe(false);
    });

    it('"Velocity Test Task to evaluate sprint pace" — would have matched "Velocity Test Task"', () => {
      expect(isFixtureTaskByName('Velocity Test Task to evaluate sprint pace')).toBe(false);
    });

    it('empty task name with no tags is not a fixture', () => {
      expect(isFixtureTaskByName('')).toBe(false);
    });

    it('task with only non-prefixed tags is not a fixture', () => {
      expect(isFixtureTaskByName('Important meeting', ['work', 'q1', 'review'])).toBe(false);
    });

    it('task with no tags array passed is not a fixture (default empty)', () => {
      expect(isFixtureTaskByName('Random task name')).toBe(false);
    });

    it('substring match in middle of name is not enough', () => {
      // Defensive: ensure no substring matching crept back in.
      expect(isFixtureTaskByName(`Notes about ${TEST_INBOX_PREFIX} from yesterday`)).toBe(false);
    });

    it('substring match of tag prefix in middle of tag name is not enough', () => {
      // Defensive: tag prefix must be at start, not anywhere.
      expect(isFixtureTaskByName('Some task', [`important-${TEST_TAG_PREFIX}lookalike`])).toBe(false);
    });
  });
});

describe('isFixtureProjectByName (OMN-83)', () => {
  describe('classifies as fixture', () => {
    it('project name with __TEST__ prefix at any folder location', () => {
      expect(isFixtureProjectByName(`${TEST_INBOX_PREFIX} TestBatch_Mapping_123`, 'Work')).toBe(true);
    });

    it('project name with __TEST__ prefix at root (no parent folder)', () => {
      expect(isFixtureProjectByName(`${TEST_INBOX_PREFIX} TestBatch_Simple_456`, null)).toBe(true);
    });

    it('project inside the sandbox folder, even without __TEST__ prefix', () => {
      // Sandbox-folder containment is the second leg — projects created via
      // MCPTestClient.createTestProject() may not carry the __TEST__ prefix
      // because they go straight into the sandbox.
      expect(isFixtureProjectByName('Plan Summer Vacation 2025', SANDBOX_FOLDER_NAME)).toBe(true);
    });
  });

  describe('does NOT classify as fixture (regression)', () => {
    it('REAL USER PROJECT: "Test Migration to Postgres" outside sandbox', () => {
      // Pre-OMN-83 "Test " family prefixes in ORPHAN_PROJECT_PATTERNS would
      // have flagged this.
      expect(isFixtureProjectByName('Test Migration to Postgres', 'Engineering')).toBe(false);
    });

    it('"TestBatch_NewProcess" outside sandbox is a real user project', () => {
      // Pre-OMN-83 ORPHAN_PROJECT_PATTERNS included literal 'TestBatch_' —
      // anyone naming a real project that prefix would get nuked.
      expect(isFixtureProjectByName('TestBatch_NewProcess', 'Ops')).toBe(false);
    });

    it('project named with __TEST__ in middle is not a fixture', () => {
      expect(isFixtureProjectByName(`Notes on ${TEST_INBOX_PREFIX} debugging`, 'Reference')).toBe(false);
    });

    it('project at root with no __TEST__ prefix is not a fixture', () => {
      expect(isFixtureProjectByName('Annual Review 2026', null)).toBe(false);
    });

    it('project in a similarly-named folder is not a fixture', () => {
      // Sandbox folder must be the EXACT name, not a substring or sibling.
      expect(isFixtureProjectByName('My Project', '__MCP_TEST_SANDBOX_OLD__')).toBe(false);
    });
  });
});
