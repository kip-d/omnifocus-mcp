/**
 * JXA Integration Types Index
 *
 * This module provides a centralized export point for all JXA integration types,
 * making it easy to import the comprehensive type system for OmniFocus MCP.
 */

// Core JXA integration types
export * from './jxa-integration-types.js';

// Helper function types
export * from './jxa-helper-types.js';

// Script result types
export * from './jxa-script-result-types.js';

// Legacy types (for backward compatibility)
export * from './script-result-types.js';
export * from './jxa-types.js';
export * from './types.js';

// Re-export commonly used types for convenience
export type {
  // Core JXA types
  JXAExecutionContext,
  JXAScriptParams,
  JXAScriptExecutionResult,
  JXAExecutionError,
  JXAErrorType,

  // OmniFocus object types
  OmniFocusApplication,
  OmniFocusDocument,
  OmniFocusDatabase,
  OmniFocusTask,
  OmniFocusProject,
  OmniFocusTag,
  OmniFocusFolder,

  // Collection types
  OmniFocusTaskArray,
  OmniFocusProjectArray,
  OmniFocusTagArray,
  OmniFocusFolderArray,

  // Helper types
  SafeGetter,
  SafeSetter,
  MinimalHelpers,
  BasicHelpers,
  TagHelpers,
  RecurrenceHelpers,
  AnalyticsHelpers,
  SerializationHelpers,
  AllHelpers,

  // Script result types
  JXAScriptResult,
  JXAScriptSuccess,
  JXAScriptError,
  JXAScriptMetadata,

  // Data structure types
  OmniFocusTaskData,
  OmniFocusProjectData,
  OmniFocusTagData,
  OmniFocusFolderData,

  // Performance types
  JXAPerformanceMetrics,
  JXAScriptLimits,
  JXAHelperCategory,
  JXAHelperConfig,

  // Bridge types
  JXABridgeOperation,
  JXABridgeContext,
  JXABridgeResult,

  // Validation types
  HelperValidationResult,
  ScriptValidationResult,
  HelperError,

  // Error-specific types
  ScriptSizeLimitError,
  SyntaxErrorResult,
  TypeConversionErrorResult,
  ContextErrorResult,
} from './jxa-integration-types.js';

export type {
  // Helper function types
  HelperConfiguration,
  HelperRegistry,
  BridgeHelpers,
  BridgeOperationResult,
  ScriptBuilderConfig,
  ScriptTemplateParams,
  ScriptExecutionContext,
  HelperPerformanceMetrics,
  ScriptPerformanceAnalysis,
} from './jxa-helper-types.js';

export type {
  // Script result types
  TaskScriptResult,
  TaskListScriptResult,
  TaskCreateScriptResult,
  TaskUpdateScriptResult,
  TaskDeleteScriptResult,
  ProjectScriptResult,
  ProjectListScriptResult,
  ProjectCreateScriptResult,
  ProjectUpdateScriptResult,
  ProjectDeleteScriptResult,
  TagScriptResult,
  TagListScriptResult,
  TagCreateScriptResult,
  TagUpdateScriptResult,
  TagDeleteScriptResult,
  FolderScriptResult,
  FolderListScriptResult,
  AnalyticsScriptResult,
  OverdueAnalysisScriptResult,
  ProductivityStatsScriptResult,
  ExportScriptResult,
  BulkExportScriptResult,
  RecurringTaskAnalysisScriptResult,
  RecurringPatternsScriptResult,
} from './jxa-script-result-types.js';

// Re-export type guards and utility functions
export {
  // JXA integration type guards
  isJXAExecutionResult,
  isJXAExecutionError,
  isOmniFocusTask,
  isOmniFocusProject,
  isOmniFocusTag,

  // Helper type guards
  isHelperFunction,
  isHelperConfiguration,
  isScriptValidationResult,
  isHelperError,

  // Script result type guards
  isJXAScriptSuccess,
  isJXAScriptError,
  isScriptSizeLimitError,
  isSyntaxError,
  isTypeConversionError,
  isContextError,

  // Helper functions
  createJXAScriptSuccess,
  createJXAScriptError,
  unwrapJXAScriptResult,

  // Constants
  HELPER_SIZES,
  SCRIPT_LIMITS,
} from './jxa-integration-types.js';

export {
  // Helper constants and utilities
  HELPER_SIZES,
  SCRIPT_LIMITS,
} from './jxa-helper-types.js';

export {
  // Script result schemas
  JXAScriptMetadataSchema,
  OmniFocusTaskDataSchema,
  OmniFocusProjectDataSchema,
  OmniFocusTagDataSchema,
} from './jxa-script-result-types.js';

// Legacy exports for backward compatibility
export {
  ScriptResult,
  ScriptSuccess,
  ScriptError,
  isScriptSuccess,
  isScriptError,
  ScriptResultSchema,
  ProjectResultSchema,
  TaskResultSchema,
  OperationResultSchema,
  ProjectUpdateResultSchema,
  TaskUpdateResultSchema,
  ListResultSchema,
  FolderResultSchema,
  FolderOperationResultSchema,
  AnalyticsResultSchema,
  SimpleOperationResultSchema,
  createScriptSuccess,
  createScriptError,
  unwrapScriptResult,
} from './script-result-types.js';
