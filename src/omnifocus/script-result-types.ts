/**
 * Type-safe script result handling for OmniAutomation v2.1.0
 *
 * This module defines discriminated unions and type guards to eliminate
 * scattered error checking and improve type safety across the codebase.
 */
import { z } from 'zod';

/**
 * Canonical script-error context vocabulary (OMN-159).
 *
 * Wire-contract: these strings are observable on the MCP wire — consumers and the
 * failure-log clustering pipeline may pattern-match on them. Rename only within a
 * deprecation window. All context strings emitted by script-result-types.ts,
 * OmniAutomation.ts, and src/tools/base.ts MUST come from this constant.
 */
export const SCRIPT_ERROR_CONTEXT = {
  /** {ok:false} modern JxaEnvelope error branch */
  ERROR_ENVELOPE: 'Script error envelope',
  /** {error:true} legacy dialect OR {success:false} review-script dialect */
  SCRIPT_REPORTED: 'Script reported an error',
  /** OmniAutomationError thrown from execute() and caught in executeJson() */
  EXECUTION_ERROR: 'Script execution error',
  /** Non-OmniAutomationError thrown and caught in executeJson() */
  UNEXPECTED_ERROR: 'Unexpected error during script execution',
  /** Output matched no known error dialect and failed the success schema */
  UNRECOGNIZED_SHAPE: 'Unrecognized script output shape',
  /** execJson null-guard: executeJson resolved null or undefined (mock-safety path) */
  NULL_RESULT: 'Script returned null or undefined',
  /** execJson catch: unexpected exception from executeJson itself */
  EXECUTION_EXCEPTION: 'Script execution exception',
} as const;

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
 * Discriminators are effectively disjoint on real wire shapes; if-order breaks ties (ok → error → success);
 * the order of THIS function vs schema validation is load-bearing — see spec §3.2.
 * Returns null when the value matches no known error dialect.
 *
 * Wire-contract: context strings come from SCRIPT_ERROR_CONTEXT. Rename only with a deprecation window.
 * For the {success:false} dialect: the emitted context is always SCRIPT_REPORTED; the script's own
 * `context` field (if present) is preserved in `details.scriptContext` so callers can still inspect it.
 */
export function detectKnownErrorShape(value: unknown): ScriptError | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  // Modern envelope error: {ok: false, error: {message, ...}, v} (JxaEnvelopeSchema error branch)
  if (obj.ok === false) {
    const err = obj.error as Record<string, unknown> | undefined;
    const message = err && typeof err.message === 'string' ? err.message : 'Script reported an error envelope';
    return createScriptError(message, SCRIPT_ERROR_CONTEXT.ERROR_ENVELOPE, value);
  }

  // Legacy: {error: true | 'true', message?, details?} — uses canonical SCRIPT_REPORTED context.
  // The legacy dialect MAY carry a `context` field (some AST scripts emit one), but B2 does not
  // preserve it in details — only the {success:false} dialect does, per spec §3. details passes
  // through verbatim (asymmetry vs. the {success:false} branch below).
  if (obj.error === true || obj.error === 'true') {
    const message = typeof obj.message === 'string' ? obj.message : 'Script execution failed';
    return createScriptError(message, SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED, obj.details ?? 'No additional context');
  }

  // Review-script dialect: {success: false, ...} — canonical context is SCRIPT_REPORTED;
  // script's own context field moves to details.scriptContext so callers can inspect it.
  if (obj.success === false) {
    const message =
      (typeof obj.message === 'string' && obj.message) ||
      (typeof obj.error === 'string' && obj.error) ||
      'Script execution failed';
    return createScriptError(message, SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED, buildSuccessFalseDetails(obj, value));
  }

  return null;
}

/**
 * Build the details object for the {success:false} dialect.
 * The script's `context` field moves to `details.scriptContext`; existing
 * `details` fields are spread in so they remain accessible.
 * Falls back to the raw envelope `value` when neither `details` nor a script
 * context is present.
 *
 * Consumer contract: consumers inspect `details.scriptContext` for the script's
 * original context; the rest of `details` is dialect-dependent and best-effort.
 */
function buildSuccessFalseDetails(obj: Record<string, unknown>, value: unknown): unknown {
  const scriptContext = typeof obj.context === 'string' ? obj.context : undefined;
  if (obj.details !== undefined && obj.details !== null && typeof obj.details === 'object') {
    const base = obj.details as Record<string, unknown>;
    return scriptContext ? { ...base, scriptContext } : base;
  }
  if (obj.details !== undefined) {
    return scriptContext ? { raw: obj.details, scriptContext } : { raw: obj.details };
  }
  return scriptContext ? { scriptContext } : value;
}

/** Serialize raw script output for error details, truncated to keep responses bounded. */
export function truncateRawOutput(value: unknown, max = 2000): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

// ---------------------------------------------------------------------------
// Zod 3 private-API helpers for slimUnionIssues (same introspection pattern
// as src/diagnostics/schema-drift.ts, which pins Zod ^3.25.76).
// The _def typeName strings are stable across all Zod 3.x.
// ---------------------------------------------------------------------------
type ZodDef = {
  typeName?: string;
  options?: z.ZodTypeAny[]; // ZodUnion
  schema?: z.ZodTypeAny; // ZodEffects
  value?: unknown; // ZodLiteral
};
const zDef = (s: z.ZodTypeAny): ZodDef => (s as unknown as { _def: ZodDef })._def;

/**
 * Slim `invalid_union` rejection details to the single matching branch (OMN-158 rider 2).
 *
 * PRESENTATION-ONLY: detection outcome, error message, and context are unchanged.
 * Only the content of `details.issues` in the 'Unrecognised script output shape' ScriptError
 * may differ — from listing every branch's errors to listing only the one matching branch's.
 *
 * SLIMMING ALGORITHM:
 *   1. If `issues` has no top-level `invalid_union` issue, return `issues` unchanged.
 *   2. Unwrap the union schema's branches. For each branch that is a ZodObject (or ZodEffects
 *      wrapping one), collect all fields whose schema is a ZodLiteral. A branch "matches" iff
 *      it has ≥1 literal key AND the rejected value (if an object) has every literal key equal
 *      to the literal's value.
 *   3. If EXACTLY ONE branch matches, replace `issues` with that branch's `unionErrors` entry.
 *   4. Otherwise (zero or multiple matches — e.g. two 'created' branches, or no literal
 *      discriminators like CompleteResultSchema's key-presence split) leave `issues` unchanged.
 *
 * Limitation: a literal key wrapped in ZodOptional/ZodNullable (e.g. `z.literal('x').optional()`)
 * is treated as a NON-discriminator and won't drive slimming — only bare `z.literal(...)` shape
 * fields count. All current family-schema discriminators are bare literals, so this is unreachable
 * today; documented so a future maintainer adding a wrapped-literal discriminator knows why
 * slimming silently stops firing for it.
 *
 * @param schema  The Zod schema passed to safeParse (any type; only ZodUnion is acted on).
 * @param value   The value that failed validation.
 * @param issues  The issues array from the ZodError (returned unchanged on non-union schemas).
 * @returns       The (possibly slimmed) issues array. Never mutates the input array.
 */
export function slimUnionIssues(schema: z.ZodTypeAny, value: unknown, issues: z.ZodIssue[]): z.ZodIssue[] {
  // Only act on the invalid_union top-level issue
  if (issues.length === 0) return issues;
  const top = issues[0];
  if (top.code !== 'invalid_union') return issues;

  // Require a ZodUnion schema to introspect
  if (zDef(schema).typeName !== 'ZodUnion') return issues;
  const options: z.ZodTypeAny[] = zDef(schema).options ?? [];

  // The rejected value must be an object to check literal keys
  if (!value || typeof value !== 'object' || Array.isArray(value)) return issues;
  const obj = value as Record<string, unknown>;

  // unionErrors is parallel to options: unionErrors[i] is the ZodError for options[i]
  const unionErrors: z.ZodError[] = top.unionErrors ?? [];
  if (unionErrors.length !== options.length) return issues;

  // Find branches that have ≥1 literal key and ALL their literal keys match the value
  const matchingIndices: number[] = [];

  for (let i = 0; i < options.length; i++) {
    const branch = unwrapEffects(options[i]);
    if (zDef(branch).typeName !== 'ZodObject') continue;

    const shape: Record<string, z.ZodTypeAny> = (branch as z.ZodObject<z.ZodRawShape>).shape ?? {};
    const literalEntries = Object.entries(shape).filter(([, fieldSchema]) => {
      const inner = unwrapEffects(fieldSchema);
      return zDef(inner).typeName === 'ZodLiteral';
    });

    if (literalEntries.length === 0) continue; // no literal discriminator on this branch

    // Branch matches iff every literal key in the shape matches the value's corresponding key
    const allMatch = literalEntries.every(([key, fieldSchema]) => {
      const inner = unwrapEffects(fieldSchema);
      return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] === zDef(inner).value;
    });

    if (allMatch) matchingIndices.push(i);
  }

  // Slim only when exactly one branch matches
  if (matchingIndices.length !== 1) return issues;

  const matchedBranchErrors = unionErrors[matchingIndices[0]];
  return matchedBranchErrors.issues;
}

/** Unwrap ZodEffects (transform/refine/superRefine) to reach the underlying schema. */
function unwrapEffects(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s = schema;
  while (zDef(s).typeName === 'ZodEffects') {
    s = zDef(s).schema ?? s; // ZodEffects wraps via ._def.schema
  }
  return s;
}
