import type { ReadInput, FilterValue } from '../schemas/read-schema.js';
import type { TaskFilter } from '../../../contracts/filters.js';

// Re-export FilterValue as QueryFilter for backwards compatibility
export type QueryFilter = FilterValue;

export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders';
  mode?: 'all' | 'inbox' | 'search' | 'overdue' | 'today' | 'upcoming' | 'available' | 'blocked' | 'flagged' | 'smart_suggest';
  filters: TaskFilter;  // Changed from QueryFilter to TaskFilter
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

    // Transform filters from API schema to internal contract
    const filters: TaskFilter = query.filters
      ? this.transformFilters(query.filters)
      : {};

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

    // Handle logical operators
    if (input.AND && Array.isArray(input.AND)) {
      // Merge all conditions
      for (const condition of input.AND) {
        const transformed = this.transformFilters(condition as QueryFilter);
        Object.assign(result, transformed);
      }
      return result;
    }

    if (input.OR && Array.isArray(input.OR)) {
      // Log warning and use first condition only
      console.warn(
        '[QueryCompiler] OR operator not yet supported - using first condition only. ' +
        'If you need OR logic, please open an issue with your use case.'
      );
      if (input.OR.length > 0) {
        return this.transformFilters(input.OR[0] as QueryFilter);
      }
      return result;
    }

    if (input.NOT) {
      // Handle simple NOT cases
      const notFilter = input.NOT as QueryFilter;
      if (notFilter.status === 'completed') {
        result.completed = false;
      } else if (notFilter.status === 'active') {
        result.completed = true;
      } else {
        console.warn(
          '[QueryCompiler] Complex NOT operator simplified. Original: ' +
          JSON.stringify(notFilter)
        );
      }
      return result;
    }

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

    // Date transformation helper
    const transformDateFilter = (
      dateFilter: { before?: string; after?: string; between?: [string, string] } | undefined,
      beforeKey: 'dueBefore' | 'deferBefore',
      afterKey: 'dueAfter' | 'deferAfter',
      operatorKey?: 'dueDateOperator'
    ) => {
      if (!dateFilter) return;

      if ('before' in dateFilter && dateFilter.before) {
        (result as Record<string, unknown>)[beforeKey] = dateFilter.before;
      }
      if ('after' in dateFilter && dateFilter.after) {
        (result as Record<string, unknown>)[afterKey] = dateFilter.after;
      }
      if ('between' in dateFilter && dateFilter.between) {
        (result as Record<string, unknown>)[afterKey] = dateFilter.between[0];
        (result as Record<string, unknown>)[beforeKey] = dateFilter.between[1];
        if (operatorKey) {
          (result as Record<string, unknown>)[operatorKey] = 'BETWEEN';
        }
      }
    };

    // Due date transformation
    transformDateFilter(
      input.dueDate as { before?: string; after?: string; between?: [string, string] },
      'dueBefore',
      'dueAfter',
      'dueDateOperator'
    );

    // Defer date transformation
    transformDateFilter(
      input.deferDate as { before?: string; after?: string; between?: [string, string] },
      'deferBefore',
      'deferAfter'
    );

    // Text transformation
    if (input.text) {
      const textFilter = input.text as { contains?: string; matches?: string };
      if ('contains' in textFilter && textFilter.contains) {
        result.text = textFilter.contains;
        result.textOperator = 'CONTAINS';
      } else if ('matches' in textFilter && textFilter.matches) {
        result.text = textFilter.matches;
        result.textOperator = 'MATCHES';
      }
    }

    // Boolean passthrough
    if (input.flagged !== undefined) {
      result.flagged = input.flagged;
    }
    if (input.available !== undefined) {
      result.available = input.available;
    }
    if (input.blocked !== undefined) {
      result.blocked = input.blocked;
    }
    if (input.inInbox !== undefined) {
      result.inInbox = input.inInbox;
    }

    // Project transformation
    if (input.project === null) {
      result.inInbox = true;
    } else if (typeof input.project === 'string') {
      result.projectId = input.project;
    }

    // ID passthrough
    if (input.id) {
      result.id = input.id;
    }

    return result;
  }
}
