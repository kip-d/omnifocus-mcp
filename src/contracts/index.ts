/**
 * SHARED CONTRACTS
 *
 * Single source of truth for:
 * - Filter property names and types
 * - Response structures
 * - OmniJS code generation
 *
 * See DESIGN.md for architecture overview.
 */

// Filter contracts
export {
  type TaskFilter,
  type TagOperator,
  type TextOperator,
  type DateOperator,
  type CompletionFilter,
  type AppliedFilters,
  createFilter,
  validateFilterProperties,
  normalizeFilter,
  FILTER_PROPERTY_NAMES,
} from './filters.js';

// Response contracts
export {
  type ScriptOutput,
  type TaskListScriptOutput,
  type ProjectListScriptOutput,
  type TaskOperationScriptOutput,
  type TaskData,
  type ProjectData,
  type RepetitionRuleData,
  type MCPToolResponse,
  isScriptError,
  isTaskListOutput,
  isProjectListOutput,
  buildSuccessResponse,
  buildErrorResponse,
  unwrapScriptOutput,
} from './responses.js';

// Generator
export {
  generateTagFilterFunction,
  generateTextFilterFunction,
  generateDateFilterFunction,
  generateCompletionFilterLogic,
  generateFilterBlock,
  generateTaskIterationScript,
  type FilterGeneratorOptions,
} from './generator.js';
