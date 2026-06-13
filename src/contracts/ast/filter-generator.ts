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

import type {
  TaskFilter,
  ProjectFilter,
  ProjectStatus,
  NormalizedTaskFilter,
  TextOperator,
  FolderFilter,
} from '../filters.js';
import type { FilterNode } from './types.js';
import { buildAST } from './builder.js';
import { validateFilterAST, type ValidationResult } from './validator.js';
import { emitOmniJS, type EmitResult } from './emitters/omnijs.js';

// =============================================================================
// TYPES
// =============================================================================

export interface GenerateFilterCodeResult {
  success: boolean;
  code: EmitResult;
  ast: FilterNode;
  validation: ValidationResult;
}

export interface GenerateFilterCodeError {
  success: false;
  error: string;
  validation?: ValidationResult;
  ast?: FilterNode;
}

// =============================================================================
// PIPELINE
// =============================================================================

/**
 * Fluent pipeline for AST filter code generation.
 *
 * Encapsulates the build -> validate -> emit steps with pluggable emitter target.
 *
 * Usage:
 * ```typescript
 * const code = FilterPipeline.from(filter).build().validate().emit('omnijs');
 * ```
 */
export class FilterPipeline {
  private readonly filter: TaskFilter | NormalizedTaskFilter;
  private _ast?: FilterNode;
  private _validation?: ValidationResult;

  private constructor(filter: TaskFilter | NormalizedTaskFilter) {
    this.filter = filter;
  }

  static from(filter: TaskFilter | NormalizedTaskFilter): FilterPipeline {
    return new FilterPipeline(filter);
  }

  build(): FilterPipeline {
    this._ast = buildAST(this.filter);
    return this;
  }

  validate(): FilterPipeline {
    if (!this._ast) this.build();
    this._validation = validateFilterAST(this._ast!);
    return this;
  }

  emit(): EmitResult {
    if (!this._ast) this.build();
    if (!this._validation) this.validate();

    if (!this._validation!.valid) {
      throw new Error(`Filter validation failed: ${this._validation!.errors.map((e) => e.message).join('; ')}`);
    }

    return emitOmniJS(this._ast!);
  }

  get ast(): FilterNode {
    if (!this._ast) this.build();
    return this._ast!;
  }

  get validation(): ValidationResult {
    if (!this._validation) this.validate();
    return this._validation!;
  }
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
 * @returns EmitResult with preamble and predicate, or throws if validation fails
 */
export function generateFilterCode(filter: TaskFilter | NormalizedTaskFilter): EmitResult {
  return FilterPipeline.from(filter).emit();
}

/**
 * Generate filter code with full result details
 *
 * Returns validation errors/warnings instead of throwing.
 *
 * @param filter - The TaskFilter or NormalizedTaskFilter to transform
 * @returns Full result with AST, validation, and generated code
 */
export function generateFilterCodeSafe(
  filter: TaskFilter | NormalizedTaskFilter,
): GenerateFilterCodeResult | GenerateFilterCodeError {
  const pipeline = FilterPipeline.from(filter).build().validate();
  const { ast, validation } = pipeline;

  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.map((e) => e.message).join('; '),
      validation,
      ast,
    };
  }

  const code = pipeline.emit();

  return {
    success: true,
    code,
    ast,
    validation,
  };
}

/**
 * Generate a complete filter function for use in OmniJS scripts
 *
 * This generates a function that can be called with a task object.
 *
 * @param filter - The TaskFilter or NormalizedTaskFilter to transform
 * @returns JavaScript function code string
 */
export function generateFilterFunction(filter: TaskFilter | NormalizedTaskFilter): string {
  const { preamble, predicate } = generateFilterCode(filter);

  return `${preamble ? preamble + '\n' : ''}function matchesFilter(task, taskTags) {
  taskTags = taskTags || (task.tags ? task.tags.map(t => t.name) : []);
  return ${predicate};
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
  const { preamble, predicate } = generateFilterCode(filter);

  return `
${preamble ? preamble + '\n' : ''}// Generated filter predicate
const taskTags = task.tags ? task.tags.map(t => t.name) : [];
const matchesFilter = ${predicate};
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
function describeBooleanFlags(filter: TaskFilter): string[] {
  const BOOLEAN_FLAGS: Array<{ key: keyof TaskFilter; label: string }> = [
    { key: 'completed', label: 'completed' },
    { key: 'flagged', label: 'flagged' },
    { key: 'blocked', label: 'blocked' },
    { key: 'available', label: 'available' },
    { key: 'inInbox', label: 'in inbox' },
  ];
  return BOOLEAN_FLAGS.filter(({ key }) => filter[key] !== undefined).map(({ key, label }) =>
    filter[key] ? label : `not ${label}`,
  );
}

function describeDateRange(filter: TaskFilter): string | null {
  if (!filter.dueBefore && !filter.dueAfter) return null;
  if (filter.dueBefore && filter.dueAfter) return `due between ${filter.dueAfter} and ${filter.dueBefore}`;
  return filter.dueBefore ? `due before ${filter.dueBefore}` : `due after ${filter.dueAfter}`;
}

export function describeFilter(filter: TaskFilter): string {
  const conditions: string[] = describeBooleanFlags(filter);

  if (filter.tags && filter.tags.length > 0) {
    conditions.push(`tags ${filter.tagsOperator || 'AND'} [${filter.tags.join(', ')}]`);
  }
  if (filter.text) {
    conditions.push(`name ${filter.textOperator || 'CONTAINS'} "${filter.text}"`);
  }
  if (filter.name) {
    // OMN-142: name-only filter (text above also matches notes)
    conditions.push(`name-only ${filter.nameOperator || 'CONTAINS'} "${filter.name}"`);
  }
  const dateDesc = describeDateRange(filter);
  if (dateDesc) conditions.push(dateDesc);
  if (filter.projectId) conditions.push(`in project ${filter.projectId}`);
  if (filter.id) conditions.push(`id = ${filter.id}`);

  return conditions.length === 0 ? 'all tasks' : conditions.join(' AND ');
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
 * Emit one case-insensitive match condition against a project string field.
 * CONTAINS lowercases both sides; MATCHES compiles to a RegExp test. The
 * term is injected via JSON.stringify only — never raw interpolation.
 */
function projectTextCondition(field: 'name' | 'note', term: string, operator?: TextOperator): string {
  const accessor = `(project.${field} || '')`;
  if (operator === 'MATCHES') {
    return `new RegExp(${JSON.stringify(term)}, 'i').test(${accessor})`;
  }
  return `${accessor}.toLowerCase().includes(${JSON.stringify(term.toLowerCase())})`;
}

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
    conditions.push(
      `(${projectTextCondition('name', filter.text, filter.textOperator)} || ` +
        `${projectTextCondition('note', filter.text, filter.textOperator)})`,
    );
  }

  // OMN-142: name search — name ONLY, never the note. `text` above is the
  // full-text (name OR note) filter; aliasing name onto it over-matched
  // notes and fed a destructive sweep.
  if (filter.name) {
    conditions.push(`(${projectTextCondition('name', filter.name, filter.nameOperator)})`);
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

  // OMN-96: top-level projects only — no containing folder.
  if (filter.topLevelOnly) {
    conditions.push('!project.parentFolder');
  }

  // OMN-171 (S3): OR branches — each branch is a flat ProjectFilter compiled
  // recursively (branches never nest, so the recursion is one level deep). The
  // ||-joined group ANDs with the base conditions, mirroring the tasks-side
  // buildAST orBranches node (which emits an or() AST instead of a string).
  if (filter.orBranches && filter.orBranches.length > 0) {
    const branchCodes = filter.orBranches.map((branch) => `(${generateProjectFilterCode(branch)})`);
    conditions.push(branchCodes.length === 1 ? branchCodes[0] : `(${branchCodes.join(' || ')})`);
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
    !filter.name && // OMN-142
    !filter.folderId &&
    !filter.folderName &&
    !filter.topLevelOnly && // OMN-96
    (!filter.orBranches || filter.orBranches.length === 0) // OMN-171
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
    conditions.push(`text ${filter.textOperator === 'MATCHES' ? 'matches' : 'contains'} "${filter.text}"`);
  }
  if (filter.name) {
    // OMN-142
    conditions.push(`name ${filter.nameOperator === 'MATCHES' ? 'matches' : 'contains'} "${filter.name}"`);
  }
  if (filter.folderId) {
    conditions.push(`folder ID = ${filter.folderId}`);
  }
  if (filter.folderName) {
    conditions.push(`folder name contains "${filter.folderName}"`);
  }
  if (filter.topLevelOnly) {
    conditions.push('top-level only (no folder)'); // OMN-96
  }
  if (filter.orBranches && filter.orBranches.length > 0) {
    // OMN-171: describe each branch recursively, joined by OR
    conditions.push(`(${filter.orBranches.map((b) => describeProjectFilter(b)).join(') OR (')})`);
  }

  if (conditions.length === 0) {
    return 'all projects';
  }

  return conditions.join(' AND ');
}

// =============================================================================
// FOLDER FILTER CODE GENERATION (OMN-170 S2)
// =============================================================================

/**
 * Emit one case-insensitive match condition against a folder string field.
 * CONTAINS lowercases both sides; MATCHES compiles to a RegExp test. The term
 * is injected via JSON.stringify only — never raw interpolation (OMN-149-safe,
 * mirror of projectTextCondition).
 */
function folderTextCondition(accessor: string, term: string, operator?: TextOperator): string {
  if (operator === 'MATCHES') {
    return `new RegExp(${JSON.stringify(term)}, 'i').test(${accessor})`;
  }
  return `${accessor}.toLowerCase().includes(${JSON.stringify(term.toLowerCase())})`;
}

/**
 * Generate OmniJS filter code for a FolderFilter (OMN-170 S2). Operates on the
 * OmniJS `folder` object inside buildFilteredFoldersScript. Direct code
 * generation (no AST), mirroring generateProjectFilterCode.
 *
 * @returns a JS predicate string; 'true' for an empty filter (match all).
 */
export function generateFolderFilterCode(filter: FolderFilter): string {
  const conditions: string[] = [];

  // Name search — name ONLY (folders have no note).
  if (filter.name) {
    conditions.push(`(${folderTextCondition("(folder.name || '')", filter.name, filter.nameOperator)})`);
  }

  // Parent folder name (case-insensitive substring), null-guarded.
  if (filter.parentName) {
    const escaped = JSON.stringify(filter.parentName.toLowerCase());
    conditions.push(`(folder.parent && (folder.parent.name || '').toLowerCase().includes(${escaped}))`);
  }

  // Top-level only — no containing parent folder.
  if (filter.topLevelOnly) {
    conditions.push('!folder.parent');
  }

  return conditions.length > 0 ? conditions.join(' && ') : 'true';
}

/**
 * Check if a folder filter is empty (will match all folders).
 */
export function isEmptyFolderFilter(filter: FolderFilter): boolean {
  return !filter.name && !filter.parentName && !filter.topLevelOnly;
}

/**
 * Human-readable description of the folder filter (for GeneratedScript.filterDescription).
 */
export function describeFolderFilter(filter: FolderFilter): string {
  const conditions: string[] = [];
  if (filter.name) {
    conditions.push(`name ${filter.nameOperator === 'MATCHES' ? 'matches' : 'contains'} "${filter.name}"`);
  }
  if (filter.parentName) {
    conditions.push(`parent folder name contains "${filter.parentName}"`);
  }
  if (filter.topLevelOnly) {
    conditions.push('top-level only (no parent)');
  }
  return conditions.length === 0 ? 'all folders' : conditions.join(' AND ');
}
