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
 *   `expect(result.success).toBe(false)`.
 *
 * expectOkData — opt-in companion that asserts success AND returns the narrowed
 * payload, collapsing the common three-step pattern:
 *
 *   expectOk(result, ctx);
 *   expect(result.data).toBeDefined();   // no TS narrowing
 *   result.data.task.taskId              // .data still possibly-undefined
 *
 * into a single call:
 *
 *   const data = expectOkData(result, ctx);
 *   data.task.taskId                     // fully narrowed
 *
 * Use only when you immediately access the payload. Keep expectOk for cases
 * where data access comes later or the test logic branches on shape.
 *
 * See OMN-188.
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

/**
 * Asserts success=true and returns the narrowed, non-null data payload.
 *
 * Reuses expectOk's diagnostic-rich success assertion, then verifies data is
 * present. Throws with a clear message if success=true but data is null/undefined
 * (an unexpected server contract violation).
 *
 * Generic design: `TResult` captures the whole result object so that
 * `TResult['data']` extracts the data type. When `TResult` is `any` (the common
 * case — `callTool` returns `any`), `any['data'] = any`, so
 * `Exclude<any, null | undefined> = any` and the return type is transparent.
 * When `TResult` is a concrete type the return is narrowed to the non-nullable
 * data shape.
 *
 * @example
 *   const data = expectOkData(result, 'productivity_stats');
 *   expect(data.stats.overview.totalTasks).toBeGreaterThan(0);
 */
export function expectOkData<TResult extends { success: boolean; data?: unknown; error?: unknown }>(
  result: TResult,
  context?: string,
): Exclude<TResult['data'], null | undefined> {
  expectOk(result, context);
  if (result.data == null) {
    const label = context ? `expectOkData(${context})` : 'expectOkData';
    throw new Error(`${label}: success=true but data is ${String(result.data)}`);
  }
  return result.data as Exclude<TResult['data'], null | undefined>;
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
