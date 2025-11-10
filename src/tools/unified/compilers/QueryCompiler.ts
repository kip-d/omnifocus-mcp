import type { ReadInput, FilterValue } from '../schemas/read-schema.js';

// Re-export FilterValue as QueryFilter for backwards compatibility
export type QueryFilter = FilterValue;

export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders';
  mode?: 'all' | 'inbox' | 'search' | 'overdue' | 'today' | 'upcoming' | 'available' | 'blocked' | 'flagged' | 'smart_suggest';
  filters: QueryFilter;
  fields?: string[];
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
  // Response control parameters
  details?: boolean;
  fastSearch?: boolean;
  daysAhead?: number;
}

/**
 * QueryCompiler translates builder JSON into parameters for existing tools
 */
export class QueryCompiler {
  compile(input: ReadInput): CompiledQuery {
    const { query } = input;

    // Pass through filters (existing tools can handle the structure)
    // Ensure filters is always defined (empty object if not provided)
    const filters: QueryFilter = query.filters || {};

    return {
      type: query.type,
      mode: query.mode || 'all', // Default to 'all' mode if not specified
      filters,
      fields: query.fields,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
      // Response control parameters
      details: query.details,
      fastSearch: query.fastSearch,
      daysAhead: query.daysAhead,
    };
  }
}
