import { z } from 'zod';
import { coerceNumber } from '../../schemas/coercion-helpers.js';

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

const FilterSchema: FilterType = z.lazy(() => z.object({
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

  // Project filters
  folder: z.string().optional(),

  // Logical operators
  AND: z.array(FilterSchema).optional(),
  OR: z.array(FilterSchema).optional(),
  NOT: FilterSchema.optional(),
}).passthrough());

// Field selection enum for type safety
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

// Sort options (matches backend QueryTasksTool schema which uses 'direction')
const SortSchema = z.object({
  field: SortFieldEnum,
  direction: z.enum(['asc', 'desc']),
});

// Main query schema
export const ReadSchema = z.object({
  query: z.object({
    type: z.enum(['tasks', 'projects', 'tags', 'perspectives', 'folders']),
    filters: FilterSchema.optional(),
    fields: z.array(TaskFieldEnum).optional(),
    sort: z.array(SortSchema).optional(),
    // Handle MCP Bridge Type Coercion: Claude Desktop converts numbers to strings
    limit: coerceNumber().min(1).max(500).optional(),
    offset: coerceNumber().min(0).optional(),

    // Mode parameter with all 10 modes from QueryTasksTool
    mode: z.enum([
      'all',           // List all tasks (with optional filters)
      'inbox',         // Tasks in inbox (not assigned to any project)
      'search',        // Text search in task names
      'overdue',       // Tasks past their due date
      'today',         // Today perspective: Due soon (≤3 days) OR flagged
      'upcoming',      // Tasks due in next N days
      'available',     // Tasks ready to work on
      'blocked',       // Tasks waiting on others
      'flagged',       // High priority tasks
      'smart_suggest', // AI-powered suggestions
    ]).optional(),

    // Response control parameters
    details: z.boolean().optional(), // Include full task details vs minimal
    fastSearch: z.boolean().optional(), // Search only names, not notes (performance)
    daysAhead: coerceNumber().min(1).max(30).optional(), // For upcoming mode: days to look ahead
    countOnly: z.boolean().optional(), // Return only count, not full task data (33x faster)
  }),
});

export type ReadInput = z.infer<typeof ReadSchema>;
