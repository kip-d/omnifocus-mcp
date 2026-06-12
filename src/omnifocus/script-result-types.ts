/**
 * Type-safe script result handling for OmniAutomation v2.1.0
 *
 * This module defines discriminated unions and type guards to eliminate
 * scattered error checking and improve type safety across the codebase.
 */

/**
 * Discriminated union for script execution results
 * Replaces manual checking of result.error/result.success patterns
 */
export type ScriptResult<T = unknown> = ScriptSuccess<T> | ScriptError;

export interface ScriptSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ScriptError {
  success: false;
  error: string;
  context?: string;
  details?: unknown;
  stack?: string;
}

/**
 * Type guards for ScriptResult discrimination
 */
export function isScriptSuccess<T>(result: ScriptResult<T>): result is ScriptSuccess<T> {
  return result.success === true;
}

export function isScriptError<T>(result: ScriptResult<T>): result is ScriptError {
  return result.success === false;
}

/**
 * Helpers to create ScriptResult instances
 */
export function createScriptSuccess<T>(data: T): ScriptSuccess<T> {
  return { success: true, data };
}

export function createScriptError(error: string, context?: string, details?: unknown, stack?: string): ScriptError {
  return { success: false, error, context, details, stack };
}

/**
 * Known error dialects intercepted BEFORE success-schema validation (OMN-139 §3.1 step 1).
 * Order of checks inside is irrelevant (the dialects' discriminators are disjoint);
 * the order of THIS function vs schema validation is load-bearing — see spec §3.2.
 * Returns null when the value matches no known error dialect.
 */
export function detectKnownErrorShape(value: unknown): ScriptError | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  // Modern envelope error: {ok: false, error: {message, ...}, v} (JxaEnvelopeSchema error branch)
  if (obj.ok === false) {
    const err = obj.error as Record<string, unknown> | undefined;
    const message = err && typeof err.message === 'string' ? err.message : 'Script reported an error envelope';
    return createScriptError(message, 'Script error envelope', value);
  }

  // Legacy: {error: true | 'true', message?, details?} — context string is wire-observable, preserve verbatim
  if (obj.error === true || obj.error === 'true') {
    const message = typeof obj.message === 'string' ? obj.message : 'Script execution failed';
    return createScriptError(message, 'Legacy script error', obj.details ?? 'No additional context');
  }

  // Review-script dialect: {success: false, ...} — script's own context wins (spec §3.4)
  if (obj.success === false) {
    const message =
      (typeof obj.message === 'string' && obj.message) ||
      (typeof obj.error === 'string' && obj.error) ||
      'Script execution failed';
    const context = typeof obj.context === 'string' ? obj.context : 'Legacy script error';
    return createScriptError(message, context, obj.details ?? value);
  }

  return null;
}

/** Serialize raw script output for error details, truncated to keep responses bounded. */
export function truncateRawOutput(value: unknown, max = 2000): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}
