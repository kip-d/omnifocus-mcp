/**
 * OMN-359: message for an osascript child that closed abnormally.
 *
 * `spawn({ timeout })` kills the child with SIGTERM, and `close` then fires
 * with `(code: null, signal: 'SIGTERM')`. Reporting that as "failed with code
 * null" hid the timeout, so categorizeError never produced SCRIPT_TIMEOUT.
 * A signal can also come from outside (e.g. server shutdown), so a kill only
 * counts as a timeout once the timeout has actually elapsed.
 */
export function describeAbnormalExit(
  code: number | null,
  signal: string | null,
  elapsedMs: number,
  timeoutMs: number,
): string {
  if (signal) {
    return elapsedMs >= timeoutMs
      ? `Script timed out after ${timeoutMs}ms (signal ${signal})`
      : `Script terminated by signal ${signal} after ${elapsedMs}ms`;
  }
  return `Script execution failed with code ${code}`;
}
