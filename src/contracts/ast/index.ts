/**
 * AST-Based Filter Contracts
 *
 * This module provides:
 * - buildAST: Transform TaskFilter to FilterAST
 * - validateFilterAST: Validate AST for correctness
 * - emitJXA: Generate JXA JavaScript code
 * - emitOmniJS: Generate OmniJS JavaScript code
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

// Types
export type {
  FilterNode,
  AndNode,
  OrNode,
  NotNode,
  ComparisonNode,
  ExistsNode,
  LiteralNode,
  ComparisonOperator,
  KnownField,
} from './types.js';

export {
  KNOWN_FIELDS,
  isAndNode,
  isOrNode,
  isNotNode,
  isComparisonNode,
  isExistsNode,
  isLiteralNode,
  // Factory functions
  and,
  or,
  not,
  compare,
  exists,
  literal,
} from './types.js';

// Builder
export { buildAST } from './builder.js';

// Validator
export type { ValidationResult, ValidationError, ValidationWarning } from './validator.js';
export { validateFilterAST } from './validator.js';

// Emitters
export { emitJXA } from './emitters/jxa.js';
export { emitOmniJS } from './emitters/omnijs.js';

// Filter Code Generator (high-level API)
export type { EmitTarget, GenerateFilterCodeResult, GenerateFilterCodeError } from './filter-generator.js';
export {
  generateFilterCode,
  generateFilterCodeSafe,
  generateFilterFunction,
  generateFilterBlock,
  isEmptyFilter,
  describeFilter,
  // Project filter functions (Phase 3)
  generateProjectFilterCode,
  describeProjectFilter,
  isEmptyProjectFilter,
} from './filter-generator.js';

// Script Builder (generates complete OmniJS scripts with AST filters)
export type { ScriptOptions, GeneratedScript, ProjectScriptOptions } from './script-builder.js';
export {
  buildFilteredTasksScript,
  buildInboxScript,
  buildTaskByIdScript,
  // Project script builders (Phase 3)
  buildFilteredProjectsScript,
  buildProjectByIdScript,
} from './script-builder.js';

// Tag Script Builder (Phase 3 - mode-based, not filter-based)
export {
  buildTagsScript,
  buildTagByIdScript,
  buildTagByNameScript,
} from './tag-script-builder.js';

// Mutation Script Builder (generates complete JXA scripts for mutations)
export type {
  GeneratedMutationScript,
  BatchOptions,
  BatchOperation,
} from './mutation-script-builder.js';
export {
  buildCreateTaskScript,
  buildCreateProjectScript,
  buildUpdateTaskScript,
  buildUpdateProjectScript,
  buildCompleteScript,
  buildDeleteScript,
  buildBatchScript,
  buildBulkDeleteScript,
} from './mutation-script-builder.js';
