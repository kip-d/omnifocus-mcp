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

import type { TaskFilter, ProjectFilter, ProjectStatus, NormalizedTaskFilter } from '../filters.js';
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
 * Accepts both raw TaskFilter and NormalizedTaskFilter.
 *
 * @param filter - The TaskFilter or NormalizedTaskFilter to transform
 * @param target - The target language ('jxa' or 'omnijs')
 * @returns Generated code string, or throws if validation fails
 */
export function generateFilterCode(filter: TaskFilter | NormalizedTaskFilter, target: EmitTarget = 'omnijs'): string {
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
 * @param filter - The TaskFilter or NormalizedTaskFilter to transform
 * @param target - The target language ('jxa' or 'omnijs')
 * @returns Full result with AST, validation, and generated code
 */
export function generateFilterCodeSafe(
  filter: TaskFilter | NormalizedTaskFilter,
  target: EmitTarget = 'omnijs',
): GenerateFilterCodeResult | GenerateFilterCodeError {
  // Step 1: Build AST
  const ast = buildAST(filter);

  // Step 2: Validate
  const validation = validateFilterAST(ast);

  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.map((e) => e.message).join('; '),
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
 * @param filter - The TaskFilter or NormalizedTaskFilter to transform
 * @param target - The target language ('jxa' or 'omnijs')
 * @returns JavaScript function code string
 */
export function generateFilterFunction(
  filter: TaskFilter | NormalizedTaskFilter,
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
export function generateFilterBlock(filter: TaskFilter): string {
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
// PROJECT FILTER CODE GENERATION
// =============================================================================

/**
 * OmniJS status enum mappings
 */
const PROJECT_STATUS_MAP: Record<ProjectStatus, string> = {
  active: 'Project.Status.Active',
  onHold: 'Project.Status.OnHold',
  done: 'Project.Status.Done',
  dropped: 'Project.Status.Dropped',
};

/**
 * Generate OmniJS filter code for a ProjectFilter
 *
 * Unlike TaskFilter which uses AST → emit pipeline, ProjectFilter uses
 * direct code generation since project filters are simpler.
 *
 * @param filter - The ProjectFilter to transform
 * @returns JavaScript predicate code string for use in OmniJS
 */
export function generateProjectFilterCode(filter: ProjectFilter): string {
  const conditions: string[] = [];

  // Status filter - can match multiple statuses
  if (filter.status && filter.status.length > 0) {
    const statusChecks = filter.status.map((s) => `project.status === ${PROJECT_STATUS_MAP[s]}`);
    conditions.push(`(${statusChecks.join(' || ')})`);
  }

  // Boolean flags
  if (filter.flagged !== undefined) {
    conditions.push(`(project.flagged === ${filter.flagged})`);
  }

  if (filter.needsReview !== undefined) {
    // nextReviewDate is set if review is pending
    // If needsReview is true, we want projects where nextReviewDate exists and is in the past
    if (filter.needsReview) {
      conditions.push('(project.nextReviewDate && project.nextReviewDate <= new Date())');
    } else {
      conditions.push('(!project.nextReviewDate || project.nextReviewDate > new Date())');
    }
  }

  // Text search (case-insensitive on name and note)
  if (filter.text) {
    const escaped = JSON.stringify(filter.text.toLowerCase());
    conditions.push(
      `((project.name || '').toLowerCase().includes(${escaped}) || ` +
        `(project.note || '').toLowerCase().includes(${escaped}))`,
    );
  }

  // Folder filter by ID
  if (filter.folderId) {
    const escapedId = JSON.stringify(filter.folderId);
    conditions.push(`(project.parentFolder && project.parentFolder.id.primaryKey === ${escapedId})`);
  }

  // Folder filter by name (case-insensitive)
  if (filter.folderName) {
    const escapedName = JSON.stringify(filter.folderName.toLowerCase());
    conditions.push(
      `(project.parentFolder && (project.parentFolder.name || '').toLowerCase().includes(${escapedName}))`,
    );
  }

  // Return 'true' if no conditions (match all projects)
  return conditions.length > 0 ? conditions.join(' && ') : 'true';
}

/**
 * Check if a project filter is empty (will match all projects)
 */
export function isEmptyProjectFilter(filter: ProjectFilter): boolean {
  return (
    (!filter.status || filter.status.length === 0) &&
    filter.flagged === undefined &&
    filter.needsReview === undefined &&
    !filter.text &&
    !filter.folderId &&
    !filter.folderName
  );
}

/**
 * Get a human-readable description of the project filter
 */
export function describeProjectFilter(filter: ProjectFilter): string {
  const conditions: string[] = [];

  if (filter.status && filter.status.length > 0) {
    conditions.push(`status in [${filter.status.join(', ')}]`);
  }
  if (filter.flagged !== undefined) {
    conditions.push(filter.flagged ? 'flagged' : 'not flagged');
  }
  if (filter.needsReview !== undefined) {
    conditions.push(filter.needsReview ? 'needs review' : 'does not need review');
  }
  if (filter.text) {
    conditions.push(`text contains "${filter.text}"`);
  }
  if (filter.folderId) {
    conditions.push(`folder ID = ${filter.folderId}`);
  }
  if (filter.folderName) {
    conditions.push(`folder name contains "${filter.folderName}"`);
  }

  if (conditions.length === 0) {
    return 'all projects';
  }

  return conditions.join(' AND ');
}
