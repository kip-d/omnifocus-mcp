import type { ReadInput } from '../schemas/read-schema.js';

// Type for filter operators
interface TagFilter {
  all?: string[];
  any?: string[];
  none?: string[];
}

interface DateFilter {
  before?: string;
  after?: string;
  between?: [string, string];
}

interface TextFilter {
  contains?: string;
  matches?: string;
}

// Recursive filter type (simplified - actual runtime validation done by Zod)
export interface QueryFilter {
  // Task filters
  status?: 'active' | 'completed' | 'dropped' | 'on_hold';
  tags?: TagFilter;
  project?: string | null;
  dueDate?: DateFilter;
  deferDate?: DateFilter;
  flagged?: boolean;
  blocked?: boolean;
  available?: boolean;
  text?: TextFilter;

  // Project filters
  folder?: string;

  // Logical operators (allow any for recursive filters)
  AND?: QueryFilter[];
  OR?: QueryFilter[];
  NOT?: QueryFilter;

  // Allow passthrough of unknown fields
  [key: string]: unknown;
}

export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders';
  mode: 'all' | 'search' | 'smart_suggest';
  filters: QueryFilter;
  fields?: string[];
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
}

/**
 * QueryCompiler translates builder JSON into parameters for existing tools
 */
export class QueryCompiler {
  compile(input: ReadInput): CompiledQuery {
    const { query } = input;

    // Determine mode
    let mode: CompiledQuery['mode'] = 'all';
    if (query.mode === 'search') mode = 'search';
    else if (query.mode === 'smart_suggest') mode = 'smart_suggest';

    // Pass through filters (existing tools can handle the structure)
    // Ensure filters is always defined (empty object if not provided)
    const filters: QueryFilter = query.filters || {};

    return {
      type: query.type,
      mode,
      filters,
      fields: query.fields,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
