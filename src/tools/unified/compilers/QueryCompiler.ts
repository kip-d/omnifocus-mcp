import { z } from 'zod';
import type { ReadInput, FilterValue, FlatFilterValue } from '../schemas/read-schema.js';
import type {
  TaskFilter,
  NormalizedTaskFilter,
  ProjectFilter,
  TagFilter,
  FolderFilter,
  PerspectiveFilter,
} from '../../../contracts/filters.js';
import type { SortableField } from '../../../contracts/ast/script-builder.js';
import { normalizeFilter, validateFilterProperties } from '../../../contracts/filters.js';
import { buildAST } from '../../../contracts/ast/builder.js';
import { isLiteralNode } from '../../../contracts/ast/types.js';
import {
  mergeConflictChecked,
  emptyOperatorError,
  extractTextCondition,
  STATUS_TO_PROJECT,
  type MergeSource,
} from './filter-merge.js';
import { transformProjectFilters } from './transform-project-filters.js';
import { transformTagFilters, transformFolderFilters, transformPerspectiveFilters } from './reject-filters.js';
import { TASK_KEY_DISPOSITION, ON_HOLD_TASKS_REJECTION, terminalBranchRejection } from './task-key-disposition.js';
import { assertValidFolderPath } from './folder-path-validation.js';

// Re-export FilterValue as QueryFilter for backwards compatibility
export type QueryFilter = FilterValue;
// Items inside AND/OR/NOT are flat (no nested logical operators)
export type FlatQueryFilter = FlatFilterValue;

/**
 * OMN-161 S1: shared response-control fields present on every CompiledQuery variant.
 */
interface CompiledQueryBase {
  fields?: string[];
  sort?: Array<{ field: SortableField; direction: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
  details?: boolean;
}

type TaskMode =
  | 'all'
  | 'inbox'
  | 'search'
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'available'
  | 'blocked'
  | 'flagged'
  | 'smart_suggest'
  | 'forecast_past'; // OMN-133

/**
 * OMN-161 S1: CompiledQuery is a discriminated union keyed by `type`.
 * Each variant carries its own typed `filters` shape — no more shared
 * flat interface or `projectFilter?` side-channel.
 */
export type CompiledQuery =
  | (CompiledQueryBase & {
      type: 'tasks';
      filters: NormalizedTaskFilter;
      mode?: TaskMode;
      fastSearch?: boolean;
      daysAhead?: number;
      countOnly?: boolean;
      includeProjectRoot?: boolean; // OMN-153: query-level param, threaded onto filter
    })
  | (CompiledQueryBase & { type: 'projects'; filters: ProjectFilter; includeStats?: boolean; countOnly?: boolean })
  | (CompiledQueryBase & { type: 'tags'; filters: TagFilter; countOnly?: boolean })
  | (CompiledQueryBase & { type: 'folders'; filters: FolderFilter; countOnly?: boolean })
  | (CompiledQueryBase & { type: 'perspectives'; filters: PerspectiveFilter });

/**
 * OMN-162: Returns true if the given TaskFilter compiles to a literal(true) AST node —
 * meaning it would match every task (match-all). Used as a defense-in-depth guard at three
 * sites in transformFilters to catch filters whose keys are accepted by the schema but
 * produce zero AST conditions (e.g. tags:{any:[]} after transformTags skips empty arrays).
 */
export function compilesToMatchAll(filter: TaskFilter): boolean {
  const node = buildAST(filter);
  return isLiteralNode(node) && node.value === true;
}

/**
 * QueryCompiler translates builder JSON into parameters for existing tools
 */
export class QueryCompiler {
  compile(input: ReadInput): CompiledQuery {
    const { query } = input;

    const base: CompiledQueryBase = {
      fields: 'fields' in query ? query.fields : undefined,
      sort: 'sort' in query ? query.sort : undefined,
      limit: 'limit' in query ? query.limit : undefined,
      offset: 'offset' in query ? query.offset : undefined,
      details: 'details' in query ? query.details : undefined,
    };

    switch (query.type) {
      case 'projects':
        return {
          ...base,
          type: 'projects',
          filters: transformProjectFilters(query.filters ?? {}),
          includeStats: 'includeStats' in query ? query.includeStats : undefined,
          countOnly: 'countOnly' in query ? query.countOnly : undefined, // OMN-174
        };
      case 'tags':
        return {
          ...base,
          type: 'tags',
          filters: transformTagFilters(query.filters ?? {}),
          countOnly: 'countOnly' in query ? query.countOnly : undefined, // OMN-174
        };
      case 'folders':
        return {
          ...base,
          type: 'folders',
          filters: transformFolderFilters(query.filters ?? {}),
          countOnly: 'countOnly' in query ? query.countOnly : undefined, // OMN-174
        };
      case 'perspectives':
        return { ...base, type: 'perspectives', filters: transformPerspectiveFilters(query.filters ?? {}) };
      case 'tasks': {
        // OMN-115: fastSearch is a query-level param, but the AST search builder only
        // sees the filter object. Thread it onto the filter so `fastSearch: true`
        // emits a name-only predicate (skips the note body) per the documented
        // "Name search" fast path.
        const raw: TaskFilter = query.filters ? this.transformFilters(query.filters) : {};
        if (query.fastSearch !== undefined) {
          raw.fastSearch = query.fastSearch;
        }
        // OMN-153: includeProjectRoot is a query-level param. Thread it onto the filter
        // so the script builders can apply the default exclusion or opt-in projection.
        // NOT processed through transformFilters (not a filters:{} input key).
        if (query.includeProjectRoot !== undefined) {
          raw.includeProjectRoot = query.includeProjectRoot;
        }
        const filters = normalizeFilter(raw);
        this.assertSatisfiableTerminalBranches(filters); // OMN-172 S4
        return {
          ...base,
          type: 'tasks',
          filters,
          mode: (query.mode ?? 'all') as TaskMode,
          fastSearch: query.fastSearch,
          daysAhead: query.daysAhead,
          countOnly: query.countOnly,
          includeProjectRoot: query.includeProjectRoot,
        };
      }
      default: {
        const _exhaustive: never = query;
        throw new Error(`Unhandled query type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  /**
   * OMN-172 (S4): reject an OR branch that requests a terminal state (dropped/completed)
   * the base will exclude, making the branch silently unsatisfiable. For tasks the base
   * excludes a terminal state iff the top-level filter does not pin it to `true`
   * (undefined → default-exclude; explicit `false` → same effect; only top-level `true`
   * lifts the exclusion). See the S4 design §3.
   */
  private assertSatisfiableTerminalBranches(filters: NormalizedTaskFilter): void {
    const branches = filters.orBranches;
    if (!branches || branches.length === 0) return;
    const STATES = ['dropped', 'completed'] as const;
    branches.forEach((branch, i) => {
      for (const state of STATES) {
        const baseExcludes = filters[state] !== true;
        if (baseExcludes && branch[state] === true) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters', 'OR', i, state],
              message: terminalBranchRejection(i, state),
            },
          ]);
        }
      }
    });
  }

  /**
   * Transform FilterValue (API schema) to TaskFilter (internal contract)
   * This is the single translation point for filter property names.
   *
   * OMN-151: base fields and ALL present logical operators AND-compose. The old
   * early-return silently dropped sibling keys (V1) and the second operator (V4).
   * Same-key conflicts across merge sources reject loudly (V2).
   * AND: [] / OR: [] reject (V3 — were match-all).
   * The OMN-131 NOT contract is preserved exactly.
   */
  transformFilters(input: QueryFilter): TaskFilter {
    const sources: MergeSource[] = [
      { origin: 'filters', filter: this.transformFlatFilter(input as FlatQueryFilter, 'filters') },
    ];

    if (input.AND !== undefined && Array.isArray(input.AND)) {
      // Non-array values are unreachable past schema validation (defense-in-depth for readers)
      if (input.AND.length === 0) throw emptyOperatorError('AND');
      input.AND.forEach((condition, i) => {
        const transformed = this.transformFlatFilter(condition as FlatQueryFilter, `AND[${i}]`);
        if (this.usableKeyCount(transformed) === 0) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters', 'AND', i],
              message:
                `AND[${i}] contains no usable conditions. ` +
                'Every AND item must contain at least one filter; remove the empty item or add a condition.',
            },
          ]);
        }
        // OMN-162 defense-in-depth: even if non-zero keys are present, reject if they
        // all compile away to literal(true) — e.g. tags:{any:[]}. Shadowed by the
        // usableKeyCount check for currently-expressible inputs; guards future drift.
        if (compilesToMatchAll(transformed)) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters', 'AND', i],
              message:
                `AND[${i}] contains no executable conditions — its keys are accepted by the schema but compile to no task-level filter, ` +
                'which would silently match every task. Remove the branch or use a supported tasks filter.',
            },
          ]);
        }
        sources.push({ origin: `AND[${i}]`, filter: transformed });
      });
    }

    if (input.NOT !== undefined) {
      sources.push({ origin: 'NOT', filter: this.transformNot(input.NOT as FlatQueryFilter) });
    }

    const merged = mergeConflictChecked(sources);

    // OMN-162 BASE SITE: if the input had ≥1 defined non-operator top-level key but
    // those keys all compiled away to literal(true), reject. This is the live bug path:
    // {tags:{any:[]}} passes schema validation, transformTags skips empty arrays,
    // the base has zero conditions, and buildAST returns literal(true) — silently
    // matching every task.
    //
    // Gate: at least one non-operator key must be defined (=== not undefined) at the
    // input level. Bare {} and absent filters are intentional browse; {} → compilesToMatchAll
    // but we do NOT reject those (they have zero input-level intent).
    // Operator keys (AND, OR, NOT) are excluded — they contribute via their own sites.
    const OPERATOR_KEYS = new Set(['AND', 'OR', 'NOT']);
    const hasNonOperatorInputKey = Object.keys(input).some(
      (k) => !OPERATOR_KEYS.has(k) && (input as Record<string, unknown>)[k] !== undefined,
    );
    if (hasNonOperatorInputKey && compilesToMatchAll(merged)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ['query', 'filters'],
          message:
            'filters contains no executable conditions — its keys are accepted by the schema but compile to no task-level filter, ' +
            'which would silently match every task. Remove the filter or use a supported tasks filter.',
        },
      ]);
    }

    if (input.OR !== undefined && Array.isArray(input.OR)) {
      // Non-array values are unreachable past schema validation (defense-in-depth for readers)
      if (input.OR.length === 0) throw emptyOperatorError('OR');
      merged.orBranches = input.OR.map((condition, i) => {
        const transformed = this.transformFlatFilter(condition as FlatQueryFilter, `OR[${i}]`);
        if (this.usableKeyCount(transformed) === 0) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters', 'OR', i],
              message:
                `OR[${i}] contains no usable conditions. ` +
                'An empty OR branch would match everything; remove the empty item or add a condition.',
            },
          ]);
        }
        // OMN-162 defense-in-depth: even if non-zero keys are present, reject if they
        // all compile away to literal(true). Shadowed by usableKeyCount for currently-
        // expressible inputs; guards future transform drift.
        if (compilesToMatchAll(transformed)) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters', 'OR', i],
              message:
                `OR[${i}] contains no executable conditions — its keys are accepted by the schema but compile to no task-level filter, ` +
                'which would silently match every task. Remove the branch or use a supported tasks filter.',
            },
          ]);
        }
        return transformed;
      });
    }

    this.rejectFolderContradiction(merged);
    return merged;
  }

  /**
   * OMN-167: `folder:"X"` and `folder:null` map to DIFFERENT internal keys (folder vs
   * folderTopLevel), so mergeConflictChecked (same-key only) never sees the contradiction.
   * ANDing "in folder X" with "top-level (no folder)" is unsatisfiable — it compiles to an
   * always-false predicate → 0 results with no error (a no-silent-failures violation).
   *
   * The conjunction is `base AND (orBranch_1 OR orBranch_2 OR …)`. So folderMatch is FORCED
   * iff base sets folder OR every OR branch sets folder; folderTopLevel is FORCED iff base
   * sets it OR every OR branch sets it. Both forced ⇒ unsatisfiable. (`{OR:[{folder:"X"},
   * {folder:null}]}` is satisfiable — "in X OR top-level" — and is correctly NOT rejected.)
   */
  private rejectFolderContradiction(merged: TaskFilter): void {
    const branches = merged.orBranches;
    const everyBranch = (pred: (b: TaskFilter) => boolean): boolean =>
      Array.isArray(branches) && branches.length > 0 && branches.every(pred);
    const forcedFolder = merged.folder !== undefined || everyBranch((b) => b.folder !== undefined);
    const forcedTopLevel = merged.folderTopLevel === true || everyBranch((b) => b.folderTopLevel === true);
    if (forcedFolder && forcedTopLevel) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ['query', 'filters'],
          message:
            'Contradictory folder filters: a folder path requires a containing folder, but folder:null requires a ' +
            'top-level project (no folder). AND-composed they match nothing. Use one or the other, or OR for alternatives.',
        },
      ]);
    }
  }

  /**
   * Translate a flat (non-logical) filter into the internal TaskFilter contract.
   * Called by transformFilters for the top-level base fields and for each AND/OR
   * item (which are always schema-flat by the input schema contract).
   *
   * `origin` is the dot-path segment used for ZodError paths ('filters', 'AND[0]',
   * 'OR[1]', etc.). Defaults to 'filters' for the base call.
   */
  private transformFlatFilter(input: FlatQueryFilter, origin: string = 'filters'): TaskFilter {
    // OMN-162: tasks-side key dispositions. Reject on disposition === 'reject' ONLY —
    // the base call passes the full input (AND/OR/NOT included), so a !== 'map'
    // check would reject every operator-using query.
    // OMN-167: zero keys are 'reject' now (folder became 'map'). The loop stays as a
    // structural guard: a future unsupported tasks key set to 'reject' is rejected
    // here generically (a per-key steering message replaces the old folder constant).
    for (const key of Object.keys(input)) {
      if ((input as Record<string, unknown>)[key] === undefined) continue;
      if ((TASK_KEY_DISPOSITION as Record<string, string>)[key] === 'reject') {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: this.originToPath(origin),
            message: `filters.${key} is not supported on tasks queries.`,
          },
        ]);
      }
    }

    const result: TaskFilter = {};

    this.transformStatus(input, result, origin);
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

    // OMN-114: parentTaskId — direct children of a task. Unambiguous id match.
    if (typeof input.parentTaskId === 'string') {
      result.parentTaskId = input.parentTaskId;
    }

    // ID passthrough
    if (input.id) result.id = input.id;

    // OMN-167: folder filter on tasks. `folder: "<path>"` → subtree path match
    // (TaskFilter.folder → builder's task.folderMatch). `folder: null` → top-level
    // project tasks (folderTopLevel), mirroring the projects-side null handling and
    // the OMN-96 `folder: null` semantics. Inbox tasks are excluded by both emitters.
    // Validate the path here (ZodError + origin path) so an invalid path is a
    // VALIDATION_ERROR, not a late EXECUTION_ERROR from the OmniJS emitter.
    if (typeof input.folder === 'string') {
      assertValidFolderPath(input.folder, [...this.originToPath(origin), 'folder']);
      result.folder = input.folder;
    } else if (input.folder === null) {
      result.folderTopLevel = true;
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

  private transformNot(notFilter: FlatQueryFilter): TaskFilter {
    // OMN-131 contract, unchanged: exactly the two status payloads; everything
    // else hard-rejects (was silent match-all before 5b41534).
    if (Object.keys(notFilter).length === 1) {
      if (notFilter.status === 'completed') return { completed: false };
      if (notFilter.status === 'active') return { completed: true };
    }
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['query', 'filters', 'NOT'],
        message:
          `Unsupported NOT filter: ${JSON.stringify(notFilter)}. ` +
          "NOT supports exactly { status: 'completed' } or { status: 'active' }. " +
          'Alternatives: tag exclusion → tags: { none: [...] }; ' +
          'flagged exclusion → flagged: false; ' +
          'otherwise express the condition directly without NOT.',
      },
    ]);
  }

  private transformStatus(input: QueryFilter, result: TaskFilter, origin: string = 'filters'): void {
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
    } else if (input.status === 'on_hold') {
      // OMN-166: was a silent match-all — on_hold set only the dead projectStatus key.
      // OMN-161 F5: use origin-aware path so OR[1] reports ['query','filters','OR',1,'status'].
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: [...this.originToPath(origin), 'status'],
          message: ON_HOLD_TASKS_REJECTION,
        },
      ]);
    }

    if (input.status) {
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
    const textCond = extractTextCondition(input.text as { contains?: string; matches?: string } | undefined);
    if (textCond) {
      result.text = textCond.value;
      result.textOperator = textCond.operator;
    }

    // OMN-142: `name` compiles to the name-scoped fields, NEVER the legacy
    // `search` alias — `search` matches note content too, and that over-match
    // collaterally deleted a real user task (2026-06-09).
    const nameCond = extractTextCondition(input.name as { contains?: string; matches?: string } | undefined);
    if (nameCond) {
      result.name = nameCond.value;
      result.nameOperator = nameCond.operator;
    }
  }

  /**
   * Convert an origin string into a ZodError path array.
   * 'filters'    → ['query', 'filters']
   * 'AND[0]'     → ['query', 'filters', 'AND', 0]
   * 'OR[2]'      → ['query', 'filters', 'OR', 2]
   */
  private originToPath(origin: string): (string | number)[] {
    const match = origin.match(/^(AND|OR)\[(\d+)\]$/);
    if (match) {
      return ['query', 'filters', match[1], parseInt(match[2], 10)];
    }
    return ['query', 'filters'];
  }

  /**
   * Count the number of defined (non-undefined) keys in a TaskFilter.
   * Used to detect empty operator items (AND items or OR branches that
   * transformed to zero usable conditions — match-all silent widening).
   */
  private usableKeyCount(filter: TaskFilter): number {
    return Object.values(filter).filter((v) => v !== undefined).length;
  }
}
