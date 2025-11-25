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

// =============================================================================
// PROJECT FILTER CODE GENERATION (Phase 3 AST Extension)
// =============================================================================

import type { ProjectFilter } from '../filters.js';

/**
 * Generate OmniJS filter predicate for projects
 *
 * Projects have simpler filtering than tasks, so we use direct code generation
 * rather than the full AST pipeline.
 *
 * @param filter - The ProjectFilter to transform
 * @returns OmniJS predicate code string
 */
export function generateProjectFilterCode(filter: ProjectFilter): string {
  const conditions: string[] = [];

  // ID filter (exact match)
  if (filter.id) {
    conditions.push(`(project.id.primaryKey === ${JSON.stringify(filter.id)})`);
  }

  // Status filter (array of allowed statuses - OR logic)
  if (filter.status && filter.status.length > 0) {
    const statusMap: Record<string, string> = {
      'active': 'Project.Status.Active',
      'onHold': 'Project.Status.OnHold',
      'done': 'Project.Status.Done',
      'dropped': 'Project.Status.Dropped',
    };
    const statusChecks = filter.status.map(s => `project.status === ${statusMap[s]}`);
    conditions.push(`(${statusChecks.join(' || ')})`);
  }

  // Flagged filter
  if (filter.flagged !== undefined) {
    conditions.push(`((project.flagged || false) === ${filter.flagged})`);
  }

  // Needs review filter
  if (filter.needsReview !== undefined) {
    if (filter.needsReview) {
      conditions.push('(project.nextReviewDate && project.nextReviewDate <= new Date())');
    } else {
      conditions.push('(!project.nextReviewDate || project.nextReviewDate > new Date())');
    }
  }

  // Text search (name + note)
  if (filter.text) {
    const escaped = JSON.stringify(filter.text.toLowerCase());
    conditions.push(
      `((project.name || '').toLowerCase().includes(${escaped}) || ` +
      `(project.note || '').toLowerCase().includes(${escaped}))`,
    );
  }

  // Folder ID filter
  if (filter.folderId) {
    conditions.push(
      `(project.folder && project.folder.id.primaryKey === ${JSON.stringify(filter.folderId)})`,
    );
  }

  // Folder name filter
  if (filter.folderName) {
    conditions.push(
      `(project.folder && project.folder.name === ${JSON.stringify(filter.folderName)})`,
    );
  }

  // If no conditions, match all projects
  if (conditions.length === 0) {
    return 'true';
  }

  return conditions.join(' && ');
}

/**
 * Get a human-readable description of the project filter
 */
export function describeProjectFilter(filter: ProjectFilter): string {
  const conditions: string[] = [];

  if (filter.id) {
    conditions.push(`id = ${filter.id}`);
  }
  if (filter.status && filter.status.length > 0) {
    conditions.push(`status in [${filter.status.join(', ')}]`);
  }
  if (filter.flagged !== undefined) {
    conditions.push(filter.flagged ? 'flagged' : 'not flagged');
  }
  if (filter.needsReview !== undefined) {
    conditions.push(filter.needsReview ? 'needs review' : 'no review needed');
  }
  if (filter.text) {
    conditions.push(`text contains "${filter.text}"`);
  }
  if (filter.folderId) {
    conditions.push(`folder id = ${filter.folderId}`);
  }
  if (filter.folderName) {
    conditions.push(`folder = "${filter.folderName}"`);
  }

  if (conditions.length === 0) {
    return 'all projects';
  }

  return conditions.join(' AND ');
}

/**
 * Check if a project filter is empty (will match all projects)
 */
export function isEmptyProjectFilter(filter: ProjectFilter): boolean {
  return !filter.id &&
    (!filter.status || filter.status.length === 0) &&
    filter.flagged === undefined &&
    filter.needsReview === undefined &&
    !filter.text &&
    !filter.folderId &&
    !filter.folderName;
}
