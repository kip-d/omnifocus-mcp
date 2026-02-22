/**
 * AST Builder - Transforms TaskFilter to FilterAST
 *
 * This module converts the internal TaskFilter representation to an AST
 * that can be validated and emitted to different targets (JXA, OmniJS).
 *
 * All filter types are registered in the unified FILTER_DEFS registry.
 * Adding a new filter requires one new entry in FILTER_DEFS.
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { TaskFilter, DateOperator, NormalizedTaskFilter } from '../filters.js';
import type { FilterNode, ComparisonNode, AndNode, OrNode, ExistsNode, NotNode } from './types.js';

// =============================================================================
// UNIFIED FILTER REGISTRY
// =============================================================================

/**
 * A filter definition that can produce an AST node from a TaskFilter.
 *
 * - fields: AST field names this def touches (used to derive KNOWN_FIELDS)
 * - build: returns a FilterNode or null (null = filter not active, skip)
 */
export interface FilterDef {
  readonly fields: readonly string[];
  readonly build: (filter: TaskFilter | NormalizedTaskFilter) => FilterNode | null;
}

/**
 * Data-driven date filter definitions.
 * Adding a new date filter (e.g. completionDate) requires only one new entry here.
 *
 * - field: the AST field path (e.g. 'task.dueDate')
 * - after/before/operator: corresponding TaskFilter property names (keyof TaskFilter for compile-time safety)
 * - skipWhen: optional TaskFilter boolean property that suppresses this handler
 */
interface DateFilterDef {
  readonly field: string;
  readonly after: keyof TaskFilter;
  readonly before: keyof TaskFilter;
  readonly operator: keyof TaskFilter;
  readonly skipWhen?: keyof TaskFilter;
}

export const DATE_FILTER_DEFS: readonly DateFilterDef[] = [
  { field: 'task.dueDate', after: 'dueAfter', before: 'dueBefore', operator: 'dueDateOperator', skipWhen: 'todayMode' },
  { field: 'task.deferDate', after: 'deferAfter', before: 'deferBefore', operator: 'deferDateOperator' },
  { field: 'task.plannedDate', after: 'plannedAfter', before: 'plannedBefore', operator: 'plannedDateOperator' },
  { field: 'task.completionDate', after: 'completionAfter', before: 'completionBefore', operator: 'completionDateOperator' },
];

/**
 * Unified filter registry. Every filter type handled by buildAST() is
 * represented as an entry here. Order matters: todayMode must precede
 * flagged and date filters because it consumes those properties.
 */
export const FILTER_DEFS: readonly FilterDef[] = [
  // --- ID filter ---
  {
    fields: ['task.id.primaryKey'],
    build: (f) => (f.id !== undefined ? comparison('task.id.primaryKey', '==', f.id) : null),
  },

  // --- Completion status ---
  {
    fields: ['task.completed'],
    build: (f) => (f.completed !== undefined ? comparison('task.completed', '==', f.completed) : null),
  },

  // --- Today Mode (OR logic: Due Soon OR Flagged) ---
  // Must come BEFORE flagged and due date handlers to consume those properties
  {
    fields: ['task.dueDate', 'task.flagged'],
    build: (f) => {
      if (!f.todayMode || !f.dueBefore) return null;
      const dueSoonCondition = and(exists('task.dueDate', true), comparison('task.dueDate', '<', f.dueBefore));
      const flaggedCondition = comparison('task.flagged', '==', true);
      return or(dueSoonCondition, flaggedCondition);
    },
  },

  // --- Tag status filter ---
  {
    fields: ['task.tagStatusValid'],
    build: (f) => (f.tagStatusValid !== undefined ? comparison('task.tagStatusValid', '==', f.tagStatusValid) : null),
  },

  // --- Boolean flags ---
  // Skip flagged when todayMode is active (consumed by OR node above)
  {
    fields: ['task.flagged'],
    build: (f) => (f.flagged !== undefined && !f.todayMode ? comparison('task.flagged', '==', f.flagged) : null),
  },
  {
    fields: ['task.blocked'],
    build: (f) => (f.blocked !== undefined ? comparison('task.blocked', '==', f.blocked) : null),
  },
  {
    fields: ['task.available'],
    build: (f) => (f.available !== undefined ? comparison('task.available', '==', f.available) : null),
  },
  {
    fields: ['task.inInbox'],
    build: (f) => (f.inInbox !== undefined ? comparison('task.inInbox', '==', f.inInbox) : null),
  },

  // --- Status filters ---
  {
    fields: ['task.dropped'],
    build: (f) => (f.dropped !== undefined ? comparison('task.dropped', '==', f.dropped) : null),
  },

  // --- Repetition rule filter ---
  {
    fields: ['task.repetitionRule'],
    build: (f) => (f.hasRepetitionRule !== undefined ? exists('task.repetitionRule', f.hasRepetitionRule) : null),
  },

  // --- Tags ---
  {
    fields: ['taskTags'],
    build: (f) => {
      if (!f.tags || f.tags.length === 0) return null;
      return buildTagsNode(f.tags, f.tagsOperator || 'AND');
    },
  },

  // --- Text search ---
  // Support both filter.text and filter.search (legacy alias for compatibility)
  // Per spec (filters.ts:113-115), search checks BOTH name AND note
  {
    fields: ['task.name', 'task.note'],
    build: (f) => {
      const searchTerm = f.text ?? f.search;
      if (searchTerm === undefined) return null;
      const operator = f.textOperator === 'MATCHES' ? 'matches' : 'includes';
      return or(comparison('task.name', operator, searchTerm), comparison('task.note', operator, searchTerm));
    },
  },

  // --- Date filters (data-driven from DATE_FILTER_DEFS) ---
  ...DATE_FILTER_DEFS.map(
    (def): FilterDef => ({
      fields: [def.field],
      build: (f) => {
        const filterAsRecord = f as Record<string, unknown>;
        if (def.skipWhen && filterAsRecord[def.skipWhen]) return null;
        const dateConditions = buildDateConditions(
          def.field,
          filterAsRecord[def.after] as string | undefined,
          filterAsRecord[def.before] as string | undefined,
          filterAsRecord[def.operator] as DateOperator | undefined,
        );
        if (dateConditions.length === 0) return null;
        return and(exists(def.field, true), ...dateConditions);
      },
    }),
  ),

  // --- Project filter ---
  // Support both filter.projectId (from advanced filters) and filter.project (from simple project param)
  {
    fields: ['task.containingProject'],
    build: (f) => {
      const projectFilter = f.projectId ?? f.project;
      if (projectFilter === undefined || projectFilter === null) return null;
      return comparison('task.containingProject', '==', projectFilter);
    },
  },
];

/**
 * All AST field names referenced by the registry.
 * Use in tests to assert parity with KNOWN_FIELDS in types.ts.
 */
export const REGISTRY_KNOWN_FIELDS: readonly string[] = Array.from(new Set(FILTER_DEFS.flatMap((def) => def.fields)));

// =============================================================================
// MAIN BUILD FUNCTION
// =============================================================================

/**
 * Build an AST from a TaskFilter
 *
 * @param filter - The TaskFilter or NormalizedTaskFilter to transform
 * @returns FilterNode representing the filter logic
 */
export function buildAST(filter: TaskFilter | NormalizedTaskFilter): FilterNode {
  const conditions: FilterNode[] = [];

  for (const def of FILTER_DEFS) {
    const node = def.build(filter);
    if (node) conditions.push(node);
  }

  // Return appropriate node based on number of conditions
  if (conditions.length === 0) {
    return literal(true);
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return and(...conditions);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildTagsNode(tags: string[], operator: 'AND' | 'OR' | 'NOT_IN'): FilterNode {
  switch (operator) {
    case 'OR':
      return comparison('taskTags', 'some', tags);
    case 'AND':
      return comparison('taskTags', 'every', tags);
    case 'NOT_IN':
      return not(comparison('taskTags', 'some', tags));
    default:
      return comparison('taskTags', 'every', tags);
  }
}

function buildDateConditions(
  field: string,
  after?: string,
  before?: string,
  dateOperator?: DateOperator,
): ComparisonNode[] {
  const conditions: ComparisonNode[] = [];

  if (after !== undefined) {
    // Use the specified operator for "after" comparisons, default to >= (inclusive)
    // For operators like > and >=, use them directly
    // For BETWEEN, use >= for the lower bound
    const afterOp = dateOperator === '>' ? '>' : '>=';
    conditions.push(comparison(field, afterOp, after));
  }

  if (before !== undefined) {
    // Use the specified operator for "before" comparisons, default to <= (inclusive)
    // For operators like < and <=, use them directly
    // For BETWEEN, use <= for the upper bound
    const beforeOp = dateOperator === '<' ? '<' : '<=';
    conditions.push(comparison(field, beforeOp, before));
  }

  return conditions;
}

// =============================================================================
// NODE FACTORY FUNCTIONS
// =============================================================================

function comparison(field: string, operator: ComparisonNode['operator'], value: unknown): ComparisonNode {
  return { type: 'comparison', field, operator, value };
}

function and(...children: FilterNode[]): AndNode {
  return { type: 'and', children };
}

function or(...children: FilterNode[]): OrNode {
  return { type: 'or', children };
}

function exists(field: string, existsValue: boolean): ExistsNode {
  return { type: 'exists', field, exists: existsValue };
}

function not(child: FilterNode): NotNode {
  return { type: 'not', child };
}

function literal(value: boolean): { type: 'literal'; value: boolean } {
  return { type: 'literal', value };
}
