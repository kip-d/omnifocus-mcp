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
    // OMN-115: fastSearch is a query-level param, but the AST search builder only
    // sees the filter object. Thread it onto the filter so `fastSearch: true`
    // emits a name-only predicate (skips the note body) per the documented
    // "Name search" fast path.
    if ('fastSearch' in query && query.fastSearch !== undefined) {
      rawFilters.fastSearch = query.fastSearch;
    }
    const filters = normalizeFilter(rawFilters);
    const taskMode = 'mode' in query && query.mode ? query.mode : 'all';

    return {
      type: query.type,
      // Task-specific — default mode to 'all' for task queries only
      mode: query.type === 'tasks' ? taskMode : undefined,
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
    // Handle logical operators first — each returns early
    const logicalResult = this.transformLogicalOperator(input);
    if (logicalResult) return logicalResult;

    const result: TaskFilter = {};

    this.transformStatus(input, result);
    this.transformTags(input, result);
    this.transformDates(input, result);
    this.transformNumberFilters(input, result);
    this.transformTextFilters(input, result);

    // Boolean passthrough
    if (input.flagged !== undefined) result.flagged = input.flagged;
    if (input.available !== undefined) result.available = input.available;
    if (input.blocked !== undefined) result.blocked = input.blocked;
    if (input.inInbox !== undefined) result.inInbox = input.inInbox;

    // OMN-72: explicit `completed` is a direct alias for the completion
    // dimension. Applied after transformStatus so it overrides any
    // status-derived completion (e.g. status:'active' + completed:true).
    if (input.completed !== undefined) result.completed = input.completed;

    // Project transformation
    // OMN-43: explicit `projectId` takes precedence (fast path, unambiguous).
    // `project: null` still maps to inbox; `project: "string"` is treated as
    // a name-or-id with name lookup fallback (handled in the OmniJS emitter).
    if (typeof input.projectId === 'string') {
      result.projectId = input.projectId;
    } else if (input.project === null) {
      result.inInbox = true;
    } else if (typeof input.project === 'string') {
      result.projectId = input.project;
    }

    // ID/folder passthrough
    if (input.id) result.id = input.id;
    // OMN-96: `folder: null` means "top-level projects only" (the model's
    // natural guess); a string is a folder-name substring filter. Distinguish
    // them explicitly — `null` is falsy, so the old `if (input.folder)` truthy
    // check silently dropped it. See the decision record in read-schema.ts.
    if (input.folder === null) {
      result.folderTopLevel = true;
    } else if (typeof input.folder === 'string') {
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

  private transformLogicalOperator(input: QueryFilter): TaskFilter | null {
    if (input.AND && Array.isArray(input.AND)) {
      const result: TaskFilter = {};
      for (const condition of input.AND) {
        Object.assign(result, this.transformFilters(condition as FlatQueryFilter));
      }
      return result;
    }

    if (input.OR && Array.isArray(input.OR)) {
      if (input.OR.length === 0) return {};
      return {
        orBranches: input.OR.map((condition) => this.transformFilters(condition as FlatQueryFilter)),
      };
    }

    if (input.NOT) {
      const notFilter = input.NOT as FlatQueryFilter;
      if (notFilter.status === 'completed') return { completed: false };
      if (notFilter.status === 'active') return { completed: true };
      console.warn('[QueryCompiler] Complex NOT operator simplified. Original: ' + JSON.stringify(notFilter));
      return {};
    }

    return null;
  }

  private transformStatus(input: QueryFilter, result: TaskFilter): void {
    // Task-scope mapping. The same `status` value means different things at the
    // task level vs project level, so map both — downstream code uses whichever
    // is meaningful for the query type. (OMN-50: previously the `dropped` value
    // only set projectStatus, silently no-op for task queries.)
    if (input.status === 'completed') {
      result.completed = true;
    } else if (input.status === 'active') {
      result.completed = false;
    } else if (input.status === 'dropped') {
      result.dropped = true;
    }
    // Note: `on_hold` has no task-level equivalent — only projects can be
    // on-hold. Tracked as a follow-up to OMN-50.

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
  }

  private transformTags(input: QueryFilter, result: TaskFilter): void {
    if (!input.tags) return;
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

  private transformDates(input: QueryFilter, result: TaskFilter): void {
    const dateFieldDefs: Array<{
      inputKey: string;
      beforeKey: 'dueBefore' | 'deferBefore' | 'plannedBefore' | 'completionBefore' | 'addedBefore';
      afterKey: 'dueAfter' | 'deferAfter' | 'plannedAfter' | 'completionAfter' | 'addedAfter';
      operatorKey?: 'dueDateOperator' | 'plannedDateOperator' | 'completionDateOperator' | 'addedDateOperator';
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
      // OMN-48: filter tasks by creation timestamp.
      { inputKey: 'added', beforeKey: 'addedBefore', afterKey: 'addedAfter', operatorKey: 'addedDateOperator' },
    ];

    for (const def of dateFieldDefs) {
      const dateFilter = (input as Record<string, unknown>)[def.inputKey] as
        | { before?: string; after?: string; between?: [string, string] }
        | undefined;
      if (!dateFilter) continue;

      if ('before' in dateFilter && dateFilter.before) {
        (result as Record<string, unknown>)[def.beforeKey] = dateFilter.before;
      }
      if ('after' in dateFilter && dateFilter.after) {
        (result as Record<string, unknown>)[def.afterKey] = dateFilter.after;
      }
      if ('between' in dateFilter && dateFilter.between) {
        (result as Record<string, unknown>)[def.afterKey] = dateFilter.between[0];
        (result as Record<string, unknown>)[def.beforeKey] = dateFilter.between[1];
        if (def.operatorKey) {
          (result as Record<string, unknown>)[def.operatorKey] = 'BETWEEN';
        }
      }
    }
  }

  // OMN-49: number filters (currently just `estimatedMinutes`).
  // The schema accepts `{ equals | lessThan | greaterThan | between }`;
  // each maps to one or two TaskFilter properties consumed by the AST builder.
  private transformNumberFilters(input: QueryFilter, result: TaskFilter): void {
    const estimated = (input as Record<string, unknown>).estimatedMinutes as
      | { equals?: number; lessThan?: number; greaterThan?: number; between?: [number, number] }
      | undefined;
    if (!estimated) return;

    if (typeof estimated.equals === 'number') {
      result.estimatedMinutesEquals = estimated.equals;
    }
    if (typeof estimated.lessThan === 'number') {
      result.estimatedMinutesLessThan = estimated.lessThan;
    }
    if (typeof estimated.greaterThan === 'number') {
      result.estimatedMinutesGreaterThan = estimated.greaterThan;
    }
    if (Array.isArray(estimated.between) && estimated.between.length === 2) {
      // Inclusive range: a <= x <= b. Use open <,> bounds plus equals isn't right;
      // store as the two strict-bound properties — AST emits `> a-1` would be wrong,
      // but for typical "between 10 and 30" use cases users mean inclusive. Match
      // the date BETWEEN convention (also represented via two bounds) and rely
      // on the < / > operators in the AST. Edge inclusivity is a known minor wart.
      result.estimatedMinutesGreaterThan = estimated.between[0];
      result.estimatedMinutesLessThan = estimated.between[1];
    }
  }

  private transformTextFilters(input: QueryFilter, result: TaskFilter): void {
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

    if (input.name) {
      const nameFilter = input.name as { contains?: string; matches?: string };
      if ('contains' in nameFilter && nameFilter.contains) {
        result.search = nameFilter.contains;
      } else if ('matches' in nameFilter && nameFilter.matches) {
        result.search = nameFilter.matches;
      }
    }
  }
}
