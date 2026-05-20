/**
 * RUN ID — per-integration-test-process unique identifier (OMN-84).
 *
 * Every integration-test fixture name and tag carries this id so:
 *  1. Concurrent or aborted runs cannot leak fixtures that masquerade as the
 *     current run's leakage (post-cleanup attribution is unambiguous).
 *  2. Teardown can scope deletion strictly by runId — a run cleans up only
 *     what it itself created, not residue from prior runs.
 *  3. The generic-prefix sweep (`__TEST__`/`__test-`) remains the safety net
 *     for prior-run residue from crashed runs that predate this contract.
 *
 * The id is generated once per process and is process-scoped — every test
 * file in the same vitest run sees the same `RUN_ID`. Generation:
 *
 *   `<base36 millis>-<6 hex bytes>`
 *
 * Examples: `m1z3kq-9f4a2c`, `m1z3l0-1b8e77`.
 *
 * The id is constrained to characters that are safe to embed in OmniFocus
 * task/project/tag names without escaping concerns: lowercase alphanumerics
 * and hyphens.
 *
 * Naming format produced by the helpers below:
 *
 * | Asset        | Format                                          |
 * | ------------ | ----------------------------------------------- |
 * | inbox task   | `__TEST__-<runId>-<suffix>`                     |
 * | project      | `__TEST__-<runId>-<suffix>`                     |
 * | tag          | `__test-<runId>-<suffix>`                       |
 *
 * Every format still satisfies the OMN-83 contract (`startsWith('__TEST__')`
 * or `startsWith('__test-')`), so the generic-prefix safety net continues
 * to work without modification.
 */

import { randomBytes } from 'crypto';

import { TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from './sandbox-manager.js';

/**
 * Process-scoped run identifier. Generated once at module load.
 *
 * Format: `<base36(Date.now())>-<6 hex chars>`.
 */
export const RUN_ID: string = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

/**
 * Per-run inbox-task / project name prefix: `__TEST__-<runId>-`.
 *
 * Use as `${RUN_NAME_PREFIX}<suffix>`. Still satisfies the OMN-83
 * `startsWith('__TEST__')` contract.
 */
export const RUN_NAME_PREFIX: string = `${TEST_INBOX_PREFIX}-${RUN_ID}-`;

/**
 * Per-run tag-name prefix: `__test-<runId>-`.
 *
 * Use as `${RUN_TAG_PREFIX}<suffix>`. Still satisfies the OMN-83
 * `startsWith('__test-')` contract.
 */
export const RUN_TAG_PREFIX: string = `${TEST_TAG_PREFIX}${RUN_ID}-`;

/**
 * Build a runId-namespaced task / project name from a suffix.
 *
 * `runScopedName('FlagToggle')` →
 * `'__TEST__-m1z3kq-9f4a2c-FlagToggle'`.
 */
export function runScopedName(suffix: string): string {
  return `${RUN_NAME_PREFIX}${suffix}`;
}

/**
 * Build a runId-namespaced tag name from a suffix.
 *
 * `runScopedTag('batch')` → `'__test-m1z3kq-9f4a2c-batch'`.
 */
export function runScopedTag(suffix: string): string {
  return `${RUN_TAG_PREFIX}${suffix}`;
}

/**
 * True iff `name` was produced by the *current* run's `runScopedName()`
 * (i.e. starts with `__TEST__-<RUN_ID>-`). Used by teardown to scope
 * deletion to this run's own artifacts and ignore prior-run residue.
 */
export function isCurrentRunName(name: string): boolean {
  return name.startsWith(RUN_NAME_PREFIX);
}

/**
 * True iff `tagName` was produced by the *current* run's `runScopedTag()`.
 */
export function isCurrentRunTagName(tagName: string): boolean {
  return tagName.startsWith(RUN_TAG_PREFIX);
}
