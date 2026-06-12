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
 * Slimmed-data bulk read — emitted by the inline JXA script in fetchSlimmedData
 * (src/tools/unified/OmniFocusAnalyzeTool.ts, method fetchSlimmedData).
 *
 * Wire shape verified against the inline return statement:
 *   return JSON.stringify({ tasks, projects, tags })
 * where tasks/projects/tags are arrays built by JXA iteration.
 */
export const SlimmedDataSchema = z
  .object({
    tasks: z.array(z.unknown()),
    projects: z.array(z.unknown()),
    tags: z.array(z.unknown()),
  })
  .strict();

/**
 * Recurring patterns result — emitted by GET_RECURRING_PATTERNS_SCRIPT
 * (src/omnifocus/scripts/recurring/get-recurring-patterns.ts).
 *
 * Wire shape verified against the outer JXA spread:
 *   return JSON.stringify({ ...parsed, duration, debug })
 * where parsed = { totalRecurring, patterns, byProject, mostCommon }
 * and mostCommon may be null when no patterns exist.
 */
export const RecurringPatternsSchema = z
  .object({
    totalRecurring: z.number(),
    patterns: z.array(z.unknown()),
    byProject: z.array(z.unknown()),
    mostCommon: z.unknown(),
    duration: z.unknown(),
    debug: z.unknown().optional(),
  })
  .strict();

/**
 * Project id-lookup result — emitted by buildProjectByIdScript.
 * Wire shape: {projects, count, mode, targetId}
 * NOT the same as filtered-projects (which emits {projects, metadata}).
 *
 * Source: src/contracts/ast/script-builder.ts → buildProjectByIdScript →
 *   return JSON.stringify({ projects, count, mode: 'id_lookup', targetId }).
 *
 * Moved here from OmniFocusReadTool.ts (Task 7 carry-forward) so dedicated
 * variants live in the schemas module alongside the families they belong to.
 */
export const ProjectByIdSchema = z
  .object({
    projects: z.array(z.unknown()),
    count: z.number(),
    mode: z.string(),
    targetId: z.string(),
  })
  .strict();

/**
 * Folder list result — emitted by buildFilteredFoldersScript.
 * Wire shape: {success: true, folders, metadata}
 * Note: uses {success: true} literal discriminator (not {ok: true, v: 'ast'}).
 *
 * Source: src/contracts/ast/script-builder.ts → buildFilteredFoldersScript →
 *   return JSON.stringify({ success: true, folders: results, metadata: {...} }).
 *
 * Moved here from OmniFocusReadTool.ts (Task 7 carry-forward) so dedicated
 * variants live in the schemas module alongside the families they belong to.
 */
export const FolderListSchema = z
  .object({
    success: z.literal(true),
    folders: z.array(z.unknown()),
    metadata: z.unknown().optional(),
  })
  .strict();

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

/**
 * Complete result — task or project variant.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (lowerComplete):
 *  - task variant:    {taskId,    name, completed: true, completionDate}
 *  - project variant: {projectId, name, completed: true, completionDate}
 *
 * Union: one of taskId OR projectId required (each variant strict).
 */
export const CompleteResultSchema = z.union([
  z
    .object({
      taskId: z.string(),
      name: z.string(),
      completed: z.literal(true),
      completionDate: z.unknown(),
    })
    .strict(),
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      completed: z.literal(true),
      completionDate: z.unknown(),
    })
    .strict(),
]);

/**
 * Delete result — task or project variant.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (lowerDelete):
 *  - task variant:    {taskId,    name, deleted: true}
 *  - project variant: {projectId, name, deleted: true}
 */
export const DeleteResultSchema = z.union([
  z
    .object({
      taskId: z.string(),
      name: z.string(),
      deleted: z.literal(true),
    })
    .strict(),
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      deleted: z.literal(true),
    })
    .strict(),
]);

/**
 * Bulk task delete result.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (buildBulkDeleteTasksProgram):
 *  {deleted: _deleted, errors: _errors, message}
 *
 * NUANCE (OMN-144): `errors` here is per-item partial-failure DATA (success contract);
 * it is NOT the top-level {error: true} error dialect. The script never emits
 * success:false — zero-deletion failure is detected in the TOOL LAYER (handleBulkDeleteTasks)
 * and expressed as a tool-level error envelope, not a script-level one. So
 * BulkDeleteResultSchema is success-only and includes the errors array.
 */
export const BulkDeleteResultSchema = z
  .object({
    deleted: z.array(z.unknown()),
    errors: z.array(z.unknown()),
    message: z.string(),
  })
  .strict();

/**
 * Project write result — create or update variant.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts:
 *  - buildCreateProjectProgram envelope:
 *    {projectId, name, note, flagged, sequential, dueDate, deferDate, plannedDate,
 *     folder, tags, warnings, created: true}
 *  - buildUpdateProjectProgram envelope:
 *    {projectId, name, flagged, status, updated: true, warnings}
 */
export const ProjectWriteResultSchema = z.union([
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      note: z.unknown(),
      flagged: z.unknown(),
      sequential: z.unknown(),
      dueDate: z.unknown(),
      deferDate: z.unknown(),
      plannedDate: z.unknown(),
      folder: z.unknown(),
      tags: z.unknown(),
      warnings: z.unknown(),
      created: z.literal(true),
    })
    .strict(),
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      flagged: z.unknown(),
      status: z.unknown(),
      updated: z.literal(true),
      warnings: z.unknown(),
    })
    .strict(),
]);

/**
 * Folder create result.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (buildCreateFolderProgram):
 *  {folderId, name, parentFolder, warnings, created: true}
 */
export const FolderCreateResultSchema = z
  .object({
    folderId: z.string(),
    name: z.string(),
    parentFolder: z.unknown(),
    warnings: z.unknown(),
    created: z.literal(true),
  })
  .strict();

/**
 * Batch create result.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (buildBatchCreateTasksProgram):
 *  return_({results: ref('results')})  — an array of per-item result objects.
 *
 * Leaf contents are unknown (OMN-158 will add per-item shape strictness).
 */
export const BatchCreateResultSchema = z
  .object({
    results: z.array(z.unknown()),
  })
  .strict();

/**
 * Tag mutation result — discriminated union over all tag action variants.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (each tag program):
 *
 *  created (path):  {action: 'created', tagName, tagId, path, createdSegments, message}
 *                   — buildCreateTagProgram, path variant
 *  created (flat):  {action: 'created', tagName, tagId, parentTagName, parentTagId, message}
 *                   — buildCreateTagProgram, flat variant
 *  renamed:         {action: 'renamed', oldName, newName, message}
 *                   — buildRenameTagProgram
 *  deleted:         {action: 'deleted', tagName, message}
 *                   — buildDeleteTagProgram
 *  merged:          {action: 'merged', sourceTag, targetTag, tasksMerged, message}
 *                   — buildMergeTagsProgram (delete succeeded)
 *  merged_with_warning: {action: 'merged_with_warning', sourceTag, targetTag, tasksMerged, warning, message}
 *                   — buildMergeTagsProgram (best-effort delete failed; warning key appears)
 *  nested:          {action: 'nested', tagName, parentTagName, parentTagId, message}
 *                   — buildNestTagProgram / lowerTagMove('nest')
 *  unparented:      {action: 'unparented', tagName, message}
 *                   — buildUnparentTagProgram / lowerTagMove('unparent')
 *  reparented:      {action: 'reparented', tagName, [newParentTagName, newParentTagId,] message}
 *                   — buildReparentTagProgram / lowerTagMove('reparent')
 *                   NOTE: the reparent-to-root variant omits newParentTagName/newParentTagId
 *                   (keys are conditionally absent — JSON.stringify drops undefined);
 *                   the schema makes them optional so both sub-variants pass.
 */
export const TagMutationResultSchema = z.union([
  // created (path variant): has path + createdSegments keys, no parentTagName/parentTagId
  z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      path: z.string(),
      createdSegments: z.array(z.unknown()),
      message: z.string(),
    })
    .strict(),
  // created (flat variant): has parentTagName/parentTagId keys, no path/createdSegments
  z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      parentTagName: z.unknown(),
      parentTagId: z.unknown(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('renamed'),
      oldName: z.string(),
      newName: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('deleted'),
      tagName: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('merged'),
      sourceTag: z.string(),
      targetTag: z.string(),
      tasksMerged: z.number(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('merged_with_warning'),
      sourceTag: z.string(),
      targetTag: z.string(),
      tasksMerged: z.number(),
      warning: z.unknown(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('nested'),
      tagName: z.string(),
      parentTagName: z.string(),
      parentTagId: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('unparented'),
      tagName: z.string(),
      message: z.string(),
    })
    .strict(),
  // reparented: newParentTagName/newParentTagId are optional (to-root variant omits them)
  z
    .object({
      action: z.literal('reparented'),
      tagName: z.string(),
      newParentTagName: z.string().optional(),
      newParentTagId: z.string().optional(),
      message: z.string(),
    })
    .strict(),
]);
