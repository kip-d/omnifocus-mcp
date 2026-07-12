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
 * The id is process-scoped — every test file in the same vitest run must see
 * the same `RUN_ID`. Generation:
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
import { getGlobalSlot } from './global-singleton.js';

/**
 * Process-scoped run identifier, cached on `globalThis` rather than a plain
 * module-level `const`. Vitest's default `isolate: true` resets every test
 * file's ES-module top-level bindings to a fresh instance — even under
 * `pool:'forks', poolOptions.forks.singleFork:true` (one OS process, but one
 * module registry per file) — so a plain `const` here silently re-generates
 * a NEW id per file, contradicting the "every file sees the same RUN_ID"
 * contract above. That drift was invisible as long as each file also got its
 * own fresh `MCPTestClient`/MCP server; it stopped being invisible once a
 * long-lived client became genuinely shared across files (OMN-261), whose
 * `createTestTask()`/`createTestProject()` closures capture the RUN_ID of
 * whichever file happened to instantiate the client first. A later file
 * passing an already-prefixed name (built from ITS OWN `runScopedName()`,
 * i.e. a different RUN_ID) into that stale closure fails the
 * `name.startsWith(RUN_NAME_PREFIX)` fast path and falls through to
 * re-prefixing, corrupting the name into a DOUBLE run-id prefix — this is
 * exactly what made the OMN-126 empty-string-project dedup test intermittently
 * fail (OMN-262): the dedup CODE was never wrong, the fixture name just no
 * longer matched what the test asserted against. `globalThis` is the one
 * thing per-file isolation does not reset, so caching here makes RUN_ID
 * genuinely process-scoped again — via global-singleton.ts's getGlobalSlot,
 * the same shared mechanism shared-server.ts and fixture-profiler.ts use for
 * the identical problem. (OMN-261 review: this used to hand-roll its own
 * globalThis-Symbol slot to stay independent of that then-unmerged work;
 * both land in the same PR now, so the independence no longer buys anything
 * and only risked drifting out of sync with the shared implementation.)
 *
 * Format: `<base36(Date.now())>-<6 hex chars>`.
 */
// Exported so run-id.test.ts's globalThis-clearing helper (which simulates a
// genuinely separate process) can pass the real slot name to
// global-singleton.ts's clearGlobalSlot() instead of duplicating it.
export const RUN_ID_SLOT_KEY = 'integration-test-run-id';

export const RUN_ID: string = getGlobalSlot(
  RUN_ID_SLOT_KEY,
  () => `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
);

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
