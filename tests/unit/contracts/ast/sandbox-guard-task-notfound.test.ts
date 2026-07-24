/**
 * OMN-286: the task-side sandbox guard must not collapse "task not found"
 * into "task outside sandbox" either — the same defect class fixed for
 * validateProjectInSandbox (sandbox-guard-notfound.test.ts), mirrored here
 * for validateTaskInSandbox. A not-found id writes nothing — aborting the
 * whole batch on it provides no safety and breaks the documented
 * continue-on-error partition in guarded (integration-test) runs. The guard
 * passes not-found through to the script's strict byIdentifier
 * continue-on-error; found-but-outside-sandbox still throws.
 *
 * The osascript boundary is mocked at child_process.exec (the repo's
 * established pattern); each entry in mockStdoutQueue is one guard-bridge
 * response, consumed in call order. clearSandboxCache() resets the
 * module-level sandbox-folder-id/validated-id caches in beforeEach so every
 * test pushes its OWN complete response sequence (folder id + bridge check)
 * rather than relying on a prior test in the file having warmed the cache —
 * that cross-test ordering dependency previously caused false failures
 * under isolated/filtered runs (-t / .only).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockStdoutQueue: string[] = [];

vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: unknown, out: { stdout: string }) => void) => {
    cb(null, { stdout: mockStdoutQueue.shift() ?? '{}' });
  }),
}));

import {
  validateTaskInSandbox,
  validateTaskCreate,
  clearSandboxCache,
} from '../../../../src/contracts/ast/mutation-script-builder.js';

describe('validateTaskInSandbox not-found threading (OMN-286)', () => {
  let priorGuard: string | undefined;
  let priorNodeEnv: string | undefined;

  beforeEach(() => {
    priorGuard = process.env.SANDBOX_GUARD_ENABLED;
    priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    mockStdoutQueue.length = 0;
    clearSandboxCache();
  });

  afterEach(() => {
    if (priorGuard === undefined) delete process.env.SANDBOX_GUARD_ENABLED;
    else process.env.SANDBOX_GUARD_ENABLED = priorGuard;
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  });

  it('passes a not-found id through to the script continue-on-error (no throw)', async () => {
    // Cache cleared in beforeEach — every test resolves its own folder id.
    mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
    mockStdoutQueue.push(JSON.stringify({ inSandbox: false, error: 'not_found' }));

    await expect(validateTaskInSandbox('ghost-task-1', 'bulk delete')).resolves.toBeUndefined();
  });

  it('still throws for a FOUND task outside the sandbox', async () => {
    mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
    mockStdoutQueue.push(JSON.stringify({ inSandbox: false }));

    await expect(validateTaskInSandbox('real-outside-task', 'update')).rejects.toThrow(/outside sandbox/);
  });

  it('passes a sandboxed task silently', async () => {
    mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
    mockStdoutQueue.push(JSON.stringify({ inSandbox: true }));

    await expect(validateTaskInSandbox('sandboxed-task', 'complete')).resolves.toBeUndefined();
  });

  it('a bridge failure still fails CLOSED (treated as outside, not as not-found)', async () => {
    mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
    // Non-JSON stdout -> executeGuardJXA throws -> guard must throw, never pass through.
    mockStdoutQueue.push('osascript exploded');

    await expect(validateTaskInSandbox('error-task', 'delete')).rejects.toThrow(/outside sandbox/);
  });
});

describe('validateTaskCreate parentTaskId not-found threading (OMN-286)', () => {
  let priorGuard: string | undefined;
  let priorNodeEnv: string | undefined;

  beforeEach(() => {
    priorGuard = process.env.SANDBOX_GUARD_ENABLED;
    priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    mockStdoutQueue.length = 0;
    clearSandboxCache();
  });

  afterEach(() => {
    if (priorGuard === undefined) delete process.env.SANDBOX_GUARD_ENABLED;
    else process.env.SANDBOX_GUARD_ENABLED = priorGuard;
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  });

  it('passes a not-found parentTaskId through — resolveParentTask has no name fallback, so not-found writes nothing', async () => {
    mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
    mockStdoutQueue.push(JSON.stringify({ inSandbox: false, error: 'not_found' }));

    await expect(
      validateTaskCreate({ name: '__TEST__ subtask', parentTaskId: 'ghost-parent-1' }),
    ).resolves.toBeUndefined();
  });

  it('still throws for a FOUND parent task outside the sandbox', async () => {
    mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
    mockStdoutQueue.push(JSON.stringify({ inSandbox: false }));

    await expect(validateTaskCreate({ name: '__TEST__ subtask', parentTaskId: 'real-outside-task' })).rejects.toThrow(
      /not inside sandbox/,
    );
  });
});
