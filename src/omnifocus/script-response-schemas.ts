import { z } from 'zod';

/**
 * OMN-139 family success schemas. Rules (spec §3.2 — normative):
 *  - SUCCESS BRANCH ONLY. Error branches are detectKnownErrorShape's job.
 *  - Discriminators are LITERALS (z.literal(true)), never z.boolean().
 *  - Top-level closed-world (.strict()); leaves lenient (z.unknown()). Leaf-strict = OMN-158.
 */

/** Analytics v3 envelope: {ok: true, v, data}. */
export const V3EnvelopeSuccessSchema = z.object({ ok: z.literal(true), v: z.string(), data: z.unknown() }).strict();

/** AST envelope (tags, recurring): {ok: true, v: 'ast', <items key>, summary?, metadata?}.
 *
 * Source-verified (grep `v: 'ast'`):
 *  - tag-script-builder.ts: every success branch emits {ok:true, v:'ast', items, summary}
 *  - analyze-recurring-tasks-ast.ts buildRecurringTasksScript: emits {ok:true, v:'ast', tasks, summary, metadata}
 *  - analyze-recurring-tasks-ast.ts buildRecurringSummaryScript: emits {ok:true, v:'ast', summary, metadata}
 *    — summary-only has NO items/tasks key; that endpoint does not go through this factory.
 *
 * Instantiate once at module scope and reuse; do not construct per request.
 */
export function astEnvelopeSchema(itemsKey: 'items' | 'tasks') {
  return z
    .object({
      ok: z.literal(true),
      v: z.literal('ast'),
      [itemsKey]: z.array(z.unknown()),
      summary: z.unknown().optional(),
      metadata: z.unknown().optional(),
    })
    .strict();
}

/**
 * List/query results whose items key varies by script path (tasks|items, projects|items, …).
 * One strict variant per key, unioned. `extras` adds optional sibling keys present on some paths.
 *
 * Instantiate once at module scope and reuse; do not construct per request.
 */
export function listResultSchema(
  itemKeys: readonly string[],
  opts: { metadata?: boolean; extras?: Record<string, z.ZodTypeAny> } = {},
): z.ZodTypeAny {
  // Annotated as z.ZodTypeAny[]: TS drops the computed [k] key from the inferred
  // object type, so the unannotated array would not satisfy the tuple cast below.
  const variants: z.ZodTypeAny[] = itemKeys.map((k) =>
    z
      .object({
        [k]: z.array(z.unknown()),
        ...(opts.metadata ? { metadata: z.unknown().optional() } : {}),
        ...(opts.extras ?? {}),
      })
      .strict(),
  );
  return variants.length === 1 ? variants[0] : z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
}

/**
 * countOnly result — WIRE shape from buildTaskCountScript (src/contracts/ast/script-builder.ts,
 * grep `task_count_omnijs`). Source-verified against its success JSON.stringify:
 *   {count, filters_applied, query_time_ms, optimization, filter_description, scanned, total_tasks}
 *   plus conditional spread: {limited:true, warning} or {limited:false}.
 */
export const CountResultSchema = z
  .object({
    count: z.number(),
    filters_applied: z.unknown().optional(),
    query_time_ms: z.unknown().optional(),
    optimization: z.unknown().optional(),
    filter_description: z.unknown().optional(),
    scanned: z.unknown().optional(),
    total_tasks: z.unknown().optional(),
    limited: z.unknown().optional(),
    warning: z.string().optional(),
  })
  .strict();

/**
 * Export results — WIRE shape union of all script success branches.
 *
 * Source-verified:
 *  - script-builder.ts task export, buildExportTasksScript (grep `context: 'export_tasks'`):
 *    csv empty: {format, data, count, duration, message?}
 *    csv non-empty: {format, data, count, duration, limited, message?}
 *    markdown: {format, data, count, duration}
 *    json: {format, data, count, duration, limited, debug, message?}
 *  - src/omnifocus/scripts/export/export-projects.ts (grep `export_projects`):
 *    csv: {format, data, count, duration}
 *    markdown: {format, data, count, duration}
 *    json: {format, data, count, duration, debug}
 *
 * Union of all success branches' top-level keys:
 *   REQUIRED: format, data, count, duration
 *   OPTIONAL: limited, message, debug
 */
export const ExportResultSchema = z
  .object({
    format: z.string(),
    data: z.unknown(),
    count: z.number(),
    duration: z.unknown(),
    limited: z.boolean().optional(),
    message: z.unknown().optional(),
    debug: z.unknown().optional(),
  })
  .strict();

/** Review-family success: {success: true, ...op keys}. Factory keeps the literal discriminator mandatory.
 * Instantiate once at module scope and reuse; do not construct per request. */
export function reviewSuccessSchema(shape: Record<string, z.ZodTypeAny>) {
  return z.object({ success: z.literal(true), ...shape }).strict();
}

/**
 * Write-tool task create/update result (NOT v3-wrapped — wrapInLauncher returns the OmniJS payload raw).
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (grep the envelope construction):
 *  - buildCreateTaskProgram envelope:
 *    {taskId, name, note, flagged, dueDate, deferDate, plannedDate, estimatedMinutes, tags, project, inInbox, warnings, created:true}
 *  - buildUpdateTaskProgram envelope:
 *    {taskId, name, flagged, updated:true, warnings}  ← FEWER keys than create; both must validate.
 *
 * The .refine() enforces at least one discriminator is present.
 */
export const TaskWriteResultSchema = z
  .object({
    taskId: z.string(),
    name: z.string(),
    note: z.unknown().optional(),
    flagged: z.unknown().optional(),
    dueDate: z.unknown().optional(),
    deferDate: z.unknown().optional(),
    plannedDate: z.unknown().optional(),
    estimatedMinutes: z.unknown().optional(),
    tags: z.unknown().optional(),
    project: z.unknown().optional(),
    inInbox: z.unknown().optional(),
    warnings: z.unknown().optional(),
    created: z.literal(true).optional(),
    updated: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => o.created === true || o.updated === true, {
    message: 'missing created/updated discriminator',
  });
