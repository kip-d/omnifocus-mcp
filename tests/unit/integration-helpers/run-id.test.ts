/**
 * OMN-84 — per-runId fixture-name uniqueness regression.
 *
 * The whole point of `RUN_ID` and `runScopedName` / `runScopedTag` is that
 * two integration-test processes cannot collide on a fixture name even if
 * they happen to produce overlapping suffixes (`Completed_1`,
 * `TestBatch_Simple`, `RT_renamed`, etc.). The runId is the discriminator.
 *
 * Uniqueness must hold ACROSS OS processes (RUN_ID collide check) while
 * STABILITY must hold WITHIN one process, even across vitest's per-file
 * module reloads (OMN-262 — see run-id.ts's `getOrCreateRunId` doc comment).
 * `vi.resetModules()` alone simulates the latter (same process, same
 * `globalThis`, fresh ES-module bindings — exactly what vitest does between
 * test files); it can no longer be used to simulate "a different run", since
 * that's precisely the drift OMN-262 closed. `loadRunIdModuleAsNewRun()`
 * below additionally clears the `globalThis` slot RUN_ID is cached under, to
 * accurately simulate a genuinely separate process.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from '../../integration/helpers/sandbox-manager.js';

const RUN_ID_GLOBAL_KEY = Symbol.for('omnifocus-mcp:integration-test-run-id');

function clearGlobalRunId(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[RUN_ID_GLOBAL_KEY];
}

// Reset the runId module before each test so each block starts clean.
beforeEach(() => {
  vi.resetModules();
  clearGlobalRunId();
});

async function loadRunIdModule() {
  // Dynamic import after resetModules() → fresh ES-module bindings, but
  // RUN_ID itself is cached on globalThis (OMN-262), so this alone does NOT
  // change RUN_ID within the same process — matching real vitest per-file
  // module isolation under a shared, long-lived MCP client (OMN-261).
  return await import('../../integration/helpers/run-id.js');
}

// Simulates a genuinely different integration-test PROCESS: clears both the
// module cache and the globalThis slot RUN_ID is cached under.
async function loadRunIdModuleAsNewRun() {
  vi.resetModules();
  clearGlobalRunId();
  return await import('../../integration/helpers/run-id.js');
}

describe('RUN_ID format (OMN-84)', () => {
  it('is non-empty and uses safe characters (lowercase alphanumeric + hyphen)', async () => {
    const { RUN_ID } = await loadRunIdModule();
    expect(RUN_ID).toMatch(/^[a-z0-9-]+$/);
    expect(RUN_ID.length).toBeGreaterThan(0);
  });

  it('contains a hyphen separating the time component from the random component', async () => {
    const { RUN_ID } = await loadRunIdModule();
    expect(RUN_ID).toContain('-');
  });

  it('is stable within a process load (same import returns same id)', async () => {
    const a = await loadRunIdModule();
    const b = await import('../../integration/helpers/run-id.js');
    expect(b.RUN_ID).toBe(a.RUN_ID);
  });

  it('OMN-262: is stable across a simulated per-file module reload within the same process', async () => {
    // vitest's default per-file isolation resets ES-module top-level bindings
    // between test files even under a single forked OS process
    // (pool:'forks', singleFork:true) — vi.resetModules() alone reproduces
    // that. Before OMN-262, RUN_ID was a plain module-level const, so this
    // reload silently produced a DIFFERENT id, which corrupted fixture names
    // once a long-lived MCPTestClient became genuinely shared across files
    // (OMN-261) — see run-id.ts's getOrCreateRunId doc comment.
    const a = await loadRunIdModule();
    vi.resetModules();
    const b = await import('../../integration/helpers/run-id.js');
    expect(b.RUN_ID).toBe(a.RUN_ID);
  });
});

describe('RUN_NAME_PREFIX / RUN_TAG_PREFIX (OMN-84)', () => {
  it('RUN_NAME_PREFIX starts with __TEST__ — preserves OMN-83 safety-net contract', async () => {
    const { RUN_NAME_PREFIX } = await loadRunIdModule();
    expect(RUN_NAME_PREFIX.startsWith(TEST_INBOX_PREFIX)).toBe(true);
  });

  it('RUN_TAG_PREFIX starts with __test- — preserves OMN-83 safety-net contract', async () => {
    const { RUN_TAG_PREFIX } = await loadRunIdModule();
    expect(RUN_TAG_PREFIX.startsWith(TEST_TAG_PREFIX)).toBe(true);
  });

  it('RUN_NAME_PREFIX ends with a hyphen so suffixes append cleanly', async () => {
    const { RUN_NAME_PREFIX } = await loadRunIdModule();
    expect(RUN_NAME_PREFIX.endsWith('-')).toBe(true);
  });

  it('RUN_TAG_PREFIX ends with a hyphen so suffixes append cleanly', async () => {
    const { RUN_TAG_PREFIX } = await loadRunIdModule();
    expect(RUN_TAG_PREFIX.endsWith('-')).toBe(true);
  });
});

describe('runScopedName / runScopedTag (OMN-84)', () => {
  it('runScopedName produces a name that starts with __TEST__', async () => {
    const { runScopedName } = await loadRunIdModule();
    expect(runScopedName('Anything').startsWith(TEST_INBOX_PREFIX)).toBe(true);
  });

  it('runScopedTag produces a tag that starts with __test-', async () => {
    const { runScopedTag } = await loadRunIdModule();
    expect(runScopedTag('anything').startsWith(TEST_TAG_PREFIX)).toBe(true);
  });

  it('runScopedName embeds the current RUN_ID', async () => {
    const { runScopedName, RUN_ID } = await loadRunIdModule();
    expect(runScopedName('Foo')).toContain(RUN_ID);
  });

  it('runScopedTag embeds the current RUN_ID', async () => {
    const { runScopedTag, RUN_ID } = await loadRunIdModule();
    expect(runScopedTag('foo')).toContain(RUN_ID);
  });

  it('runScopedName returns the suffix appended to RUN_NAME_PREFIX', async () => {
    const { runScopedName, RUN_NAME_PREFIX } = await loadRunIdModule();
    expect(runScopedName('TestBatch_Simple_123')).toBe(`${RUN_NAME_PREFIX}TestBatch_Simple_123`);
  });
});

describe('isCurrentRunName / isCurrentRunTagName (OMN-84)', () => {
  it('isCurrentRunName matches a name produced by runScopedName', async () => {
    const { runScopedName, isCurrentRunName } = await loadRunIdModule();
    expect(isCurrentRunName(runScopedName('TestBatch_X'))).toBe(true);
  });

  it('isCurrentRunName does NOT match a plain __TEST__ legacy name (no runId)', async () => {
    const { isCurrentRunName } = await loadRunIdModule();
    expect(isCurrentRunName(`${TEST_INBOX_PREFIX} Legacy task name`)).toBe(false);
  });

  it('isCurrentRunTagName matches a tag produced by runScopedTag', async () => {
    const { runScopedTag, isCurrentRunTagName } = await loadRunIdModule();
    expect(isCurrentRunTagName(runScopedTag('rt'))).toBe(true);
  });

  it('isCurrentRunTagName does NOT match a plain __test- legacy tag (no runId)', async () => {
    const { isCurrentRunTagName } = await loadRunIdModule();
    expect(isCurrentRunTagName(`${TEST_TAG_PREFIX}analytics`)).toBe(false);
  });
});

describe('Two simulated runs do not collide on overlapping suffixes (OMN-84 acceptance)', () => {
  // The canonical OMN-84 acceptance test: two simulated runs (different RUN_IDs,
  // i.e. different processes — see loadRunIdModuleAsNewRun) produce the same
  // suffix; their names must NOT collide.

  it('two distinct runs produce different RUN_IDs', async () => {
    const runA = await loadRunIdModule();
    const runB = await loadRunIdModuleAsNewRun();
    // RUN_IDs include `Date.now().toString(36)` plus 6 hex chars of randomness
    // → vanishingly unlikely to collide even at sub-ms intervals.
    expect(runB.RUN_ID).not.toBe(runA.RUN_ID);
  });

  it('two runs produce non-colliding task names for the same suffix', async () => {
    const runA = await loadRunIdModule();
    const nameA = runA.runScopedName('Completed_1');
    const runB = await loadRunIdModuleAsNewRun();
    const nameB = runB.runScopedName('Completed_1');
    expect(nameA).not.toBe(nameB);
    // Each is still attributable to its own run.
    expect(runA.isCurrentRunName(nameA)).toBe(true);
    expect(runB.isCurrentRunName(nameB)).toBe(true);
    // Cross-run: A's predicate must NOT claim B's name and vice versa.
    expect(runA.isCurrentRunName(nameB)).toBe(false);
    expect(runB.isCurrentRunName(nameA)).toBe(false);
  });

  it('two runs produce non-colliding tag names for the same suffix', async () => {
    const runA = await loadRunIdModule();
    const tagA = runA.runScopedTag('rt');
    const runB = await loadRunIdModuleAsNewRun();
    const tagB = runB.runScopedTag('rt');
    expect(tagA).not.toBe(tagB);
    expect(runA.isCurrentRunTagName(tagA)).toBe(true);
    expect(runB.isCurrentRunTagName(tagB)).toBe(true);
    expect(runA.isCurrentRunTagName(tagB)).toBe(false);
    expect(runB.isCurrentRunTagName(tagA)).toBe(false);
  });

  it('safety-net startsWith contract holds across both runs', async () => {
    // OMN-83 contract: even with runId scoping, names/tags must still
    // satisfy the generic `__TEST__` / `__test-` startsWith sweep so a
    // crashed prior-run's fixtures get cleaned up.
    const runA = await loadRunIdModule();
    const nameA = runA.runScopedName('SomeTask');
    const tagA = runA.runScopedTag('some-tag');
    expect(nameA.startsWith(TEST_INBOX_PREFIX)).toBe(true);
    expect(tagA.startsWith(TEST_TAG_PREFIX)).toBe(true);

    const runB = await loadRunIdModuleAsNewRun();
    const nameB = runB.runScopedName('SomeTask');
    const tagB = runB.runScopedTag('some-tag');
    expect(nameB.startsWith(TEST_INBOX_PREFIX)).toBe(true);
    expect(tagB.startsWith(TEST_TAG_PREFIX)).toBe(true);
  });
});
