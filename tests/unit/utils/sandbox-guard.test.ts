import { describe, it, expect } from 'vitest';
import { assertSandboxGuardAtStartup, SandboxGuardMisconfiguration } from '../../../src/utils/sandbox-guard.js';

describe('assertSandboxGuardAtStartup (OMN-46)', () => {
  it('returns silently when NODE_ENV is undefined (production-shape spawn)', () => {
    expect(() => assertSandboxGuardAtStartup({})).not.toThrow();
  });

  it('returns silently when NODE_ENV !== "test" (production)', () => {
    expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('returns silently when NODE_ENV === "test" AND SANDBOX_GUARD_ENABLED === "true"', () => {
    expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'test', SANDBOX_GUARD_ENABLED: 'true' })).not.toThrow();
  });

  it('THROWS SandboxGuardMisconfiguration when NODE_ENV === "test" and SANDBOX_GUARD_ENABLED is unset', () => {
    expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'test' })).toThrow(SandboxGuardMisconfiguration);
  });

  it('THROWS when NODE_ENV === "test" and SANDBOX_GUARD_ENABLED is the empty string', () => {
    expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'test', SANDBOX_GUARD_ENABLED: '' })).toThrow(
      SandboxGuardMisconfiguration,
    );
  });

  it('THROWS when NODE_ENV === "test" and SANDBOX_GUARD_ENABLED === "false" (explicit opt-out is still a bypass)', () => {
    expect(() => assertSandboxGuardAtStartup({ NODE_ENV: 'test', SANDBOX_GUARD_ENABLED: 'false' })).toThrow(
      SandboxGuardMisconfiguration,
    );
  });

  it('the error message names OMN-46 and points at the fix location', () => {
    try {
      assertSandboxGuardAtStartup({ NODE_ENV: 'test' });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/OMN-46/);
      expect((err as Error).message).toMatch(/mcp-test-client/);
      expect((err as Error).message).toMatch(/SANDBOX_GUARD_ENABLED/);
    }
  });

  it('reads from process.env when no override is passed', () => {
    // Test that the default-arg path doesn't crash. Whether it throws or not depends on
    // the running env (vitest typically sets NODE_ENV=test); the assertion is just that
    // it doesn't error in unexpected ways.
    const fn = () => assertSandboxGuardAtStartup();
    // In this unit-test process: NODE_ENV='test' typically, SANDBOX_GUARD_ENABLED unset →
    // would throw. That's correct behavior; we only assert the function uses process.env.
    if (process.env.NODE_ENV === 'test' && process.env.SANDBOX_GUARD_ENABLED !== 'true') {
      expect(fn).toThrow(SandboxGuardMisconfiguration);
    } else {
      expect(fn).not.toThrow();
    }
  });
});
