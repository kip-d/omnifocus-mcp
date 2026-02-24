import type { ReadInput, FilterValue, FlatFilterValue } from '../schemas/read-schema.js';
import type { TaskFilter, NormalizedTaskFilter, ProjectStatus } from '../../../contracts/filters.js';
import type { SortableField } from '../../../contracts/ast/script-builder.js';
import { normalizeFilter, validateFilterProperties } from '../../../contracts/filters.js';

// Re-export FilterValue as QueryFilter for backwards compatibility
export type QueryFilter = FilterValue;
// Items inside AND/OR/NOT are flat (no nested logical operators)
export type FlatQueryFilter = FlatFilterValue;

export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders' | 'export';
  mode?:
    | 'all'
    | 'inbox'
    | 'search'
    | 'overdue'
    | 'today'
    | 'upcoming'
    | 'available'
    | 'blocked'
    | 'flagged'
    | 'smart_suggest';
  filters: NormalizedTaskFilter; // Normalized during compilation
  fields?: string[];
  sort?: Array<{ field: SortableField; direction: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
  // Response control parameters
  details?: boolean;
  fastSearch?: boolean;
  daysAhead?: number;
  countOnly?: boolean; // Return only count (33x faster than fetching full tasks)
  // Export parameters (when type='export')
  exportType?: 'tasks' | 'projects' | 'all';
  format?: 'json' | 'csv' | 'markdown';
  exportFields?: string[];
  outputDirectory?: string;
  includeStats?: boolean;
  includeCompleted?: boolean;
}

/**
 * QueryCompiler translates builder JSON into parameters for existing tools
 */
export class QueryCompiler {
  compile(input: ReadInput): CompiledQuery {
    const { query } = input;

    // Transform filters from API schema to internal contract, then normalize
    const rawFilters: TaskFilter = query.filters ? this.transformFilters(query.filters) : {};
    const filters = normalizeFilter(rawFilters);

    return {
      type: query.type,
      // Task-specific — default mode to 'all' for task queries only
      mode: query.type === 'tasks' ? ('mode' in query && query.mode ? query.mode : 'all') : undefined,
      filters,
      fields: 'fields' in query ? query.fields : undefined,
      sort: 'sort' in query ? query.sort : undefined,
      limit: 'limit' in query ? query.limit : undefined,
      offset: 'offset' in query ? query.offset : undefined,
      // Task-specific response control
      details: 'details' in query ? query.details : undefined,
      fastSearch: 'fastSearch' in query ? query.fastSearch : undefined,
      daysAhead: 'daysAhead' in query ? query.daysAhead : undefined,
      countOnly: 'countOnly' in query ? query.countOnly : undefined,
      // Export-specific
      exportType: 'exportType' in query ? query.exportType : undefined,
      format: 'format' in query ? query.format : undefined,
      exportFields: 'exportFields' in query ? query.exportFields : undefined,
      outputDirectory: 'outputDirectory' in query ? query.outputDirectory : undefined,
      includeStats: 'includeStats' in query ? query.includeStats : undefined,
      includeCompleted: 'includeCompleted' in query ? query.includeCompleted : undefined,
    };
  }

  /**
   * Transform FilterValue (API schema) to TaskFilter (internal contract)
   * This is the single translation point for filter property names.
   */
  transformFilters(input: QueryFilter): TaskFilter {
    const result: TaskFilter = {};

    // Handle logical operators (items are FlatFilterValue — no nested AND/OR/NOT)
    if (input.AND && Array.isArray(input.AND)) {
      // Merge all conditions via Object.assign (flat merge, not recursive)
      for (const condition of input.AND) {
        const transformed = this.transformFilters(condition as FlatQueryFilter);
        Object.assign(result, transformed);
      }
      return result;
    }

    if (input.OR && Array.isArray(input.OR)) {
      // Log warning and use first condition only
      console.warn(
        '[QueryCompiler] OR operator not yet supported - using first condition only. ' +
          'If you need OR logic, please open an issue with your use case.',
      );
      if (input.OR.length > 0) {
        return this.transformFilters(input.OR[0] as FlatQueryFilter);
      }
      return result;
    }

    if (input.NOT) {
      // Handle simple NOT cases
      const notFilter = input.NOT as FlatQueryFilter;
      if (notFilter.status === 'completed') {
        result.completed = false;
      } else if (notFilter.status === 'active') {
        result.completed = true;
      } else {
        console.warn('[QueryCompiler] Complex NOT operator simplified. Original: ' + JSON.stringify(notFilter));
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

    // Preserve raw status for project queries (ProjectFilter uses ProjectStatus[])
    if (input.status) {
      const STATUS_TO_PROJECT: Record<string, ProjectStatus> = {
        active: 'active',
        on_hold: 'onHold',
        completed: 'done',
        dropped: 'dropped',
      };
      const mapped = STATUS_TO_PROJECT[input.status];
      if (mapped) {
        result.projectStatus = [mapped];
      }
    }

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
      beforeKey: 'dueBefore' | 'deferBefore' | 'plannedBefore' | 'completionBefore',
      afterKey: 'dueAfter' | 'deferAfter' | 'plannedAfter' | 'completionAfter',
      operatorKey?: 'dueDateOperator' | 'plannedDateOperator' | 'completionDateOperator',
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

    // Date transformations — loop over all date field definitions
    const dateFieldDefs: Array<{
      inputKey: string;
      beforeKey: 'dueBefore' | 'deferBefore' | 'plannedBefore' | 'completionBefore';
      afterKey: 'dueAfter' | 'deferAfter' | 'plannedAfter' | 'completionAfter';
      operatorKey?: 'dueDateOperator' | 'plannedDateOperator' | 'completionDateOperator';
    }> = [
      { inputKey: 'dueDate', beforeKey: 'dueBefore', afterKey: 'dueAfter', operatorKey: 'dueDateOperator' },
      { inputKey: 'deferDate', beforeKey: 'deferBefore', afterKey: 'deferAfter' },
      {
        inputKey: 'plannedDate',
        beforeKey: 'plannedBefore',
        afterKey: 'plannedAfter',
        operatorKey: 'plannedDateOperator',
      },
      {
        inputKey: 'completionDate',
        beforeKey: 'completionBefore',
        afterKey: 'completionAfter',
        operatorKey: 'completionDateOperator',
      },
    ];

    for (const def of dateFieldDefs) {
      transformDateFilter(
        (input as Record<string, unknown>)[def.inputKey] as
          | { before?: string; after?: string; between?: [string, string] }
          | undefined,
        def.beforeKey,
        def.afterKey,
        def.operatorKey,
      );
    }

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

    // Name filter transformation (for project name search)
    if (input.name) {
      const nameFilter = input.name as { contains?: string; matches?: string };
      if ('contains' in nameFilter && nameFilter.contains) {
        result.search = nameFilter.contains;
      } else if ('matches' in nameFilter && nameFilter.matches) {
        result.search = nameFilter.matches;
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

    // Folder passthrough (for project filtering)
    if (input.folder) {
      result.folder = input.folder;
    }

    // Safety net: warn on unknown properties that survived schema validation
    const unknownProps = validateFilterProperties(result as Record<string, unknown>);
    if (unknownProps.length > 0) {
      console.warn(
        `[QueryCompiler] Unknown filter properties detected: ${unknownProps.join(', ')}. ` +
          'These will be ignored. Check for typos or missing pipeline support.',
      );
    }

    return result;
  }
}
