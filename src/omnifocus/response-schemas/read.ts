import { z } from 'zod';
import { isoDateOrNull } from './common.js';

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
    // OMN-153: marker emitted when 'isProjectRoot' is in the requested fields.
    // true when task.project !== null (i.e. this task IS a project root).
    isProjectRoot: z.boolean().optional(),
    // OMN-130: cheap boolean — true when the task has any non-empty note text.
    hasNote: z.boolean().optional(),
    // OMN-207: action-group ordering, read-side parity with the write side
    // (OMN-198/206). Emitted by the `sequential` task projection case.
    sequential: z.boolean().optional(),
    // OMN-244: truncation marker riding the note field (piggybacks on the
    // 'note' projection case, not its own switch label — parity test allows
    // it as the one extra key, mirroring the project row's OMN-242 entry).
    noteTruncated: z.boolean().optional(),
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
    // OMN-242: sibling flag emitted alongside `note` ONLY when truncation
    // actually fired at runtime (n.length > noteTruncateLength). Not its own
    // switch case — piggybacks on the 'note' case in generateProjectFieldProjection.
    noteTruncated: z.boolean().optional(),
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
 * Tag item for 'basic' mode — {id, name, parentId}.
 * Source: tag-script-builder.ts buildBasicTagsScript: {id, name, parentId}.
 * OMN-145: parentId is always emitted (null for top-level tags) so hierarchy
 * is reachable through the read seam without a mode/fields opt-in param.
 */
const TagBasicItem = z.object({ id: z.string(), name: z.string(), parentId: z.string().nullable() }).strict();

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
    // OMN-170 S2: matching population (pre-limit) for the basic-mode name filter;
    // distinct from `total` (returned count). Optional — emitted by the basic builder.
    total_matched: z.number().optional(),
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
 * Source: src/omnifocus/scripts/perspectives/list-perspectives.ts.
 *
 * OMN-155: the enumeration migrated to OmniJS to read `archivedFilterRules`
 * (OmniJS-only). All three rule fields are REQUIRED + nullable — the script
 * literal always emits every key:
 * - filterRuleCount: number of archived filter rules. null for built-ins (no
 *   archived rules) AND for the 14/22 custom perspectives whose
 *   archivedFilterRules access throws "not found" (Step-0 probe finding).
 * - filterAggregation: archivedTopLevelFilterAggregation ("all" | null observed);
 *   null for built-ins and rule-less customs.
 * - filterRules: the full rules array, present ONLY when the query passes
 *   details:true on a custom perspective that has rules; null otherwise.
 *   Pass-through (z.unknown() items) by design — rules are OF-owned data whose
 *   vocabulary drifts across OmniFocus versions (spec §6 Q1).
 */
export const PerspectiveItemSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    isBuiltIn: z.boolean(),
    identifier: z.string().nullable(),
    filterRules: z.array(z.unknown()).nullable(),
    filterRuleCount: z.number().nullable(),
    filterAggregation: z.string().nullable(),
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
 * Source: the taskInfo object built per task: always has id, name, frequency, repetitionRule,
 * project, projectId; dates conditional.
 *
 * project/projectId: REQUIRED + nullable. The taskInfo literal always emits both keys, set from
 *   projectName/projId which default to null and are overwritten only when containingProject exists
 *   (e.g. an inbox recurring task emits project:null, projectId:null). z.string().optional() was
 *   WRONG: it fails-closed on null — same class as the unit:null bug below.
 * repetitionRule.unit: REQUIRED + nullable. When ruleString is absent and name-inference fails,
 *   ruleData.unit stays null (parseRuleString/inferFrequencyFromName return null).
 *   z.string().optional() was WRONG: it fails on null (OMN-158 Task 2 spec-review correction).
 * repetitionRule.method: optional + nullable. Set only when repetitionRule.method exists on the
 *   OmniJS object; the value may be null (method.name || null path).
 */
export const RecurringTaskRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    project: z.string().nullable(),
    projectId: z.string().nullable(),
    repetitionRule: z
      .object({
        unit: z.string().nullable(), // required; null when no rule and no name-inference match
        steps: z.number(),
        ruleString: z.string().optional(),
        _inferenceSource: z.string().optional(),
        method: z.string().nullable().optional(), // optional; null when method.name resolves to null
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
 * filters_applied echoes the EFFECTIVE filter — the user filter plus the auto-injected
 * completed/dropped/project-root defaults the count actually applied (OMN-190) — stays
 * z.unknown() (passthrough echo). The host surfaces this verbatim as metadata.filters_applied.
 */
export const CountResultSchema = z
  .object({
    count: z.number(),
    filters_applied: z.unknown(), // passthrough echo of the effective filter (OMN-190); z.unknown() is optional-by-default
    query_time_ms: z.number(),
    optimization: z.string(),
    filter_description: z.string(),
    scanned: z.number(),
    total_tasks: z.number(),
    limited: z.boolean(),
    warning: z.string().optional(),
  })
  .strict();

/**
 * Slimmed task row — emitted by the inline JXA script in fetchSlimmedData.
 * Source: OmniFocusAnalyzeTool.ts fetchSlimmedData inline script taskData object.
 * id, name, completed, flagged, status, tags are always set. All others are conditional (try/catch).
 */
const SlimTaskSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    completed: z.boolean(),
    flagged: z.boolean(),
    status: z.string(),
    tags: z.array(z.string()),
    project: z.string().optional(),
    projectId: z.string().optional(),
    deferDate: z.string().optional(),
    dueDate: z.string().optional(),
    completionDate: z.string().optional(),
    creationDate: z.string().optional(),
    modificationDate: z.string().optional(),
    // emitter assigns task.estimatedMinutes() with no ?./coalesce, so an unset estimate
    // serializes as null (kept by JSON.stringify) — required-nullable, NOT optional.
    estimatedMinutes: z.number().nullable().optional(),
    noteHead: z.string().optional(),
    children: z.number().optional(),
  })
  .strict();

/**
 * Slimmed project row — emitted by fetchSlimmedData inline JXA script projectData object.
 * Source: OmniFocusAnalyzeTool.ts fetchSlimmedData.
 * id, name, status always set. taskCount/availableTaskCount are in the projectData literal
 * (direct property access, NOT inner try/catch) → always present; the outer try/catch skips
 * the whole project on error rather than emitting a partial object.
 * All dates are conditional (inner try/catch).
 */
const SlimProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    taskCount: z.number(),
    availableTaskCount: z.number(),
    lastReviewDate: z.string().optional(),
    nextReviewDate: z.string().optional(),
    creationDate: z.string().optional(),
    modificationDate: z.string().optional(),
    completionDate: z.string().optional(),
  })
  .strict();

/**
 * Slimmed tag row — emitted by fetchSlimmedData inline JXA script tagData object.
 * Source: OmniFocusAnalyzeTool.ts fetchSlimmedData.
 * id, name always set; taskCount always set (may be 0).
 */
const SlimTagSchema = z.object({ id: z.string(), name: z.string(), taskCount: z.number() }).strict();

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
    tasks: z.array(SlimTaskSchema),
    projects: z.array(SlimProjectSchema),
    tags: z.array(SlimTagSchema),
  })
  .strict();

/**
 * Pattern entry — emitted by GET_RECURRING_PATTERNS_SCRIPT patternArray map.
 * Source: get-recurring-patterns.ts patternArray = Object.entries(patterns).map(…).
 * steps: can be number or string 'unknown' (patterns[key].steps = ruleData.steps || 'unknown').
 */
const RecurringPatternEntrySchema = z
  .object({
    pattern: z.string(),
    unit: z.string(),
    steps: z.union([z.number(), z.string()]),
    count: z.number(),
    percentage: z.number(),
    examples: z.array(z.string()),
  })
  .strict();

/**
 * Per-project pattern entry inside byProject array.
 * Source: get-recurring-patterns.ts projectArray map: {project, recurringCount, patterns: [{pattern, count}]}.
 */
const RecurringByProjectEntrySchema = z
  .object({
    project: z.string(),
    recurringCount: z.number(),
    patterns: z.array(z.object({ pattern: z.string(), count: z.number() }).strict()),
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
 * duration: Date.now() subtraction → number.
 * debug.optimizationUsed: always present.
 */
export const RecurringPatternsSchema = z
  .object({
    totalRecurring: z.number(),
    patterns: z.array(RecurringPatternEntrySchema),
    byProject: z.array(RecurringByProjectEntrySchema),
    mostCommon: RecurringPatternEntrySchema.nullable(),
    duration: z.number(),
    debug: z.object({ optimizationUsed: z.string() }).strict(), // always emitted in the outer spread
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
