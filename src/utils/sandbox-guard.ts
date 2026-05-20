/**
 * Sandbox-guard startup assertion (OMN-46).
 *
 * The MCP server's in-process write guards (mutation-script-builder.ts
 * `isTestMode`) only fire when BOTH `NODE_ENV='test'` AND
 * `SANDBOX_GUARD_ENABLED='true'`. If a test harness spawns the server with
 * `NODE_ENV='test'` but forgets to propagate `SANDBOX_GUARD_ENABLED`, the
 * guards silently skip and writes hit the live OmniFocus database. That's
 * how OMN-46's `__test-update-ops-*` and tag-management fixtures leaked
 * into production data — and kept leaking after the original report.
 *
 * This module's `assertSandboxGuardAtStartup()` is called from the server
 * entry point. It refuses to start a test-mode server whose guard is unset
 * — converts the silent bypass into a loud crash at startup.
 *
 * NOT called from unit tests (they don't run the server entry point) so
 * mutation-script-builder unit tests still see `isTestMode() === false`
 * and exercise guard-skip paths unchanged.
 */

export class SandboxGuardMisconfiguration extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxGuardMisconfiguration';
  }
}

/**
 * Fail-loud check for the server entry point.
 *
 * Throws if `NODE_ENV === 'test'` and `SANDBOX_GUARD_ENABLED !== 'true'` —
 * the exact configuration that lets test writes silently hit live DB.
 *
 * Returns silently in all other cases:
 *  - production (`NODE_ENV !== 'test'`): no requirement.
 *  - integration test with guard set (`SANDBOX_GUARD_ENABLED === 'true'`): OK.
 *
 * @param env Optional env override for tests. Defaults to `process.env`.
 */
export function assertSandboxGuardAtStartup(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== 'test') return;
  if (env.SANDBOX_GUARD_ENABLED === 'true') return;

  throw new SandboxGuardMisconfiguration(
    'Refusing to start MCP server: NODE_ENV is "test" but SANDBOX_GUARD_ENABLED is ' +
      `${JSON.stringify(env.SANDBOX_GUARD_ENABLED ?? null)}. ` +
      'The in-process write guards (mutation-script-builder.ts) require both env vars to ' +
      'be set; without the guard, writes hit the live OmniFocus database. ' +
      'Fix: set SANDBOX_GUARD_ENABLED="true" in the spawn env (see tests/integration/helpers/mcp-test-client.ts), ' +
      'or run with NODE_ENV unset for production. ' +
      'Background: OMN-46.',
  );
}
