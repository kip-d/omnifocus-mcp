import { z } from 'zod';

// Filter operators for flexible queries
const TagFilterSchema = z.object({
  all: z.array(z.string()).optional(),
  any: z.array(z.string()).optional(),
  none: z.array(z.string()).optional(),
});

const DateFilterSchema = z.object({
  before: z.string().optional(),
  after: z.string().optional(),
  between: z.tuple([z.string(), z.string()]).optional(),
});

const TextFilterSchema = z.object({
  contains: z.string().optional(),
  matches: z.string().optional(),
});

// Define the filter value type first (for recursive reference)
export interface FilterValue {
  // Task filters
  status?: 'active' | 'completed' | 'dropped' | 'on_hold';
  tags?: z.infer<typeof TagFilterSchema>;
  project?: string | null;
  dueDate?: z.infer<typeof DateFilterSchema>;
  deferDate?: z.infer<typeof DateFilterSchema>;
  flagged?: boolean;
  blocked?: boolean;
  available?: boolean;
  text?: z.infer<typeof TextFilterSchema>;

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
  status: z.enum(['active', 'completed', 'dropped', 'on_hold']).optional(),
  tags: TagFilterSchema.optional(),
  project: z.union([z.string(), z.null()]).optional(),
  dueDate: DateFilterSchema.optional(),
  deferDate: DateFilterSchema.optional(),
  flagged: z.boolean().optional(),
  blocked: z.boolean().optional(),
  available: z.boolean().optional(),
  text: TextFilterSchema.optional(),

  // Project filters
  folder: z.string().optional(),

  // Logical operators
  AND: z.array(FilterSchema).optional(),
  OR: z.array(FilterSchema).optional(),
  NOT: FilterSchema.optional(),
}).passthrough());

// Sort options
const SortSchema = z.object({
  field: z.string(),
  order: z.enum(['asc', 'desc']),
});

// Main query schema
export const ReadSchema = z.object({
  query: z.object({
    type: z.enum(['tasks', 'projects', 'tags', 'perspectives', 'folders']),
    filters: FilterSchema.optional(),
    fields: z.array(z.string()).optional(),
    sort: z.array(SortSchema).optional(),
    limit: z.number().min(1).max(500).optional(),
    offset: z.number().min(0).optional(),
    mode: z.enum(['search', 'smart_suggest']).optional(),
  }),
});

export type ReadInput = z.infer<typeof ReadSchema>;
