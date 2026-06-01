import { z } from 'zod';

/**
 * OMN-122: normalize-then-strict input layer for local-model (7-8B Ollama) support.
 *
 * Capable/cloud models already emit the canonical envelope and never touch this code:
 * `parseWithNormalization` tries the existing STRICT schema first, and only on a
 * ZodError does it attempt a bounded, evidence-backed repair (the leniencies below)
 * before re-validating against the SAME strict schema. An input that can't be repaired
 * returns the ORIGINAL strict error — unchanged behavior for everyone.
 *
 * Every leniency here is justified by the OMN-121 conformance matrix (6 models, 19
 * cases): tool *selection* was 100% correct across all models; the entire gap is
 * request-ENVELOPE shape. See OMN-122 for the prioritized list and projected lift.
 */

/** Per-tool wrapper shape the normalizer needs to lift root-level fields correctly. */
export interface NormalizationHint {
  /** The canonical wrapper key the inner payload belongs under. */
  wrapperKey: 'query' | 'analysis' | 'mutation';
  /** The discriminant field that identifies the inner payload at the root. */
  discriminant: 'type' | 'operation';
}

/**
 * Single source of truth mapping advertised tool name → wrapper hint. Consumed by
 * both `BaseTool.execute` (the server front door) and the conformance probe's grader,
 * so the probe measures exactly what the server accepts. Tools absent from this map
 * (e.g. `system`, which is flat) get strict-only behavior with zero normalization.
 */
export const WRAPPER_HINTS: Record<string, NormalizationHint> = {
  omnifocus_read: { wrapperKey: 'query', discriminant: 'type' },
  omnifocus_analyze: { wrapperKey: 'analysis', discriminant: 'type' },
  omnifocus_write: { wrapperKey: 'mutation', discriminant: 'operation' },
};

export interface NormalizeResult<T> {
  success: boolean;
  /** Present when success — the strict-validated (and possibly transformed) payload. */
  data?: T;
  /** Present when !success — the ORIGINAL strict error (pre-normalization). */
  error?: z.ZodError;
  /** Names of the leniencies applied. Empty on the canonical path and on failure. */
  applied: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Best-effort parse of a string a model intended as a JSON object. Tries strict
 * JSON.parse first; on failure, repairs the dominant local-model malformation —
 * TRUNCATED JSON with missing trailing closers (the 70b's signature, OMN-121) — by
 * balancing unclosed `{`/`[` (respecting string literals + escapes) and retrying.
 * Returns undefined if it still can't parse OR doesn't parse to a plain object, so an
 * unrelated string (or a JSON scalar/array) is never coerced into a wrapper value.
 */
function tryParseObjectString(s: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(s);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    /* fall through to repair */
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (stack.length === 0) return undefined; // not a truncation we can repair

  const repaired = s + [...stack].reverse().join('');
  try {
    const parsed: unknown = JSON.parse(repaired);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pure, side-effect-free transform: apply the bounded leniencies to `args`.
 * Returns the rewritten args plus the names of the leniencies applied (empty if
 * nothing was recognized as repairable).
 */
function normalizeArgs(args: unknown, hint: NormalizationHint): { args: unknown; applied: string[] } {
  const applied: string[] = [];
  let current = args;

  // ── Leniency #2: stringified-wrapper repair-parse ──────────────────────────
  // The wrapper value arrived as a JSON string, often TRUNCATED (missing trailing
  // closers) so coerceObject's strict JSON.parse rejected it. Repair-parse it back
  // to an object. (Well-formed JSON strings already pass via coerceObject and never
  // reach here.) Runs first so #1/#3 see a real object.
  if (isPlainObject(current) && typeof current[hint.wrapperKey] === 'string') {
    const parsed = tryParseObjectString(current[hint.wrapperKey] as string);
    if (parsed !== undefined) {
      current = { ...current, [hint.wrapperKey]: parsed };
      applied.push('stringified-wrapper-repair');
    }
  }

  // ── Leniency #1: wrapper-lift ──────────────────────────────────────────────
  // The model emitted the inner payload at the root, missing the wrapper key but
  // carrying the discriminant (e.g. `{type:'tasks'}` → `{query:{type:'tasks'}}`).
  if (isPlainObject(current) && !(hint.wrapperKey in current) && hint.discriminant in current) {
    current = { [hint.wrapperKey]: { ...current } };
    applied.push('wrapper-lift');
  }

  // ── Leniency #3: data-hoist on non-create mutations ────────────────────────
  // Small models nest `id` inside `data` on complete/update/delete (the create
  // shape) instead of placing it at the mutation level. Hoist `id` out of `data`;
  // for update, map any remaining `data` fields → `changes`; for complete/delete,
  // drop the emptied `data` (those operations don't carry it).
  if (hint.wrapperKey === 'mutation' && isPlainObject(current) && isPlainObject(current.mutation)) {
    const m = current.mutation;
    const op = m.operation;
    if (
      (op === 'complete' || op === 'update' || op === 'delete') &&
      m.id === undefined &&
      isPlainObject(m.data) &&
      typeof m.data.id === 'string'
    ) {
      const data = { ...m.data };
      const id = data.id as string;
      delete data.id;
      const newMutation: Record<string, unknown> = { ...m, id };
      delete newMutation.data;
      // Don't silently drop residual fields the model nested in `data` (OMN-97
      // anti-pattern). update: remaining → `changes` (the canonical field name).
      // complete: remaining (e.g. completionDate) are top-level fields, spread them
      // up. delete: takes no other fields, so leftovers are dropped — strict
      // re-validation would reject them anyway, leaving the original error intact.
      if (Object.keys(data).length > 0) {
        if (op === 'update') {
          newMutation.changes = data;
        } else if (op === 'complete') {
          Object.assign(newMutation, data);
        }
      }
      current = { ...current, mutation: newMutation };
      applied.push('data-hoist-id');
    }
  }

  return { args: current, applied };
}

/**
 * Strict-first, normalize-on-failure, re-validate-strict.
 *
 * 1. Try the strict schema. On success → return untouched (`applied: []`).
 * 2. On ZodError, if the tool has a wrapper hint, attempt normalization.
 * 3. Re-run the SAME strict schema on the normalized args. On success → return it
 *    with the applied leniencies recorded. On failure → return the ORIGINAL error.
 */
export function parseWithNormalization<S extends z.ZodTypeAny>(
  schema: S,
  args: unknown,
  toolName: string,
): NormalizeResult<z.infer<S>> {
  const first = schema.safeParse(args);
  if (first.success) {
    return { success: true, data: first.data as z.infer<S>, applied: [] };
  }

  const hint = WRAPPER_HINTS[toolName];
  if (!hint) {
    return { success: false, error: first.error, applied: [] };
  }

  const { args: normalized, applied } = normalizeArgs(args, hint);
  if (applied.length === 0) {
    return { success: false, error: first.error, applied: [] };
  }

  const second = schema.safeParse(normalized);
  if (second.success) {
    return { success: true, data: second.data as z.infer<S>, applied };
  }

  // Normalization didn't help → preserve the ORIGINAL strict error (unchanged behavior).
  return { success: false, error: first.error, applied: [] };
}
