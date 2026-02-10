/**
 * AST Builder - Transforms TaskFilter to FilterAST
 *
 * This module converts the internal TaskFilter representation to an AST
 * that can be validated and emitted to different targets (JXA, OmniJS).
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { TaskFilter, DateOperator, NormalizedTaskFilter } from '../filters.js';
import type { FilterNode, ComparisonNode, AndNode, OrNode, ExistsNode, NotNode } from './types.js';

// =============================================================================
// DATE FILTER REGISTRY
// =============================================================================

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
];

/**
 * Build an AST from a TaskFilter
 *
 * @param filter - The TaskFilter or NormalizedTaskFilter to transform
 * @returns FilterNode representing the filter logic
 */
export function buildAST(filter: TaskFilter | NormalizedTaskFilter): FilterNode {
  const conditions: FilterNode[] = [];

  // --- ID filter ---
  if (filter.id !== undefined) {
    conditions.push(comparison('task.id.primaryKey', '==', filter.id));
  }

  // --- Completion status ---
  if (filter.completed !== undefined) {
    conditions.push(comparison('task.completed', '==', filter.completed));
  }

  // --- Today Mode (OR logic: Due Soon OR Flagged) ---
  // Must come BEFORE flagged and due date handlers to consume those properties
  if (filter.todayMode && filter.dueBefore) {
    const dueSoonCondition = and(exists('task.dueDate', true), comparison('task.dueDate', '<', filter.dueBefore));
    const flaggedCondition = comparison('task.flagged', '==', true);
    conditions.push(or(dueSoonCondition, flaggedCondition));
  }

  // --- Tag status filter ---
  if (filter.tagStatusValid !== undefined) {
    conditions.push(comparison('task.tagStatusValid', '==', filter.tagStatusValid));
  }

  // --- Boolean flags ---
  // Skip flagged when todayMode is active (consumed by OR node above)
  if (filter.flagged !== undefined && !filter.todayMode) {
    conditions.push(comparison('task.flagged', '==', filter.flagged));
  }

  if (filter.blocked !== undefined) {
    conditions.push(comparison('task.blocked', '==', filter.blocked));
  }

  if (filter.available !== undefined) {
    conditions.push(comparison('task.available', '==', filter.available));
  }

  if (filter.inInbox !== undefined) {
    // OmniJS property is 'inInbox', not 'effectiveInInbox'
    conditions.push(comparison('task.inInbox', '==', filter.inInbox));
  }

  // --- Status filters ---
  if (filter.dropped !== undefined) {
    // OmniFocus uses taskStatus enum: Task.Status.Available, .Completed, .Dropped
    // We use 'task.dropped' as a synthetic field that emitter converts to status check
    conditions.push(comparison('task.dropped', '==', filter.dropped));
  }

  // --- Repetition rule filter ---
  if (filter.hasRepetitionRule !== undefined) {
    // Filter by whether task has a repetition rule
    conditions.push(exists('task.repetitionRule', filter.hasRepetitionRule));
  }

  // --- Tags ---
  if (filter.tags && filter.tags.length > 0) {
    const tagsNode = buildTagsNode(filter.tags, filter.tagsOperator || 'AND');
    conditions.push(tagsNode);
  }

  // --- Text search ---
  // Support both filter.text and filter.search (legacy alias for compatibility)
  // Per spec (filters.ts:113-115), search checks BOTH name AND note
  const searchTerm = filter.text ?? filter.search;
  if (searchTerm !== undefined) {
    const operator = filter.textOperator === 'MATCHES' ? 'matches' : 'includes';
    // Match if either name OR note contains/matches the search term
    conditions.push(or(comparison('task.name', operator, searchTerm), comparison('task.note', operator, searchTerm)));
  }

  // --- Date filters (data-driven from DATE_FILTER_DEFS) ---
  for (const def of DATE_FILTER_DEFS) {
    const filterAsRecord = filter as Record<string, unknown>;
    if (def.skipWhen && filterAsRecord[def.skipWhen]) continue;
    const dateConditions = buildDateConditions(
      def.field,
      filterAsRecord[def.after] as string | undefined,
      filterAsRecord[def.before] as string | undefined,
      filterAsRecord[def.operator] as DateOperator | undefined,
    );
    if (dateConditions.length > 0) {
      conditions.push(and(exists(def.field, true), ...dateConditions));
    }
  }

  // --- Project filter ---
  // Support both filter.projectId (from advanced filters) and filter.project (from simple project param)
  const projectFilter = filter.projectId ?? filter.project;
  if (projectFilter !== undefined && projectFilter !== null) {
    conditions.push(comparison('task.containingProject', '==', projectFilter));
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
