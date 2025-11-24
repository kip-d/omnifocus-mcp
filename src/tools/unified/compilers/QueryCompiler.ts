import type { ReadInput, FilterValue } from '../schemas/read-schema.js';
import type { TaskFilter } from '../../../contracts/filters.js';

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
  countOnly?: boolean; // Return only count (33x faster than fetching full tasks)
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
      countOnly: query.countOnly,
    };
  }

  /**
   * Transform FilterValue (API schema) to TaskFilter (internal contract)
   * This is the single translation point for filter property names.
   */
  transformFilters(input: QueryFilter): TaskFilter {
    const result: TaskFilter = {};

    // Status transformation
    if (input.status === 'completed') {
      result.completed = true;
    } else if (input.status === 'active') {
      result.completed = false;
    }
    // 'dropped' and 'on_hold' don't map to completion status

    // Tag transformation
    if (input.tags) {
      const tagFilter = input.tags as { any?: string[]; all?: string[]; none?: string[] };
      if (tagFilter.any && tagFilter.any.length > 0) {
        result.tags = tagFilter.any;
        result.tagsOperator = 'OR';
      } else if (tagFilter.all && tagFilter.all.length > 0) {
        result.tags = tagFilter.all;
        result.tagsOperator = 'AND';
      } else if (tagFilter.none && tagFilter.none.length > 0) {
        result.tags = tagFilter.none;
        result.tagsOperator = 'NOT_IN';
      }
    }

    return result;
  }
}
