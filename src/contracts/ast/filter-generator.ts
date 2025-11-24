/**
 * Filter Code Generator - End-to-end AST pipeline
 *
 * This module provides a high-level API for generating filter code from TaskFilter.
 * It combines: buildAST → validateFilterAST → emit
 *
 * Usage:
 * ```typescript
 * const filter: TaskFilter = { completed: false, flagged: true };
 * const code = generateFilterCode(filter, 'omnijs');
 * // Returns: "(task.completed === false && task.flagged === true)"
 * ```
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { TaskFilter } from '../filters.js';
import type { FilterNode } from './types.js';
import { buildAST } from './builder.js';
import { validateFilterAST, type ValidationResult } from './validator.js';
import { emitJXA } from './emitters/jxa.js';
import { emitOmniJS } from './emitters/omnijs.js';

// =============================================================================
// TYPES
// =============================================================================

export type EmitTarget = 'jxa' | 'omnijs';

export interface GenerateFilterCodeResult {
  success: boolean;
  code: string;
  ast: FilterNode;
  validation: ValidationResult;
  target: EmitTarget;
}

export interface GenerateFilterCodeError {
  success: false;
  error: string;
  validation?: ValidationResult;
  ast?: FilterNode;
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Generate filter code from a TaskFilter
 *
 * This is the main entry point for the AST pipeline.
 *
 * @param filter - The TaskFilter to transform
 * @param target - The target language ('jxa' or 'omnijs')
 * @returns Generated code string, or throws if validation fails
 */
export function generateFilterCode(
  filter: TaskFilter,
  target: EmitTarget = 'omnijs',
): string {
  const result = generateFilterCodeSafe(filter, target);

  if (!result.success) {
    throw new Error(`Filter validation failed: ${(result as GenerateFilterCodeError).error}`);
  }

  return result.code;
}

/**
 * Generate filter code with full result details
 *
 * Returns validation errors/warnings instead of throwing.
 *
 * @param filter - The TaskFilter to transform
 * @param target - The target language ('jxa' or 'omnijs')
 * @returns Full result with AST, validation, and generated code
 */
export function generateFilterCodeSafe(
  filter: TaskFilter,
  target: EmitTarget = 'omnijs',
): GenerateFilterCodeResult | GenerateFilterCodeError {
  // Step 1: Build AST
  const ast = buildAST(filter);

  // Step 2: Validate
  const validation = validateFilterAST(ast);

  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.map(e => e.message).join('; '),
      validation,
      ast,
    };
  }

  // Step 3: Emit code
  const code = target === 'jxa' ? emitJXA(ast) : emitOmniJS(ast);

  return {
    success: true,
    code,
    ast,
    validation,
    target,
  };
}

/**
 * Generate a complete filter function for use in OmniJS scripts
 *
 * This generates a function that can be called with a task object.
 *
 * @param filter - The TaskFilter to transform
 * @param target - The target language ('jxa' or 'omnijs')
 * @returns JavaScript function code string
 */
export function generateFilterFunction(
  filter: TaskFilter,
  target: EmitTarget = 'omnijs',
): string {
  const code = generateFilterCode(filter, target);

  // Wrap in a function that receives task and taskTags
  return `function matchesFilter(task, taskTags) {
  taskTags = taskTags || (task.tags ? task.tags.map(t => t.name) : []);
  return ${code};
}`;
}

/**
 * Generate the filter predicate code with helper functions included
 *
 * This generates all the helper code needed for the filter to work
 * in an OmniJS context.
 *
 * @param filter - The TaskFilter to transform
 * @returns Complete filter code block ready to embed in OmniJS script
 */
export function generateFilterBlock(
  filter: TaskFilter,
): string {
  const code = generateFilterCode(filter, 'omnijs');

  return `
// Generated filter predicate
const taskTags = task.tags ? task.tags.map(t => t.name) : [];
const matchesFilter = ${code};
if (!matchesFilter) return;
`;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a filter is empty (will match all tasks)
 */
export function isEmptyFilter(filter: TaskFilter): boolean {
  const ast = buildAST(filter);
  return ast.type === 'literal' && ast.value === true;
}

/**
 * Get a human-readable description of the filter
 */
export function describeFilter(filter: TaskFilter): string {
  const conditions: string[] = [];

  if (filter.completed !== undefined) {
    conditions.push(filter.completed ? 'completed' : 'not completed');
  }
  if (filter.flagged !== undefined) {
    conditions.push(filter.flagged ? 'flagged' : 'not flagged');
  }
  if (filter.blocked !== undefined) {
    conditions.push(filter.blocked ? 'blocked' : 'not blocked');
  }
  if (filter.available !== undefined) {
    conditions.push(filter.available ? 'available' : 'not available');
  }
  if (filter.inInbox !== undefined) {
    conditions.push(filter.inInbox ? 'in inbox' : 'not in inbox');
  }
  if (filter.tags && filter.tags.length > 0) {
    const op = filter.tagsOperator || 'AND';
    conditions.push(`tags ${op} [${filter.tags.join(', ')}]`);
  }
  if (filter.text) {
    const op = filter.textOperator || 'CONTAINS';
    conditions.push(`name ${op} "${filter.text}"`);
  }
  if (filter.dueBefore || filter.dueAfter) {
    if (filter.dueBefore && filter.dueAfter) {
      conditions.push(`due between ${filter.dueAfter} and ${filter.dueBefore}`);
    } else if (filter.dueBefore) {
      conditions.push(`due before ${filter.dueBefore}`);
    } else {
      conditions.push(`due after ${filter.dueAfter}`);
    }
  }
  if (filter.projectId) {
    conditions.push(`in project ${filter.projectId}`);
  }
  if (filter.id) {
    conditions.push(`id = ${filter.id}`);
  }

  if (conditions.length === 0) {
    return 'all tasks';
  }

  return conditions.join(' AND ');
}
