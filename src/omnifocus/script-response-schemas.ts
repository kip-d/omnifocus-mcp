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
const isoDate = z.string();
const isoDateOrNull = isoDate.nullable();
/** OMN-137 best-effort warning labels: 'label: message' strings. */
const warningsArray = z.array(z.string());

// ---------------------------------------------------------------------------
// Read-family row schemas (OMN-158 Task 2)
// All keys .optional(): projection switch gates every field individually.
// .strict() closes the key set: an unknown projected key fails at runtime.
// Authoritative key source: generateFieldProjection / generateProjectFieldProjection
// switch case labels in src/contracts/ast/script-builder.ts.
// ---------------------------------------------------------------------------

/**
 * Repetition rule sub-object emitted by the `repetitionRule` projection case.
 * Source: generateFieldProjection `case 'repetitionRule'` → returns null or
 *   {ruleString, scheduleType, anchorDateKey, catchUpAutomatically}.
 * All fields may be null (the fallback paths return null for each property).
 */
const RepetitionRuleSchema = z
  .object({
    ruleString: z.string().nullable().optional(),
    scheduleType: z.string().nullable().optional(),
    anchorDateKey: z.string().nullable().optional(),
    catchUpAutomatically: z.boolean().nullable().optional(),
  })
  .strict();

/**
 * Task row schema — closed set of all projectable field names, each .optional().
 * Source: generateFieldProjection switch case labels in src/contracts/ast/script-builder.ts.
 * Projection-parity test asserts this set equals the switch labels exactly.
 */
export const TaskRowSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    completed: z.boolean().optional(),
    flagged: z.boolean().optional(),
    inInbox: z.boolean().optional(),
    blocked: z.boolean().optional(),
    available: z.boolean().optional(),
    dueDate: isoDateOrNull.optional(),
    deferDate: isoDateOrNull.optional(),
    plannedDate: isoDateOrNull.optional(),
    effectivePlannedDate: isoDateOrNull.optional(),
    completionDate: isoDateOrNull.optional(),
    modified: isoDateOrNull.optional(),
    added: isoDateOrNull.optional(),
    dropDate: isoDateOrNull.optional(),
    tags: z.array(z.string()).optional(),
    note: z.string().optional(),
    project: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    estimatedMinutes: z.number().nullable().optional(),
    repetitionRule: RepetitionRuleSchema.nullable().optional(),
    parentTaskId: z.string().nullable().optional(),
    parentTaskName: z.string().nullable().optional(),
    reason: z.enum(['overdue', 'due_soon', 'flagged']).nullable().optional(),
    daysOverdue: z.number().optional(),
  })
  .strict();

/**
 * Project row task-counts sub-object (normal-mode only).
 * Source: buildFilteredProjectsScript includeTaskCounts block.
 */
const TaskCountsSchema = z
  .object({
    total: z.number(),
    available: z.number(),
    completed: z.number(),
  })
  .strict();

/**
 * Project row next-task sub-object (normal-mode only).
 * Source: buildFilteredProjectsScript nextTask block.
 */
const NextTaskSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    flagged: z.boolean(),
    dueDate: isoDateOrNull,
  })
  .strict();

/**
 * Project row stats sub-object (includeStats=true only).
 * Source: buildFilteredProjectsScript includeStats block.
 */
const ProjectStatsSchema = z
  .object({
    active: z.number(),
    completed: z.number(),
    total: z.number(),
    completionRate: z.number(),
    overdue: z.number(),
    flagged: z.number(),
  })
  .strict();

/**
 * Review interval sub-object emitted by the `reviewInterval` projection case.
 * Source: generateProjectFieldProjection `case 'reviewInterval'`.
 */
const ReviewIntervalSchema = z
  .object({
    unit: z.string(),
    steps: z.number(),
  })
  .strict();

/**
 * Project row schema — closed set of all projectable field names, each .optional().
 * Source: generateProjectFieldProjection switch case labels + performance/includeStats
 * branches in src/contracts/ast/script-builder.ts.
 * taskCounts/nextTask/stats are NOT switch cases; they come from the performance/includeStats
 * branches and are included in the schema as optional.
 * Projection-parity test asserts switch labels ⊆ shape with difference exactly
 * {taskCounts, nextTask, stats}.
 */
export const ProjectRowSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    flagged: z.boolean().optional(),
    note: z.string().optional(),
    dueDate: isoDateOrNull.optional(),
    deferDate: isoDateOrNull.optional(),
    folder: z.string().nullable().optional(),
    folderPath: z.string().nullable().optional(),
    folderId: z.string().nullable().optional(),
    sequential: z.boolean().optional(),
    lastReviewDate: isoDateOrNull.optional(),
    nextReviewDate: isoDateOrNull.optional(),
    reviewInterval: ReviewIntervalSchema.nullable().optional(),
    completionDate: isoDateOrNull.optional(),
    defaultSingletonActionHolder: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    plannedDate: isoDateOrNull.optional(),
    // From performanceMode branches (not switch cases):
    taskCounts: TaskCountsSchema.optional(),
    nextTask: NextTaskSchema.optional(),
    // From includeStats branch (not a switch case):
    stats: ProjectStatsSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Metadata schemas (OMN-158 Task 2)
// ---------------------------------------------------------------------------

/**
 * Task list metadata — emitted by the JXA wrapper in list-tasks-ast.ts.
 *
 * PATH TRAP (documented in OMN-158 plan Task 2): the wrapper writes every key
 * from the inner script's result, but JSON.stringify drops undefined ones.
 * buildTaskByIdScript (the id_lookup path) returns only {tasks, count, mode, targetId}
 * so total_matched / filter_description / offset_applied are ABSENT on id_lookup
 * reads and must be .optional() here to avoid failing live id-lookup reads.
 *
 * Source: src/omnifocus/scripts/tasks/list-tasks-ast.ts wrapper literal.
 * Inner scripts: buildFilteredTasksScript / buildInboxScript emit total_matched,
 * mode, filter_description; buildTaskByIdScript does not.
 */
export const TaskListMetadataSchema = z
  .object({
    total_count: z.number(),
    total_matched: z.number().optional(),
    sorted_in_script: z.boolean(),
    limit_applied: z.number(),
    offset: z.number(),
    offset_applied: z.number().optional(),
    mode: z.string(),
    filter_description: z.string().optional(),
    optimization: z.string(),
    architecture: z.string(),
  })
  .strict();

/**
 * Project list metadata — emitted by buildFilteredProjectsScript wrapper.
 * Source: src/contracts/ast/script-builder.ts buildFilteredProjectsScript
 *   return JSON.stringify({ projects, metadata: { total_available, total_matched,
 *     returned_count, limit_applied, performance_mode, stats_included,
 *     optimization, filter_description } }).
 * All keys are always emitted (single code path for the metadata object).
 */
export const ProjectListMetadataSchema = z
  .object({
    total_available: z.number(),
    total_matched: z.number(),
    returned_count: z.number(),
    limit_applied: z.number(),
    performance_mode: z.string(),
    stats_included: z.boolean(),
    optimization: z.string(),
    filter_description: z.string(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Tag item schemas (OMN-158 Task 2)
// ---------------------------------------------------------------------------

/**
 * Tag item for 'names' mode — items are plain strings.
 * Source: tag-script-builder.ts buildNamesTagsScript: items are tag name strings.
 */
const TagNameItem = z.string();

/**
 * Tag item for 'basic' mode — {id, name}.
 * Source: tag-script-builder.ts buildBasicTagsScript: {id, name}.
 */
const TagBasicItem = z.object({ id: z.string(), name: z.string() }).strict();

/**
 * Tag usage stats sub-object (includeUsageStats=true only).
 */
const TagUsageSchema = z
  .object({ total: z.number(), active: z.number(), completed: z.number(), flagged: z.number() })
  .strict();

/**
 * Tag item for 'full' mode.
 * Source: tag-script-builder.ts buildFullTagsScript: builds tagInfo with
 *   required {id, name, allowsNextAction, status}, plus conditional
 *   usage (if includeUsageStats), parentId/parentName (if exists),
 *   childrenAreMutuallyExclusive (if set).
 */
const TagFullItem = z
  .object({
    id: z.string(),
    name: z.string(),
    allowsNextAction: z.boolean(),
    status: z.string(),
    usage: TagUsageSchema.optional(),
    parentId: z.string().optional(),
    parentName: z.string().optional(),
    childrenAreMutuallyExclusive: z.boolean().optional(),
  })
  .strict();

/**
 * Tag item union — covers all three modes (names/basic/full) that may flow
 * through a single astEnvelopeSchema items array. The analyze tool's
 * TAG_ITEMS_SCHEMA receives 'basic' mode items only; the read tool's
 * TAG_LIST_SCHEMA also receives 'basic' only. A union is defined here for
 * completeness and future flexibility.
 */
export const TagItemSchema = z.union([TagFullItem, TagBasicItem, TagNameItem]);

/**
 * Tag summary — emitted by all tag script modes.
 * Source: tag-script-builder.ts: {total, insights, query_time_ms, mode, optimization}.
 * Full mode additionally emits includeUsageStats.
 */
export const TagSummarySchema = z
  .object({
    total: z.number(),
    insights: z.array(z.string()),
    query_time_ms: z.number(),
    mode: z.string(),
    optimization: z.string(),
    includeUsageStats: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Perspective item schema (OMN-158 Task 2)
// ---------------------------------------------------------------------------

/**
 * Perspective item — emitted by LIST_PERSPECTIVES_SCRIPT.
 * Source: src/omnifocus/scripts/perspectives/list-perspectives.ts:
 *   {name, type, isBuiltIn, identifier, filterRules: null}.
 */
export const PerspectiveItemSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    isBuiltIn: z.boolean(),
    identifier: z.string().nullable(),
    filterRules: z.null(),
  })
  .strict();

/**
 * Perspective summary — emitted by LIST_PERSPECTIVES_SCRIPT.
 * Source: return JSON.stringify({ items, summary: { total, insights } }).
 */
export const PerspectiveSummarySchema = z
  .object({
    total: z.number(),
    insights: z.array(z.string()),
  })
  .strict();

// ---------------------------------------------------------------------------
// Recurring tasks row schema (OMN-158 Task 2, also needed for Task 3)
// ---------------------------------------------------------------------------

/**
 * Recurring task row — emitted by analyze-recurring-tasks-ast.ts buildRecurringTasksScript.
 * Source: the taskInfo object built per task: always has id, name, frequency, repetitionRule;
 * project/projectId conditional (containing project); dates conditional.
 */
export const RecurringTaskRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    project: z.string().optional(),
    projectId: z.string().optional(),
    repetitionRule: z
      .object({
        unit: z.string().optional(),
        steps: z.number().optional(),
        ruleString: z.string().optional(),
        _inferenceSource: z.string().optional(),
        method: z.string().optional(),
        anchorDateKey: z.string().optional(),
        catchUpAutomatically: z.boolean().optional(),
        scheduleType: z.string().optional(),
      })
      .strict(),
    frequency: z.string(),
    deferDate: z.string().optional(),
    dueDate: z.string().optional(),
    nextDue: z.string().optional(),
    daysUntilDue: z.number().optional(),
    isOverdue: z.boolean().optional(),
    overdueDays: z.number().optional(),
    lastCompleted: z.string().optional(),
  })
  .strict();

/**
 * Recurring tasks summary — emitted by analyze-recurring-tasks-ast.ts.
 * Source: summary object: {totalRecurring, returned, overdue, dueThisWeek, byFrequency}.
 */
export const RecurringTasksSummarySchema = z
  .object({
    totalRecurring: z.number(),
    returned: z.number(),
    overdue: z.number(),
    dueThisWeek: z.number(),
    byFrequency: z.record(z.number()),
  })
  .strict();

/**
 * Recurring tasks metadata — emitted by analyze-recurring-tasks-ast.ts.
 * Source: metadata: {query_time_ms, optimization, options (echo of input options)}.
 * options is a passthrough echo of the input options object — stays z.unknown().
 */
export const RecurringTasksMetadataSchema = z
  .object({
    query_time_ms: z.number(),
    optimization: z.string(),
    options: z.unknown().optional(), // passthrough echo of input options
  })
  .strict();

// ---------------------------------------------------------------------------
// Factory functions (OMN-158 Task 2: evolved signatures)
// ---------------------------------------------------------------------------

/** Analytics v3 envelope: {ok: true, v, data}. */
export const V3EnvelopeSuccessSchema = z.object({ ok: z.literal(true), v: z.string(), data: z.unknown() }).strict();

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
  const metadataEntry: Record<string, z.ZodTypeAny> =
    opts.metadata === undefined
      ? {}
      : opts.metadata === true
        ? { metadata: z.unknown().optional() }
        : { metadata: (opts.metadata as TMeta).optional() };

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

/**
 * countOnly result — WIRE shape from buildTaskCountScript.
 *
 * Source-verified against src/contracts/ast/script-builder.ts buildTaskCountScript
 * OmniJS inner return JSON.stringify:
 *   {count, filters_applied, query_time_ms, optimization, filter_description, scanned, total_tasks,
 *    ...(scanned >= maxScan ? {warning, limited:true} : {limited:false})}
 *
 * limited is emitted on BOTH branches (true or false) — REQUIRED.
 * warning is emitted only on the scan-limit branch — OPTIONAL.
 * filters_applied echoes the raw filter object passed in — stays z.unknown() (passthrough echo).
 */
export const CountResultSchema = z
  .object({
    count: z.number(),
    filters_applied: z.unknown(), // passthrough echo of caller's filter object
    query_time_ms: z.number(),
    optimization: z.string(),
    filter_description: z.string(),
    scanned: z.number(),
    total_tasks: z.number(),
    limited: z.boolean(),
    warning: z.string().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Export schemas (OMN-158 Task 2, rider 4) — per-script unions
// ---------------------------------------------------------------------------

/**
 * Export task row — closed set of output keys from EXPORT_FIELD_MAP.
 * Source: src/contracts/ast/script-builder.ts EXPORT_FIELD_MAP.
 * Note: 'estimated' key maps to 'estimatedMinutes' in output;
 *       'created'/'createdDate' both map to 'createdDate' in output;
 *       'modified'/'modifiedDate' both map to 'modifiedDate' in output.
 * All values are optional (projection-gated). Booleans/numbers as typed;
 * dates emit empty string "" (not null) when absent.
 */
export const ExportTaskRowSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    note: z.string().optional(),
    project: z.string().optional(),
    projectId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    deferDate: z.string().optional(),
    dueDate: z.string().optional(),
    plannedDate: z.string().optional(),
    completed: z.boolean().optional(),
    completionDate: z.string().optional(),
    flagged: z.boolean().optional(),
    estimatedMinutes: z.number().optional(),
    createdDate: z.string().optional(),
    modifiedDate: z.string().optional(),
  })
  .strict();

/**
 * Task JSON export debug sub-object.
 * Source: buildExportTasksScript JSON branch debug object.
 */
const TaskExportDebugSchema = z
  .object({
    totalTasksProcessed: z.number(),
    maxTasksAllowed: z.number(),
    filterDescription: z.string(),
    fieldsRequested: z.array(z.string()),
    optimizationUsed: z.string(),
  })
  .strict();

/**
 * Tasks export result — per-format strict union.
 * Source-verified against src/contracts/ast/script-builder.ts buildExportTasksScript.
 *
 * csv (empty, count=0): {format:'csv', data:string, count:number, duration:number, message:string}
 *   — message always present: 'No tasks found matching the filter criteria'
 * csv (non-empty): {format:'csv', data:string, count:number, duration:number, limited:boolean, message?:string}
 *   — message present only when limited (tasksAdded >= maxTasks), else undefined-dropped.
 *   — csv empty and non-empty share the same discriminator ('csv'); a single csv variant
 *     with limited/message optional avoids ambiguity in the union.
 * markdown: {format:'markdown', data:string, count:number, duration:number}
 * json: {format:'json', data:ExportTaskRow[], count:number, duration:number, limited:boolean,
 *        debug:TaskExportDebugSchema, message?:string}
 */
export const ExportTasksResultSchema = z.union([
  // csv (all branches): limited is absent on empty, present on non-empty; message is absent or string
  z
    .object({
      format: z.literal('csv'),
      data: z.string(),
      count: z.number(),
      duration: z.number(),
      limited: z.boolean().optional(),
      message: z.string().optional(),
    })
    .strict(),
  z
    .object({
      format: z.literal('markdown'),
      data: z.string(),
      count: z.number(),
      duration: z.number(),
    })
    .strict(),
  z
    .object({
      format: z.literal('json'),
      data: z.array(ExportTaskRowSchema),
      count: z.number(),
      duration: z.number(),
      limited: z.boolean(),
      debug: TaskExportDebugSchema,
      message: z.string().optional(),
    })
    .strict(),
]);

/**
 * Export project row — emitted by export-projects.ts OmniJS bridge.
 * Source: src/omnifocus/scripts/export/export-projects.ts projectData object.
 * id, name, status are always set. All others are conditional (if block).
 */
export const ExportProjectRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    note: z.string().optional(),
    parentId: z.string().optional(),
    parentName: z.string().optional(),
    deferDate: z.string().optional(),
    dueDate: z.string().optional(),
    plannedDate: z.string().optional(),
    effectivePlannedDate: z.string().optional(),
    completionDate: z.string().optional(),
    modifiedDate: z.string().optional(),
    stats: z
      .object({
        totalTasks: z.number(),
        completedTasks: z.number(),
        availableTasks: z.number(),
        completionRate: z.number(),
        overdueCount: z.number(),
        flaggedCount: z.number(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Projects export result — per-format strict union.
 * Source-verified against src/omnifocus/scripts/export/export-projects.ts.
 *
 * csv: {format:'csv', data:string, count:number, duration:number}
 * markdown: {format:'markdown', data:string, count:number, duration:number}
 * json: {format:'json', data:ExportProjectRow[], count:number, duration:number,
 *        debug:{totalProjectsProcessed, includeStats, optimizationUsed}}
 */
export const ExportProjectsResultSchema = z.union([
  z
    .object({
      format: z.literal('csv'),
      data: z.string(),
      count: z.number(),
      duration: z.number(),
    })
    .strict(),
  z
    .object({
      format: z.literal('markdown'),
      data: z.string(),
      count: z.number(),
      duration: z.number(),
    })
    .strict(),
  z
    .object({
      format: z.literal('json'),
      data: z.array(ExportProjectRowSchema),
      count: z.number(),
      duration: z.number(),
      debug: z
        .object({
          totalProjectsProcessed: z.number(),
          includeStats: z.boolean(),
          optimizationUsed: z.string(),
        })
        .strict(),
    })
    .strict(),
]);

/**
 * ExportResultSchema — kept as a union of both script schemas for call sites that
 * handle both task and project exports (e.g. handleBulkExport).
 * Source: both buildExportTasksScript and export-projects.ts success branches.
 */
export const ExportResultSchema = z.union([ExportTasksResultSchema, ExportProjectsResultSchema]);

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
 * Moved here from OmniFocusReadTool.ts so dedicated variants live in the
 * schemas module alongside the families they belong to.
 */
export const ProjectByIdSchema = z
  .object({
    projects: z.array(ProjectRowSchema),
    count: z.number(),
    mode: z.string(),
    targetId: z.string(),
  })
  .strict();

/**
 * Folder item — emitted by buildFilteredFoldersScript per-folder object.
 * Source: src/contracts/ast/script-builder.ts buildFilteredFoldersScript folderObj.
 * id, name, status, depth, path are always set; others are conditional (if blocks).
 */
const FolderItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    depth: z.number(),
    path: z.string(),
    parentId: z.string().optional(),
    parentName: z.string().optional(),
    children: z.array(z.object({ id: z.string(), name: z.string() }).strict()).optional(),
    childCount: z.number().optional(),
    projects: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() }).strict()).optional(),
    projectCount: z.number().optional(),
  })
  .strict();

/**
 * Folder list metadata — emitted by buildFilteredFoldersScript OmniJS script.
 * Source: return JSON.stringify({ success: true, folders, metadata: { returned_count, total_available } }).
 */
const FolderListMetadataSchema = z
  .object({
    returned_count: z.number(),
    total_available: z.number(),
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
 * Moved here from OmniFocusReadTool.ts so dedicated variants live in the
 * schemas module alongside the families they belong to.
 */
export const FolderListSchema = z
  .object({
    success: z.literal(true),
    folders: z.array(FolderItemSchema),
    metadata: FolderListMetadataSchema.optional(),
  })
  .strict();

/**
 * Write-tool task create/update result (NOT v3-wrapped — wrapInLauncher returns the OmniJS payload raw).
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts:
 *  - buildCreateTaskProgram envelope:
 *    {taskId, name, note, flagged, dueDate, deferDate, plannedDate, estimatedMinutes, tags,
 *     project, inInbox, warnings, created:true}
 *  - buildUpdateTaskProgram envelope:
 *    {taskId, name, flagged, updated:true, warnings} — exactly 5 keys, do NOT add note/dates/tags.
 *
 * OMN-158 rider 3: two strict variants (create/update) replacing single object + .refine().
 * .strict() before any .refine() — no .refine() survives.
 */
const TaskCreateResult = z
  .object({
    taskId: z.string(),
    name: z.string(),
    note: z.string(),
    flagged: z.boolean(),
    dueDate: isoDateOrNull,
    deferDate: isoDateOrNull,
    plannedDate: isoDateOrNull,
    estimatedMinutes: z.number().nullable(),
    tags: z.array(z.string()),
    project: z.string().nullable(),
    inInbox: z.boolean(),
    warnings: warningsArray,
    created: z.literal(true),
  })
  .strict();

const TaskUpdateResult = z
  .object({
    taskId: z.string(),
    name: z.string(),
    flagged: z.boolean(),
    updated: z.literal(true),
    warnings: warningsArray,
  })
  .strict();

export const TaskWriteResultSchema = z.union([TaskCreateResult, TaskUpdateResult]);

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
      completionDate: isoDateOrNull,
    })
    .strict(),
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      completed: z.literal(true),
      completionDate: isoDateOrNull,
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
    deleted: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    errors: z.array(z.object({ taskId: z.string(), error: z.string() }).strict()),
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
      note: z.string(),
      flagged: z.boolean(),
      sequential: z.boolean(),
      dueDate: isoDateOrNull,
      deferDate: isoDateOrNull,
      plannedDate: isoDateOrNull,
      folder: z.string().nullable(),
      tags: z.array(z.string()),
      warnings: warningsArray,
      created: z.literal(true),
    })
    .strict(),
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      flagged: z.boolean(),
      status: z.enum(['active', 'on_hold', 'completed', 'dropped']),
      updated: z.literal(true),
      warnings: warningsArray,
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
    parentFolder: z.string().nullable(),
    warnings: warningsArray,
    created: z.literal(true),
  })
  .strict();

/**
 * Batch create result.
 *
 * Source-verified against src/contracts/ast/mutation/emitter.ts (batchItem emitter):
 *  success: {tempId, taskId: task.id.primaryKey, success: true, warnings}
 *  failure: {tempId, taskId: null, success: false, error, warnings}
 *
 * Per-item taskId:null and success:literal(false) are SUCCESS-contract data (spec §5, plan note).
 */
const BatchItemSuccessResult = z
  .object({
    tempId: z.string(),
    taskId: z.string(),
    success: z.literal(true),
    warnings: warningsArray,
  })
  .strict();

const BatchItemFailureResult = z
  .object({
    tempId: z.string(),
    taskId: z.null(),
    success: z.literal(false),
    error: z.string(),
    warnings: warningsArray,
  })
  .strict();

export const BatchCreateResultSchema = z
  .object({
    results: z.array(z.union([BatchItemSuccessResult, BatchItemFailureResult])),
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
 *                   NOTE: parentTagName/parentTagId are REQUIRED but may be null (json(null) when no parent)
 *  renamed:         {action: 'renamed', oldName, newName, message}
 *                   — buildRenameTagProgram
 *  deleted:         {action: 'deleted', tagName, message}
 *                   — buildDeleteTagProgram
 *  merged:          {action: 'merged', sourceTag, targetTag, tasksMerged, message}
 *                   — buildMergeTagsProgram (delete succeeded)
 *  merged_with_warning: {action: 'merged_with_warning', sourceTag, targetTag, tasksMerged, warning, message}
 *                   — buildMergeTagsProgram (best-effort delete failed; warning key appears via undefined-drop)
 *  nested:          {action: 'nested', tagName, parentTagName, parentTagId, message}
 *                   — buildNestTagProgram / lowerTagMove('nest')
 *  unparented:      {action: 'unparented', tagName, message}
 *                   — buildUnparentTagProgram / lowerTagMove('unparent')
 *  reparented (with-parent): {action: 'reparented', tagName, newParentTagName, newParentTagId, message}
 *                   — lowerTagMove('reparent') with parentTagName present
 *  reparented (to-root): {action: 'reparented', tagName, message}
 *                   — lowerTagMove('reparent') without parentTagName
 *                   NOTE: newParentTag* keys are STRUCTURALLY ABSENT (separate envelope literal at build time,
 *                   not JSON.stringify undefined-dropping). OMN-158 splits into two strict variants.
 */
export const TagMutationResultSchema = z.union([
  // created (path variant): has path + createdSegments keys, no parentTagName/parentTagId
  z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      path: z.string(),
      createdSegments: z.array(z.string()),
      message: z.string(),
    })
    .strict(),
  // created (flat variant): has parentTagName/parentTagId keys (required, may be null), no path/createdSegments
  z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      parentTagName: z.string().nullable(),
      parentTagId: z.string().nullable(),
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
      // warning is always present on this branch (the action literal itself is the discriminator)
      warning: z.string(),
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
  // reparented (with-parent): newParentTag* keys present — separate envelope literal from to-root
  z
    .object({
      action: z.literal('reparented'),
      tagName: z.string(),
      newParentTagName: z.string(),
      newParentTagId: z.string(),
      message: z.string(),
    })
    .strict(),
  // reparented (to-root): newParentTag* keys structurally absent — separate envelope literal at build time
  z
    .object({
      action: z.literal('reparented'),
      tagName: z.string(),
      message: z.string(),
    })
    .strict(),
]);
