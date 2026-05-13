/**
 * expectOk — diagnostic-rich replacement for `expect(result.success).toBe(true)`
 *
 * The bare assertion swallows `result.error`, leaving every flaky integration
 * failure with only "expected false to be true" and a line number. That makes
 * "OmniFocus was busy" indistinguishable from "we broke the update code path"
 * without re-running. This helper preserves the underlying error in the failure
 * message so the cause is visible immediately.
 *
 * See OMN-56.
 *
 * Usage:
 *   import { expectOk } from '../helpers/expect-ok.js';
 *
 *   const updateResult = await client.callTool('omnifocus_write', { ... });
 *   expectOk(updateResult, 'update deferDate');
 *   // After this call, TypeScript narrows updateResult.success to true.
 *
 * Do NOT use for negative-path assertions — those should keep using
 * `expect(result.success).toBe(false)`.
 */

export interface ResultLike {
  success: boolean;
  error?: unknown;
}

export function expectOk<T extends ResultLike>(result: T, context?: string): asserts result is T & { success: true } {
  if (result && result.success === true) {
    return;
  }

  const label = context ? `expectOk(${context})` : 'expectOk';

  if (!result || typeof result !== 'object') {
    throw new Error(`${label}: expected an object with success=true, got ${String(result)}`);
  }

  const errText = formatError((result as ResultLike).error);
  throw new Error(`${label}: expected success=true, got success=${String(result.success)} — error: ${errText}`);
}

function formatError(err: unknown): string {
  if (err === undefined) return '<no error field>';
  if (err === null) return 'null';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.stack ?? err.message;
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    // JSON.stringify failed (circular ref); avoid String(err)'s [object Object].
    return `<unstringifiable ${typeof err}>`;
  }
}
