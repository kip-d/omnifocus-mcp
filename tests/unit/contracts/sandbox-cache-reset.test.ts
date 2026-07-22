/**
 * OMN-283 re-gate — clearSandboxCache() is the documented reset hook for
 * mutation-script-builder's module-level sandbox caches
 * (docs/CONCERNS-RESPONSE-2026-06.md answers the mutable-module-state
 * concern by pointing at it). The orphan sweep briefly deleted it because
 * it had zero callers; this suite exercises it behaviorally so it is
 * genuinely covered, not just kept on faith.
 *
 * child_process.exec is mocked to ALWAYS fail, so the JXA guard path is
 * deterministic (and never spawns osascript in a unit run): a cached ID
 * short-circuits before exec; a cleared cache falls through to the failing
 * exec and the guard rejects. The behavioral difference IS the assertion
 * that clearSandboxCache actually cleared.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: Object.assign(
      (_cmd: string, cb: (err: Error | null, out?: { stdout: string; stderr: string }) => void) => {
        cb(new Error('unit-test stub: no osascript'));
      },
      // strip Node's promisify custom so promisify falls back to the
      // callback convention above
      {},
    ),
  };
});

import {
  clearSandboxCache,
  markTaskAsValidated,
  validateTaskCreate,
} from '../../../src/contracts/ast/mutation-script-builder.js';
import type { TaskCreateData } from '../../../src/contracts/mutations.js';

const SUBTASK: TaskCreateData = { name: 'child', parentTaskId: 'fake-parent-id' } as TaskCreateData;

describe('clearSandboxCache — documented test-hygiene reset hook', () => {
  beforeEach(() => {
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    clearSandboxCache();
  });

  afterEach(() => {
    delete process.env.SANDBOX_GUARD_ENABLED;
    clearSandboxCache();
  });

  it('a cache-validated parent short-circuits the guard without touching JXA', async () => {
    markTaskAsValidated('fake-parent-id');
    await expect(validateTaskCreate(SUBTASK)).resolves.toBeUndefined();
  });

  it('clearSandboxCache actually clears: the same parent fails the guard afterward', async () => {
    markTaskAsValidated('fake-parent-id');
    await expect(validateTaskCreate(SUBTASK)).resolves.toBeUndefined();

    clearSandboxCache();

    // Cache gone → guard falls through to the (stubbed, failing) JXA path
    // → parent reads as not-in-sandbox → TEST GUARD rejection. If
    // clearSandboxCache() silently no-oped, this would resolve and fail
    // the test — the watched-it-fail direction.
    await expect(validateTaskCreate(SUBTASK)).rejects.toThrow('TEST GUARD');
  });
});
