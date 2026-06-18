import { z } from 'zod';

/**
 * OMN-139 family success schemas. Rules (spec §3.2 — normative):
 *  - SUCCESS BRANCH ONLY. Error branches are detectKnownErrorShape's job.
 *  - Discriminators are LITERALS (z.literal(true)), never z.boolean().
 *  - Top-level closed-world (.strict()); leaf-strict per OMN-158.
 */

// ---------------------------------------------------------------------------
// Shared leaf vocabulary (OMN-158 plan §"Shared leaf vocabulary")
// ---------------------------------------------------------------------------

/** ISO-8601 date string emitted via toISOString(); type-only (no format regex). */
export const isoDate = z.string();
export const isoDateOrNull = isoDate.nullable();
/** OMN-137 best-effort warning labels: 'label: message' strings. */
export const warningsArray = z.array(z.string());

// ---------------------------------------------------------------------------
// Factory functions (OMN-158 Task 2: evolved signatures)
// ---------------------------------------------------------------------------

/** Analytics v3 envelope: {ok: true, v, data}. */
export const V3EnvelopeSuccessSchema = z.object({ ok: z.literal(true), v: z.string(), data: z.unknown() }).strict();

/**
 * Typed v3 envelope factory (OMN-158 Task 3) — one module-scope instance per operation.
 * Replaces the shared V3EnvelopeSuccessSchema + `as z.ZodTypeAny` casts at call sites.
 * Source: all four v3 analytics scripts return {ok:true, v:'3', data:{…}}.
 */
export function v3EnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ ok: z.literal(true), v: z.string(), data: dataSchema }).strict();
}

/**
 * AST envelope (tags, recurring): {ok: true, v: 'ast', <items key>, summary?, metadata?}.
 *
 * OMN-158: rowSchema and summarySchema/metadataSchema are now typed so call sites
 * get a precise inferred return type, retiring z.ZodTypeAny returns and the
 * associated @typescript-eslint/no-unsafe-argument warnings.
 *
 * Source-verified (grep `v: 'ast'`):
 *  - tag-script-builder.ts: every success branch emits {ok:true, v:'ast', items, summary}
 *  - analyze-recurring-tasks-ast.ts buildRecurringTasksScript: emits {ok:true, v:'ast', tasks, summary, metadata}
 *  - analyze-recurring-tasks-ast.ts buildRecurringSummaryScript: emits {ok:true, v:'ast', summary, metadata}
 *    — summary-only has NO items/tasks key; that endpoint has no call site (confirmed orphan).
 *
 * Instantiate once at module scope and reuse; do not construct per request.
 */
export function astEnvelopeSchema<TRow extends z.ZodTypeAny, TSummary extends z.ZodTypeAny, TMeta extends z.ZodTypeAny>(
  itemsKey: 'items' | 'tasks',
  opts: { rowSchema?: TRow; summarySchema?: TSummary; metadataSchema?: TMeta } = {},
) {
  return z
    .object({
      ok: z.literal(true),
      v: z.literal('ast'),
      [itemsKey]: z.array(opts.rowSchema ?? z.unknown()),
      summary: opts.summarySchema ? opts.summarySchema.optional() : z.unknown().optional(),
      metadata: opts.metadataSchema ? opts.metadataSchema.optional() : z.unknown().optional(),
    })
    .strict();
}

/**
 * List/query results whose items key varies by script path (tasks|items, projects|items, …).
 * One strict variant per key, unioned. `extras` adds optional sibling keys present on some paths.
 *
 * OMN-158: rowSchema and metadataSchema are now typed — return type is inferred, retiring
 * the z.ZodTypeAny return annotation and associated @typescript-eslint/no-unsafe-argument warnings.
 *
 * Instantiate once at module scope and reuse; do not construct per request.
 */
export function listResultSchema<TRow extends z.ZodTypeAny, TMeta extends z.ZodTypeAny>(
  itemKeys: readonly string[],
  opts: { rowSchema?: TRow; metadata?: TMeta | true; extras?: Record<string, z.ZodTypeAny> } = {},
) {
  // Build the metadata field: typed schema if provided, unknown if legacy boolean true, absent otherwise.
  let metadataEntry: Record<string, z.ZodTypeAny> = {};
  if (opts.metadata === true) {
    metadataEntry = { metadata: z.unknown().optional() };
  } else if (opts.metadata !== undefined) {
    // narrowed to TMeta — `true` and `undefined` ruled out above
    metadataEntry = { metadata: opts.metadata.optional() };
  }

  const variants = itemKeys.map((k) =>
    z
      .object({
        [k]: z.array(opts.rowSchema ?? z.unknown()),
        ...metadataEntry,
        ...(opts.extras ?? {}),
      })
      .strict(),
  );
  return variants.length === 1
    ? variants[0]!
    : z.union(variants as [z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>, ...z.ZodObject<z.ZodRawShape>[]]);
}

/** Review-family success: {success: true, ...op keys}. Factory keeps the literal discriminator mandatory.
 * Instantiate once at module scope and reuse; do not construct per request. */
export function reviewSuccessSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object({ success: z.literal(true), ...shape }).strict();
}
