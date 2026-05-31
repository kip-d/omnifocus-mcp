import { z } from 'zod';
import { coerceNumber, coerceObject } from '../../schemas/coercion-helpers.js';
import { EXPORT_FIELD_MAP } from '../../../contracts/ast/script-builder.js';

// Filter operators for flexible queries
const TagFilterSchema = z.object({
  all: z.array(z.string()).optional(),
  any: z.array(z.string()).optional(),
  none: z.array(z.string()).optional(),
});

// Date filter as discriminated union - only ONE operator allowed
const DateFilterSchema = z.union([
  z.object({ before: z.string() }).strict(),
  z.object({ after: z.string() }).strict(),
  z.object({ between: z.tuple([z.string(), z.string()]) }).strict(),
]);

// Text filter as discriminated union - only ONE operator allowed
const TextFilterSchema = z.union([
  z.object({ contains: z.string() }).strict(),
  z.object({ matches: z.string() }).strict(),
]);

// Number filter as discriminated union - only ONE operator allowed
const NumberFilterSchema = z.union([
  z.object({ equals: z.number() }).strict(),
  z.object({ lessThan: z.number() }).strict(),
  z.object({ greaterThan: z.number() }).strict(),
  z.object({ between: z.tuple([z.number(), z.number()]) }).strict(),
]);

// =============================================================================
// FILTER SCHEMAS (flat — no recursive nesting)
// =============================================================================
// QueryCompiler.transformFilters() only handles one level of AND/OR/NOT:
//   AND: merges via Object.assign (no true nesting)
//   OR: uses first condition only (logs warning)
//   NOT: two hardcoded status cases
// The schema matches this capability. No z.lazy() needed.

// Shared filter field shape (used by both FlatFilterSchema and FilterSchema)
const filterFields = {
  id: z.string().optional(), // Exact task ID lookup
  status: z.enum(['active', 'completed', 'dropped', 'on_hold']).optional(),
  // OMN-72: `completed` boolean is the documented GTD idiom in CLAUDE.md/memory
  // (`completed: false` = only active). Accepted as a direct alias for the
  // completion dimension of `status`; explicit `completed` overrides `status`.
  completed: z.boolean().optional(),
  tags: TagFilterSchema.optional(),
  project: z.union([z.string(), z.null()]).optional(),
  // OMN-43: explicit projectId filter for fast, unambiguous project-scoped queries.
  // `project` accepts a string but is name-resolution-first (with id fallback) and
  // ambiguous when multiple projects share a name. `projectId` is unambiguous and
  // takes the fast path through Project.byIdentifier().
  projectId: z.string().optional(),
  // OMN-114: filter to direct children of a task. Read-side mirror of write's
  // `data.parentTaskId` (writes accept it, reads project it). Unambiguous id
  // match via task.parent.id.primaryKey.
  parentTaskId: z.string().optional(),
  dueDate: DateFilterSchema.optional(),
  deferDate: DateFilterSchema.optional(),
  plannedDate: DateFilterSchema.optional(),
  completionDate: DateFilterSchema.optional(),
  added: DateFilterSchema.optional(), // Creation date
  flagged: z.boolean().optional(),
  blocked: z.boolean().optional(),
  available: z.boolean().optional(),
  inInbox: z.boolean().optional(), // Explicit inbox filter
  text: TextFilterSchema.optional(),
  estimatedMinutes: NumberFilterSchema.optional(), // Task duration
  name: TextFilterSchema.optional(), // Project/Task name filter
  // OMN-96 DECISION RECORD — `folder: null` = "top-level projects only".
  //
  // The model repeatedly sent `filters.folder: null` on projects queries,
  // expecting it to mean "top-level projects with no containing folder"
  // (failures-2026-03-05 and -2026-05-21, 2.5 months apart). The old schema
  // typed folder as a bare string and hard-rejected null. We chose to MOLD THE
  // SERVER TO THE MODEL'S NATURAL GUESS: accept null and treat it as the
  // top-level filter. A string still means "folder name contains <string>".
  //
  // Alternatives considered and NOT taken (recorded so a future revisit is
  // cheap — pick a different row here and re-thread):
  //   1. Explicit boolean `topLevelOnly: true`. Self-documenting, but the model
  //      doesn't reach for it unprompted; `folder: null` is what it actually
  //      emits, so accepting null closes the real gap with zero new vocabulary.
  //   2. Structured `folder: { exists: false }`. More expressive (room for
  //      `{ exists: true }`, name/id sub-filters later) but heavier schema and
  //      still not the model's first guess.
  //   3. Keep rejecting, but make the error actionable ("to list top-level
  //      projects, use …"). Lowest effort, but leaves a capability gap — the
  //      model has no working way to express a common, legitimate intent.
  //
  // The internal representation is the boolean flag `folderTopLevel`
  // (TaskFilter) → `topLevelOnly` (ProjectFilter); null never reaches the
  // emitter as a folder *name*. See QueryCompiler.transformFilters and
  // generateProjectFilterCode.
  folder: z.union([z.string(), z.null()]).optional(), // Project filters; null = top-level only (OMN-96)
};

// Flat filter: base fields only, no logical operators.
// Used inside AND/OR/NOT arrays to prevent nesting.
const FlatFilterSchema = z.object(filterFields).strict();

// Exported for parity tests (OMN-47): every key the schema accepts must be
// recognized by QueryCompiler.transformFilters.
export const FILTER_FIELD_NAMES = Object.keys(filterFields) as readonly string[];

// Full filter: base fields + one level of AND/OR/NOT (referencing FlatFilterSchema).
const FilterSchema = z
  .object({
    ...filterFields,
    AND: z.array(FlatFilterSchema).optional(),
    OR: z.array(FlatFilterSchema).optional(),
    NOT: FlatFilterSchema.optional(),
  })
  .strict();

// TypeScript types matching the schemas
export type FlatFilterValue = z.infer<typeof FlatFilterSchema>;
export interface FilterValue extends FlatFilterValue {
  AND?: FlatFilterValue[];
  OR?: FlatFilterValue[];
  NOT?: FlatFilterValue;
}

// =============================================================================
// FIELD SELECTION ENUMS (type-discriminated)
// =============================================================================

// OMN-73: the field names are extracted as arrays so each enum can carry a
// cross-type-aware errorMap. When a model requests a field valid for the
// *other* query type (e.g. `reviewInterval`, a projects-only concept, on a
// tasks query), an opaque "Invalid enum value" is replaced with a message
// that steers it to the right query type. (The 5 fields the failure log
// flagged — tags/plannedDate/reviewInterval/nextReviewDate/lastReviewDate —
// are all already backed for their correct type as of OMN-60/62; the residual
// friction was purely the unhelpful error, hence this scoped fix.)
const TASK_FIELDS = [
  'id',
  'name',
  'completed',
  'flagged',
  'blocked',
  'available',
  'estimatedMinutes',
  'dueDate',
  'deferDate',
  'plannedDate',
  'completionDate',
  'added',
  'modified',
  'dropDate',
  'note',
  'projectId',
  'project',
  'tags',
  'repetitionRule',
  'parentTaskId',
  'parentTaskName',
  'inInbox',
] as const;

const PROJECT_FIELDS = [
  'id',
  'name',
  'status',
  'flagged',
  'note',
  'dueDate',
  'deferDate',
  'completionDate', // OMN-81: was completedDate (stale name, no OmniJS Project property of that name → silent total failure); aligned with OmniJS Project.completionDate + filterFields.completionDate + task side
  'folder',
  'folderPath',
  'folderId',
  'sequential',
  'lastReviewDate',
  'nextReviewDate',
  'reviewInterval', // OMN-60: readable review interval { unit, steps }
  'defaultSingletonActionHolder',
  'tags', // OMN-62: settable via CreateDataSchema, now readable
  'plannedDate', // OMN-62: OF 4.7+ planned date, settable via CreateDataSchema, now readable
] as const;

const makeFieldErrorMap = (
  kind: 'task' | 'project',
  own: readonly string[],
  other: readonly string[],
): z.ZodErrorMap => {
  const otherType = kind === 'task' ? 'projects' : 'tasks';
  return (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.invalid_enum_value) {
      const got = String(issue.received);
      if (other.includes(got) && !own.includes(got)) {
        return {
          message: `'${got}' is a ${otherType}-only field — query type:"${otherType}" to retrieve it. Valid ${kind} fields: ${own.join(', ')}`,
        };
      }
      return { message: `Unknown ${kind} field '${got}'. Valid ${kind} fields: ${own.join(', ')}` };
    }
    return { message: ctx.defaultError };
  };
};

// Task field enum — matches fields in buildListTasksScriptV4
// Exported for parity tests in tests/unit/architecture/schema-impl-parity.test.ts (OMN-47).
export const TaskFieldEnum = z.enum(TASK_FIELDS, {
  errorMap: makeFieldErrorMap('task', TASK_FIELDS, PROJECT_FIELDS),
});

// Project field enum — matches fields in buildProjectFieldProjections (script-builder.ts:778-824)
// Exported for parity tests in tests/unit/architecture/schema-impl-parity.test.ts (OMN-47).
export const ProjectFieldEnum = z.enum(PROJECT_FIELDS, {
  errorMap: makeFieldErrorMap('project', PROJECT_FIELDS, TASK_FIELDS),
});

// Sort field enum for type safety
// Exported for parity tests in tests/unit/architecture/schema-impl-parity.test.ts (OMN-47).
export const SortFieldEnum = z.enum([
  'dueDate',
  'deferDate',
  'plannedDate',
  'name',
  'flagged',
  'estimatedMinutes',
  'added',
  'modified',
  'completionDate',
]);

// Sort options (uses 'direction' for sort order)
const SortSchema = z.object({
  field: SortFieldEnum,
  direction: z.enum(['asc', 'desc']),
});

// Export format enum
const ExportFormatEnum = z.enum(['json', 'csv', 'markdown']);

// Export type enum (what to export)
const ExportTypeEnum = z.enum(['tasks', 'projects', 'all']);

// Export field selection — derived from EXPORT_FIELD_MAP (single source of truth)
const exportFieldNames = Object.keys(EXPORT_FIELD_MAP) as [string, ...string[]];
const ExportFieldEnum = z.enum(exportFieldNames);

// =============================================================================
// SHARED BASE + PER-TYPE QUERY SCHEMAS
// =============================================================================

// Shared parameters for all query types
const BaseQuerySchema = z.object({
  // Handle MCP Bridge Type Coercion: LLMs may stringify nested objects
  filters: coerceObject(FilterSchema).optional(),
  sort: z.array(SortSchema).optional(),
  // Handle MCP Bridge Type Coercion: Claude Desktop converts numbers to strings
  limit: coerceNumber().min(1).max(500).optional(),
  offset: coerceNumber().min(0).optional(),
});

// Task queries: fields use TaskFieldEnum, have mode/countOnly/daysAhead/fastSearch/details
// OMN-74: shared so the projects `mode` field (rejected via superRefine with
// guidance) has the identical inferred type as tasks — avoids widening the
// QuerySchema union member to `string`.
const TaskModeEnum = z.enum([
  'all',
  'inbox',
  'search',
  'overdue',
  'today',
  'upcoming',
  'available',
  'blocked',
  'flagged',
  'smart_suggest',
]);

const TaskQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('tasks'),
    fields: z.array(TaskFieldEnum).optional(),
    mode: TaskModeEnum.optional(),
    details: z.boolean().optional(),
    fastSearch: z.boolean().optional(),
    daysAhead: coerceNumber().min(1).max(30).optional(),
    countOnly: z.boolean().optional(),
  }),
).strict();

// Project queries: fields use ProjectFieldEnum, have details/includeStats
// OMN-74: `mode` is a tasks-only view selector by design. It's accepted as an
// optional key here ONLY so the ReadSchema superRefine can replace the opaque
// strict "Unrecognized key 'mode'" with guidance to the real projects search
// interface (filters.name / filters.text). Net behavior unchanged: still
// rejected — just with a helpful message.
const ProjectQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('projects'),
    fields: z.array(ProjectFieldEnum).optional(),
    details: z.boolean().optional(),
    includeStats: z.boolean().optional(),
    mode: TaskModeEnum.optional(), // OMN-74: rejected via ReadSchema superRefine with guidance
  }),
).strict();

// Tag queries: base only
const TagQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('tags'),
  }),
).strict();

// Perspective queries: base only
const PerspectiveQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('perspectives'),
  }),
).strict();

// Folder queries: base only
const FolderQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('folders'),
  }),
).strict();

// Export queries: export-specific params
const ExportQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('export'),
    exportType: ExportTypeEnum.optional().describe('What to export: tasks, projects, or all'),
    format: ExportFormatEnum.optional().describe('Export format: json, csv, or markdown'),
    exportFields: z.array(ExportFieldEnum).optional().describe('Fields to include in export'),
    outputDirectory: z
      .string()
      .optional()
      .describe(
        'Directory to write the export. With exportType="tasks" writes tasks.<format> and raises the cap; required for exportType="all".',
      ),
    includeStats: z.boolean().optional().describe('Include statistics in project export'),
    includeCompleted: z
      .boolean()
      .optional()
      .describe(
        'Include completed tasks in export (default true). Honored by exportType="tasks" and exportType="all".',
      ),
  }),
).strict();

// Discriminated union on query.type
const QuerySchema = z.discriminatedUnion('type', [
  TaskQuerySchema,
  ProjectQuerySchema,
  TagQuerySchema,
  PerspectiveQuerySchema,
  FolderQuerySchema,
  ExportQuerySchema,
]);

// Main read schema
// Note: coerceObject handles JSON string->object conversion from MCP bridge
export const ReadSchema = z
  .object({
    query: coerceObject(QuerySchema),
  })
  // OMN-74: `mode` is a tasks-only view selector. A projects query that sends
  // `mode` (the model reaches for mode:"search") is rejected here with a
  // message pointing at the real projects search interface. The discriminated-
  // union member can't carry a refinement (zod requires ZodObject members), so
  // the guard lives on the boundary schema — same pattern as WriteSchema.
  .superRefine((val, ctx) => {
    const q = val.query;
    if (q.type === 'projects' && q.mode !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['query', 'mode'],
        message:
          '\'mode\' is a tasks-only view selector and is not supported on projects queries. To search projects use filters.name or filters.text, e.g. filters: { name: { contains: "..." } } or filters: { text: { matches: "..." } }.',
      });
    }
  });

export type ReadInput = z.infer<typeof ReadSchema>;
