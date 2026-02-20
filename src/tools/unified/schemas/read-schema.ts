import { z } from 'zod';
import { coerceNumber, coerceObject } from '../../schemas/coercion-helpers.js';

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

// Define the filter value type first (for recursive reference)
export interface FilterValue {
  // Task filters
  id?: string; // Exact task ID lookup
  status?: 'active' | 'completed' | 'dropped' | 'on_hold';
  tags?: z.infer<typeof TagFilterSchema>;
  project?: string | null;
  dueDate?: z.infer<typeof DateFilterSchema>;
  deferDate?: z.infer<typeof DateFilterSchema>;
  plannedDate?: z.infer<typeof DateFilterSchema>;
  added?: z.infer<typeof DateFilterSchema>; // Creation date
  flagged?: boolean;
  blocked?: boolean;
  available?: boolean;
  inInbox?: boolean; // Explicit inbox filter
  text?: z.infer<typeof TextFilterSchema>;
  estimatedMinutes?: z.infer<typeof NumberFilterSchema>; // Task duration

  // Project/Task name filter
  name?: z.infer<typeof TextFilterSchema>;

  // Project filters
  folder?: string;

  // Logical operators (recursive)
  AND?: FilterValue[];
  OR?: FilterValue[];
  NOT?: FilterValue;

  // Allow passthrough of unknown fields
  [key: string]: unknown;
}

// Zod schema type wrapping FilterValue
type FilterType = z.ZodType<FilterValue>;

const FilterSchema: FilterType = z.lazy(() =>
  z
    .object({
      // Task filters
      id: z.string().optional(), // Exact task ID lookup
      status: z.enum(['active', 'completed', 'dropped', 'on_hold']).optional(),
      tags: TagFilterSchema.optional(),
      project: z.union([z.string(), z.null()]).optional(),
      dueDate: DateFilterSchema.optional(),
      deferDate: DateFilterSchema.optional(),
      plannedDate: DateFilterSchema.optional(),
      added: DateFilterSchema.optional(), // Creation date
      flagged: z.boolean().optional(),
      blocked: z.boolean().optional(),
      available: z.boolean().optional(),
      inInbox: z.boolean().optional(), // Explicit inbox filter
      text: TextFilterSchema.optional(),
      estimatedMinutes: NumberFilterSchema.optional(), // Task duration

      // Project/Task name filter
      name: TextFilterSchema.optional(),

      // Project filters
      folder: z.string().optional(),

      // Logical operators
      AND: z.array(FilterSchema).optional(),
      OR: z.array(FilterSchema).optional(),
      NOT: FilterSchema.optional(),
    })
    .passthrough(),
);

// =============================================================================
// FIELD SELECTION ENUMS (type-discriminated)
// =============================================================================

// Task field enum — matches fields in buildListTasksScriptV4
const TaskFieldEnum = z.enum([
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
]);

// Project field enum — matches fields in buildProjectFieldProjections (script-builder.ts:778-824)
const ProjectFieldEnum = z.enum([
  'id',
  'name',
  'status',
  'flagged',
  'note',
  'dueDate',
  'deferDate',
  'completedDate',
  'folder',
  'folderPath',
  'folderId',
  'sequential',
  'lastReviewDate',
  'nextReviewDate',
  'defaultSingletonActionHolder',
]);

// Sort field enum for type safety
const SortFieldEnum = z.enum([
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

// Export field selection (matches ExportTool schema)
const ExportFieldEnum = z.enum([
  'id',
  'name',
  'note',
  'project',
  'tags',
  'deferDate',
  'dueDate',
  'plannedDate',
  'completed',
  'completionDate',
  'flagged',
  'estimated',
  'created',
  'createdDate',
  'modified',
  'modifiedDate',
]);

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
const TaskQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('tasks'),
    fields: z.array(TaskFieldEnum).optional(),
    mode: z
      .enum([
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
      ])
      .optional(),
    details: z.boolean().optional(),
    fastSearch: z.boolean().optional(),
    daysAhead: coerceNumber().min(1).max(30).optional(),
    countOnly: z.boolean().optional(),
  }),
).strict();

// Project queries: fields use ProjectFieldEnum, have details/includeStats
const ProjectQuerySchema = BaseQuerySchema.merge(
  z.object({
    type: z.literal('projects'),
    fields: z.array(ProjectFieldEnum).optional(),
    details: z.boolean().optional(),
    includeStats: z.boolean().optional(),
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
    outputDirectory: z.string().optional().describe('Directory for bulk export (required when exportType=all)'),
    includeStats: z.boolean().optional().describe('Include statistics in project export'),
    includeCompleted: z.boolean().optional().describe('Include completed tasks in export'),
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
export const ReadSchema = z.object({
  query: coerceObject(QuerySchema),
});

export type ReadInput = z.infer<typeof ReadSchema>;
