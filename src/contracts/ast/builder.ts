/**
 * AST Builder - Transforms TaskFilter to FilterAST
 *
 * This module converts the internal TaskFilter representation to an AST
 * that can be validated and emitted to different targets (JXA, OmniJS).
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { TaskFilter } from '../filters.js';
import type { FilterNode, ComparisonNode, AndNode, ExistsNode, NotNode } from './types.js';

/**
 * Build an AST from a TaskFilter
 *
 * @param filter - The TaskFilter to transform
 * @returns FilterNode representing the filter logic
 */
export function buildAST(filter: TaskFilter): FilterNode {
  const conditions: FilterNode[] = [];

  // --- ID filter ---
  if (filter.id !== undefined) {
    conditions.push(comparison('task.id.primaryKey', '==', filter.id));
  }

  // --- Completion status ---
  if (filter.completed !== undefined) {
    conditions.push(comparison('task.completed', '==', filter.completed));
  }

  // --- Boolean flags ---
  if (filter.flagged !== undefined) {
    conditions.push(comparison('task.flagged', '==', filter.flagged));
  }

  if (filter.blocked !== undefined) {
    conditions.push(comparison('task.blocked', '==', filter.blocked));
  }

  if (filter.available !== undefined) {
    conditions.push(comparison('task.available', '==', filter.available));
  }

  if (filter.inInbox !== undefined) {
    conditions.push(comparison('task.effectiveInInbox', '==', filter.inInbox));
  }

  // --- Tags ---
  if (filter.tags && filter.tags.length > 0) {
    const tagsNode = buildTagsNode(filter.tags, filter.tagsOperator || 'AND');
    conditions.push(tagsNode);
  }

  // --- Text search ---
  if (filter.text !== undefined) {
    const operator = filter.textOperator === 'MATCHES' ? 'matches' : 'includes';
    conditions.push(comparison('task.name', operator, filter.text));
  }

  // --- Due date filters ---
  const dueDateConditions = buildDateConditions(
    'task.dueDate',
    filter.dueAfter,
    filter.dueBefore
  );
  if (dueDateConditions.length > 0) {
    conditions.push(and(
      exists('task.dueDate', true),
      ...dueDateConditions
    ));
  }

  // --- Defer date filters ---
  const deferDateConditions = buildDateConditions(
    'task.deferDate',
    filter.deferAfter,
    filter.deferBefore
  );
  if (deferDateConditions.length > 0) {
    conditions.push(and(
      exists('task.deferDate', true),
      ...deferDateConditions
    ));
  }

  // --- Project filter ---
  if (filter.projectId !== undefined) {
    conditions.push(comparison('task.containingProject', '==', filter.projectId));
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

function buildTagsNode(
  tags: string[],
  operator: 'AND' | 'OR' | 'NOT_IN'
): FilterNode {
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
  before?: string
): ComparisonNode[] {
  const conditions: ComparisonNode[] = [];

  if (after !== undefined) {
    conditions.push(comparison(field, '>=', after));
  }

  if (before !== undefined) {
    conditions.push(comparison(field, '<=', before));
  }

  return conditions;
}

// =============================================================================
// NODE FACTORY FUNCTIONS
// =============================================================================

function comparison(
  field: string,
  operator: ComparisonNode['operator'],
  value: unknown
): ComparisonNode {
  return { type: 'comparison', field, operator, value };
}

function and(...children: FilterNode[]): AndNode {
  return { type: 'and', children };
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
