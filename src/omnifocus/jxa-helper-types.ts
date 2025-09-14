/**
 * JXA Helper Function Types for OmniFocus MCP
 *
 * This module provides type-safe definitions for all helper functions used in JXA scripts,
 * addressing the script size limits and performance issues documented in LESSONS_LEARNED.md.
 */

import type {
  OmniFocusTask,
  OmniFocusProject,
  OmniFocusTag,
  OmniFocusTaskArray,
  OmniFocusTagArray,
  JXAHelperCategory,
} from './jxa-integration-types.js';

// ============================================================================
// Safe Accessor Function Types
// ============================================================================

/**
 * Safe getter function type - handles JXA property access safely
 */
export type SafeGetter<T> = () => T | null | undefined;

/**
 * Safe setter function type - handles JXA property setting safely
 */
export type SafeSetter<T> = (value: T) => void;

/**
 * Safe accessor result type
 */
export type SafeAccessorResult<T> = {
  readonly success: boolean;
  readonly value?: T;
  readonly error?: string;
  readonly defaultValue?: T;
};

// ============================================================================
// Helper Function Categories and Configurations
// ============================================================================

/**
 * Minimal helper functions - essential utilities only (~5KB)
 * Used for simple operations that don't need complex functionality
 */
export interface MinimalHelpers {
  readonly safeGet: <T>(getter: SafeGetter<T>, defaultValue?: T) => T;
  readonly safeGetDate: (getter: SafeGetter<Date>) => string | null;
  readonly safeIsCompleted: (obj: OmniFocusTask | OmniFocusProject) => boolean;
  readonly safeIsFlagged: (obj: OmniFocusTask | OmniFocusProject) => boolean;
  readonly formatError: (error: unknown, context?: string) => string;
  readonly isValidDate: (date: unknown) => boolean;
}

/**
 * Basic helper functions - common operations (~15KB)
 * Used for most standard operations
 */
export interface BasicHelpers extends MinimalHelpers {
  readonly safeGetProject: (task: OmniFocusTask) => { name: string; id: string } | null;
  readonly safeGetTags: (task: OmniFocusTask) => string[];
  readonly safeGetEstimatedMinutes: (task: OmniFocusTask) => number | null;
  readonly safeGetFolder: (project: OmniFocusProject) => string | null;
  readonly safeGetTaskCount: (project: OmniFocusProject) => number;
  readonly isTaskAvailable: (task: OmniFocusTask) => boolean;
  readonly isTaskEffectivelyCompleted: (task: OmniFocusTask) => boolean;
  readonly getTaskStatus: (task: OmniFocusTask) => string;
  readonly getProjectStatus: (project: OmniFocusProject) => string;
}

/**
 * Tag operation helper functions (~8KB)
 * Used specifically for tag-related operations
 */
export interface TagHelpers {
  readonly safeGetTagNames: (tags: OmniFocusTagArray) => string[];
  readonly safeGetTagHierarchy: (tag: OmniFocusTag) => string[];
  readonly safeGetTagTaskCount: (tag: OmniFocusTag) => number;
  readonly safeGetTagAvailableTaskCount: (tag: OmniFocusTag) => number;
  readonly safeGetTagRemainingTaskCount: (tag: OmniFocusTag) => number;
  readonly isTagActive: (tag: OmniFocusTag) => boolean;
  readonly getTagStatus: (tag: OmniFocusTag) => string;
}

/**
 * Recurrence helper functions (~35KB)
 * Used for recurring task operations and analysis
 */
export interface RecurrenceHelpers {
  readonly extractRepeatRuleInfo: (task: OmniFocusTask) => {
    readonly isRecurring: boolean;
    readonly type: string;
    readonly frequency?: string;
    readonly confidence?: number;
    readonly source?: string;
  };
  readonly prepareRepetitionRuleData: (ruleData: unknown) => unknown;
  readonly applyRepetitionRuleViaBridge: (taskId: string, ruleData: unknown) => boolean;
  readonly analyzeRecurringPattern: (task: OmniFocusTask) => {
    readonly pattern: string;
    readonly confidence: number;
    readonly nextExpectedDate?: string;
  };
}

/**
 * Analytics helper functions (~20KB)
 * Used for productivity analysis and insights
 */
export interface AnalyticsHelpers {
  readonly calculateProductivityStats: (tasks: OmniFocusTaskArray) => {
    readonly totalTasks: number;
    readonly completedTasks: number;
    readonly overdueTasks: number;
    readonly flaggedTasks: number;
    readonly completionRate: number;
  };
  readonly analyzeOverduePatterns: (tasks: OmniFocusTaskArray) => {
    readonly patterns: Array<{
      readonly type: string;
      readonly value: string;
      readonly count: number;
      readonly percentage: number;
    }>;
    readonly insights: string[];
  };
  readonly calculateTaskVelocity: (tasks: OmniFocusTaskArray) => {
    readonly averageTimeToComplete: number;
    readonly completionRate: number;
    readonly velocity: number;
  };
}

/**
 * Serialization helper functions (~15KB)
 * Used for export and data serialization operations
 */
export interface SerializationHelpers {
  readonly serializeTask: (task: OmniFocusTask) => {
    readonly id: string;
    readonly name: string;
    readonly completed: boolean;
    readonly flagged: boolean;
    readonly dueDate?: string;
    readonly deferDate?: string;
    readonly completionDate?: string;
    readonly note?: string;
    readonly projectId?: string;
    readonly tags: string[];
  };
  readonly serializeProject: (project: OmniFocusProject) => {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly note?: string;
    readonly folderId?: string;
    readonly taskCount: number;
    readonly availableTaskCount: number;
  };
  readonly serializeTag: (tag: OmniFocusTag) => {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly note?: string;
    readonly taskCount: number;
    readonly availableTaskCount: number;
  };
}

/**
 * Complete helper suite (~75KB) - AVOID unless absolutely necessary
 * Includes all helper functions - can cause script size limit issues
 */
export interface AllHelpers extends
  MinimalHelpers,
  BasicHelpers,
  TagHelpers,
  RecurrenceHelpers,
  AnalyticsHelpers,
  SerializationHelpers {
  // Additional comprehensive helpers
  readonly safeGetAllTaskProperties: (task: OmniFocusTask) => Record<string, unknown>;
  readonly safeGetAllProjectProperties: (project: OmniFocusProject) => Record<string, unknown>;
  readonly safeGetAllTagProperties: (tag: OmniFocusTag) => Record<string, unknown>;
  readonly validateTaskData: (data: unknown) => boolean;
  readonly validateProjectData: (data: unknown) => boolean;
  readonly validateTagData: (data: unknown) => boolean;
}

// ============================================================================
// Helper Configuration Types
// ============================================================================

/**
 * Helper function configuration for different script types
 */
export interface HelperConfiguration {
  readonly category: JXAHelperCategory;
  readonly size: number;
  readonly functions: string[];
  readonly dependencies: JXAHelperCategory[];
  readonly performanceImpact: 'low' | 'medium' | 'high';
  readonly useCases: string[];
  readonly warnings: string[];
}

/**
 * Helper function registry for managing available helpers
 */
export interface HelperRegistry {
  readonly minimal: HelperConfiguration;
  readonly basic: HelperConfiguration;
  readonly tagOperations: HelperConfiguration;
  readonly recurrence: HelperConfiguration;
  readonly analytics: HelperConfiguration;
  readonly serialization: HelperConfiguration;
  readonly all: HelperConfiguration;
}

// ============================================================================
// Bridge Helper Types
// ============================================================================

/**
 * Bridge helper functions for context switching operations
 */
export interface BridgeHelpers {
  readonly setTagsViaBridge: (taskId: string, tags: string[], app: unknown) => boolean;
  readonly setRepeatRuleViaBridge: (taskId: string, ruleData: unknown, app: unknown) => boolean;
  readonly moveProjectViaBridge: (projectId: string, folderId: string, app: unknown) => boolean;
  readonly updateTaskViaBridge: (taskId: string, updates: Record<string, unknown>, app: unknown) => boolean;
  readonly updateProjectViaBridge: (projectId: string, updates: Record<string, unknown>, app: unknown) => boolean;
}

/**
 * Bridge operation result type
 */
export interface BridgeOperationResult {
  readonly success: boolean;
  readonly message?: string;
  readonly error?: string;
  readonly context?: string;
  readonly executionTimeMs?: number;
}

// ============================================================================
// Script Builder Types
// ============================================================================

/**
 * Script builder configuration
 */
export interface ScriptBuilderConfig {
  readonly helpers: JXAHelperCategory;
  readonly includeBridgeHelpers: boolean;
  readonly enableDebugLogging: boolean;
  readonly maxScriptSize: number;
  readonly timeout: number;
}

/**
 * Script template parameters
 */
export interface ScriptTemplateParams {
  readonly helpers: string;
  readonly mainScript: string;
  readonly bridgeHelpers?: string;
  readonly validationHelpers?: string;
  readonly debugHelpers?: string;
}

/**
 * Script execution context
 */
export interface ScriptExecutionContext {
  readonly config: ScriptBuilderConfig;
  readonly params: ScriptTemplateParams;
  readonly size: number;
  readonly warnings: string[];
  readonly isValid: boolean;
}

// ============================================================================
// Validation and Error Handling Types
// ============================================================================

/**
 * Helper function validation result
 */
export interface HelperValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly size: number;
  readonly performanceImpact: 'low' | 'medium' | 'high';
}

/**
 * Script validation result
 */
export interface ScriptValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly size: number;
  readonly helpers: JXAHelperCategory[];
  readonly estimatedExecutionTime: number;
  readonly memoryUsage: number;
}

/**
 * Helper function error types
 */
export type HelperErrorType =
  | 'function_not_found'        // Helper function not available
  | 'parameter_mismatch'         // Wrong parameters passed to helper
  | 'context_error'             // Wrong context for helper usage
  | 'performance_warning'       // Helper causes performance issues
  | 'size_limit_exceeded'       // Helper makes script too large
  | 'dependency_missing'        // Required dependency not available
  | 'validation_failed';         // Helper validation failed

/**
 * Helper function error
 */
export interface HelperError {
  readonly type: HelperErrorType;
  readonly message: string;
  readonly context?: string;
  readonly function?: string;
  readonly parameters?: unknown[];
  readonly suggestions?: string[];
}

// ============================================================================
// Performance Monitoring Types
// ============================================================================

/**
 * Helper function performance metrics
 */
export interface HelperPerformanceMetrics {
  readonly functionName: string;
  readonly category: JXAHelperCategory;
  readonly executionTimeMs: number;
  readonly memoryUsageBytes: number;
  readonly errorCount: number;
  readonly successCount: number;
  readonly averageExecutionTime: number;
  readonly timestamp: number;
}

/**
 * Script performance analysis
 */
export interface ScriptPerformanceAnalysis {
  readonly totalSize: number;
  readonly helperSize: number;
  readonly coreScriptSize: number;
  readonly estimatedExecutionTime: number;
  readonly memoryFootprint: number;
  readonly performanceScore: number; // 0-100
  readonly recommendations: string[];
  readonly warnings: string[];
}

// ============================================================================
// Type Guards and Utility Functions
// ============================================================================

/**
 * Type guard to check if a value is a valid helper function
 */
export function isHelperFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Type guard to check if a value is a valid helper configuration
 */
export function isHelperConfiguration(value: unknown): value is HelperConfiguration {
  return (
    typeof value === 'object' &&
    value !== null &&
    'category' in value &&
    'size' in value &&
    'functions' in value &&
    'dependencies' in value &&
    'performanceImpact' in value
  );
}

/**
 * Type guard to check if a value is a valid script validation result
 */
export function isScriptValidationResult(value: unknown): value is ScriptValidationResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isValid' in value &&
    'errors' in value &&
    'warnings' in value &&
    'size' in value &&
    'helpers' in value
  );
}

/**
 * Type guard to check if a value is a valid helper error
 */
export function isHelperError(value: unknown): value is HelperError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'message' in value &&
    typeof (value as Record<string, unknown>).type === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

// ============================================================================
// Helper Function Size Constants
// ============================================================================

/**
 * Helper function size constants (in characters)
 * Based on empirical testing documented in LESSONS_LEARNED.md
 */
export const HELPER_SIZES = {
  MINIMAL: 5000,           // ~5KB - Essential utilities only
  BASIC: 15000,            // ~15KB - Common operations
  TAG_OPERATIONS: 8000,    // ~8KB - Tag-specific helpers
  RECURRENCE: 35000,       // ~35KB - Recurring task helpers
  ANALYTICS: 20000,        // ~20KB - Analytics helpers
  SERIALIZATION: 15000,    // ~15KB - Export/serialization helpers
  ALL: 75000,              // ~75KB - Complete helper suite (AVOID!)
} as const;

/**
 * Script size limits and thresholds
 */
export const SCRIPT_LIMITS = {
  MAX_SIZE: 300000,        // 300KB - Maximum script size
  WARNING_THRESHOLD: 250000, // 250KB - Warning threshold
  CRITICAL_THRESHOLD: 280000, // 280KB - Critical threshold
  JXA_RUNTIME_LIMIT: 50000,   // 50KB - JXA runtime parsing limit
  JXA_TRUNCATION_LIMIT: 20000, // 20KB - Script truncation limit
} as const;

// ============================================================================
// Export all types for use in other modules
// ============================================================================

export type {
  SafeGetter,
  SafeSetter,
  SafeAccessorResult,
  MinimalHelpers,
  BasicHelpers,
  TagHelpers,
  RecurrenceHelpers,
  AnalyticsHelpers,
  SerializationHelpers,
  AllHelpers,
  HelperConfiguration,
  HelperRegistry,
  BridgeHelpers,
  BridgeOperationResult,
  ScriptBuilderConfig,
  ScriptTemplateParams,
  ScriptExecutionContext,
  HelperValidationResult,
  ScriptValidationResult,
  HelperErrorType,
  HelperError,
  HelperPerformanceMetrics,
  ScriptPerformanceAnalysis,
};
