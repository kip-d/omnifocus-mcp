/**
 * OMN-286: the sandbox guard must not collapse "project not found" into
 * "project outside sandbox". A not-found id writes nothing — aborting the
 * whole batch on it provides no safety and breaks the documented
 * continue-on-error partition in guarded (integration-test) runs. The guard
 * passes not-found through to the script's strict byIdentifier
 * continue-on-error; found-but-outside-sandbox still throws.
 *
 * The osascript boundary is mocked at child_process.exec (the repo's
 * established pattern); each entry in mockStdoutQueue is one guard-bridge
 * response, consumed in call order (first call resolves the sandbox folder
 * id, which is then cached module-wide).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockStdoutQueue: string[] = [];

vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: unknown, out: { stdout: string }) => void) => {
    cb(null, { stdout: mockStdoutQueue.shift() ?? '{}' });
  }),
}));

import { validateProjectInSandbox } from '../../../../src/contracts/ast/mutation-script-builder.js';

describe('validateProjectInSandbox not-found threading (OMN-286)', () => {
  let priorGuard: string | undefined;
  let priorNodeEnv: string | undefined;

  beforeEach(() => {
    priorGuard = process.env.SANDBOX_GUARD_ENABLED;
    priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
    mockStdoutQueue.length = 0;
  });

  afterEach(() => {
    if (priorGuard === undefined) delete process.env.SANDBOX_GUARD_ENABLED;
    else process.env.SANDBOX_GUARD_ENABLED = priorGuard;
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  });

  it('passes a not-found id through to the script continue-on-error (no throw)', async () => {
    // First guard call in this file also resolves the sandbox folder id.
    mockStdoutQueue.push(JSON.stringify({ folderId: 'SBX-FOLDER' }));
    mockStdoutQueue.push(JSON.stringify({ inSandbox: false, error: 'not_found' }));

    await expect(validateProjectInSandbox('ghost-id-1', 'mark reviewed')).resolves.toBeUndefined();
  });

  it('still throws for a FOUND project outside the sandbox', async () => {
    mockStdoutQueue.push(JSON.stringify({ inSandbox: false }));

    await expect(validateProjectInSandbox('real-outside-id', 'mark reviewed')).rejects.toThrow(/outside sandbox/);
  });

  it('passes a sandboxed project silently', async () => {
    mockStdoutQueue.push(JSON.stringify({ inSandbox: true }));

    await expect(validateProjectInSandbox('sandboxed-id', 'update')).resolves.toBeUndefined();
  });

  it('a bridge failure still fails CLOSED (treated as outside, not as not-found)', async () => {
    // Non-JSON stdout -> executeGuardJXA throws -> guard must throw, never pass through.
    mockStdoutQueue.push('osascript exploded');

    await expect(validateProjectInSandbox('error-id', 'delete')).rejects.toThrow(/outside sandbox/);
  });
});
