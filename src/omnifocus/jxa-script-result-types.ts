/**
 * Enhanced JXA Script Result Types for OmniFocus MCP
 *
 * This module provides comprehensive type definitions for JXA script execution results,
 * building on the lessons learned from script size limits, performance issues, and
 * context switching problems documented in LESSONS_LEARNED.md.
 */

import { z } from 'zod';
import type {
  JXAExecutionError,
  JXAPerformanceMetrics,
} from './jxa-integration-types.js';

// ============================================================================
// Base Script Result Types
// ============================================================================

/**
 * Discriminated union for all JXA script execution results
 * Provides type safety while handling the dynamic nature of JXA returns
 */
export type JXAScriptResult<T = unknown> = JXAScriptSuccess<T> | JXAScriptError;

/**
 * Successful JXA script execution result
 */
export interface JXAScriptSuccess<T = unknown> {
  readonly success: true;
  readonly data: T;
  readonly metadata: JXAScriptMetadata;
  readonly performance?: JXAPerformanceMetrics;
}

/**
 * Failed JXA script execution result
 */
export interface JXAScriptError {
  readonly success: false;
  readonly error: JXAExecutionError;
  readonly metadata: JXAScriptMetadata;
  readonly performance?: JXAPerformanceMetrics;
  readonly context?: string;
  readonly suggestions?: string[];
}

/**
 * Metadata for JXA script execution
 */
export interface JXAScriptMetadata {
  readonly executionTimeMs: number;
  readonly scriptSize: number;
  readonly memoryUsageBytes?: number;
  readonly context: string;
  readonly timestamp: number;
  readonly version: string;
  readonly platform: string;
  readonly helperCategory?: string;
  readonly bridgeOperations?: number;
  readonly errorCount: number;
  readonly warningCount: number;
}

// ============================================================================
// Specific Script Result Types
// ============================================================================

/**
 * Task operation script results
 */
export interface TaskScriptResult extends JXAScriptSuccess<{
  readonly task: OmniFocusTaskData;
  readonly changes?: string[];
  readonly warnings?: string[];
}> {}

export interface TaskListScriptResult extends JXAScriptSuccess<{
  readonly tasks: OmniFocusTaskData[];
  readonly summary: {
    readonly total: number;
    readonly completed: number;
    readonly overdue: number;
    readonly flagged: number;
    readonly insights?: string[];
  };
  readonly metadata: {
    readonly queryTimeMs: number;
    readonly filtersApplied: Record<string, unknown>;
    readonly performanceNote?: string;
  };
}> {}

export interface TaskCreateScriptResult extends JXAScriptSuccess<{
  readonly taskId: string;
  readonly task: OmniFocusTaskData;
  readonly tagWarning?: string;
}> {}

export interface TaskUpdateScriptResult extends JXAScriptSuccess<{
  readonly taskId: string;
  readonly changes: string[];
  readonly warnings?: string[];
  readonly task?: OmniFocusTaskData;
}> {}

export interface TaskDeleteScriptResult extends JXAScriptSuccess<{
  readonly taskId: string;
  readonly success: boolean;
  readonly message?: string;
}> {}

/**
 * Project operation script results
 */
export interface ProjectScriptResult extends JXAScriptSuccess<{
  readonly project: OmniFocusProjectData;
  readonly changes?: string[];
  readonly warnings?: string[];
}> {}

export interface ProjectListScriptResult extends JXAScriptSuccess<{
  readonly projects: OmniFocusProjectData[];
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly completed: number;
    readonly onHold: number;
    readonly insights?: string[];
  };
  readonly metadata: {
    readonly queryTimeMs: number;
    readonly cached: boolean;
  };
}> {}

export interface ProjectCreateScriptResult extends JXAScriptSuccess<{
  readonly projectId: string;
  readonly project: OmniFocusProjectData;
}> {}

export interface ProjectUpdateScriptResult extends JXAScriptSuccess<{
  readonly projectId: string;
  readonly changes: string[];
  readonly warnings?: string[];
  readonly project?: OmniFocusProjectData;
}> {}

export interface ProjectDeleteScriptResult extends JXAScriptSuccess<{
  readonly projectId: string;
  readonly success: boolean;
  readonly message?: string;
}> {}

/**
 * Tag operation script results
 */
export interface TagScriptResult extends JXAScriptSuccess<{
  readonly tag: OmniFocusTagData;
  readonly changes?: string[];
  readonly warnings?: string[];
}> {}

export interface TagListScriptResult extends JXAScriptSuccess<{
  readonly tags: OmniFocusTagData[];
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly onHold: number;
    readonly insights?: string[];
  };
  readonly metadata: {
    readonly queryTimeMs: number;
    readonly cached: boolean;
  };
}> {}

export interface TagCreateScriptResult extends JXAScriptSuccess<{
  readonly tagId: string;
  readonly tag: OmniFocusTagData;
}> {}

export interface TagUpdateScriptResult extends JXAScriptSuccess<{
  readonly tagId: string;
  readonly changes: string[];
  readonly warnings?: string[];
  readonly tag?: OmniFocusTagData;
}> {}

export interface TagDeleteScriptResult extends JXAScriptSuccess<{
  readonly tagId: string;
  readonly success: boolean;
  readonly message?: string;
}> {}

/**
 * Folder operation script results
 */
export interface FolderScriptResult extends JXAScriptSuccess<{
  readonly folder: OmniFocusFolderData;
  readonly changes?: string[];
  readonly warnings?: string[];
}> {}

export interface FolderListScriptResult extends JXAScriptSuccess<{
  readonly folders: OmniFocusFolderData[];
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly insights?: string[];
  };
  readonly metadata: {
    readonly queryTimeMs: number;
    readonly cached: boolean;
  };
}> {}

/**
 * Analytics script results
 */
export interface AnalyticsScriptResult extends JXAScriptSuccess<{
  readonly summary: Record<string, unknown>;
  readonly data?: Record<string, unknown>;
  readonly insights: string[];
  readonly trends?: {
    readonly daily: Array<{
      readonly date: string;
      readonly completed: number;
      readonly created: number;
      readonly netProgress: number;
    }>;
    readonly weekly: Array<{
      readonly week: string;
      readonly completed: number;
      readonly created: number;
      readonly avgPerDay: number;
    }>;
  };
  readonly metadata: {
    readonly analysisTimeMs: number;
    readonly dataPoints: number;
    readonly confidence: number;
  };
}> {}

export interface OverdueAnalysisScriptResult extends JXAScriptSuccess<{
  readonly summary: {
    readonly totalOverdue: number;
    readonly overduePercentage: number;
    readonly averageDaysOverdue: number;
    readonly oldestOverdueDate: string;
  };
  readonly overdueTasks: Array<{
    readonly id: string;
    readonly name: string;
    readonly dueDate: string;
    readonly daysOverdue: number;
    readonly project?: string;
    readonly tags: string[];
  }>;
  readonly patterns: Array<{
    readonly type: string;
    readonly value: string;
    readonly count: number;
    readonly percentage: number;
  }>;
  readonly insights: {
    readonly mostOverdueProject?: string;
    readonly mostOverdueTag?: string;
    readonly commonOverduePeriod?: string;
  };
}> {}

export interface ProductivityStatsScriptResult extends JXAScriptSuccess<{
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly overdueTasks: number;
  readonly flaggedTasks: number;
  readonly completionRate: number;
  readonly trends: {
    readonly daily: Array<{
      readonly date: string;
      readonly completed: number;
      readonly created: number;
      readonly netProgress: number;
    }>;
    readonly weekly: Array<{
      readonly week: string;
      readonly completed: number;
      readonly created: number;
      readonly avgPerDay: number;
    }>;
  };
  readonly insights: {
    readonly mostProductiveDay: string;
    readonly mostProductiveDayCount: number;
    readonly leastProductiveDay: string;
    readonly leastProductiveDayCount: number;
    readonly averageCompletionRate: number;
    readonly currentStreak: number;
    readonly longestStreak: number;
  };
}> {}

/**
 * Export script results
 */
export interface ExportScriptResult extends JXAScriptSuccess<{
  readonly format: 'json' | 'csv' | 'taskpaper' | 'markdown';
  readonly data: string | object;
  readonly metadata: {
    readonly exportDate: string;
    readonly itemCount: number;
    readonly format: string;
    readonly size: number;
  };
}> {}

export interface BulkExportScriptResult extends JXAScriptSuccess<{
  readonly exports: Array<{
    readonly type: 'tasks' | 'projects' | 'tags' | 'folders';
    readonly format: string;
    readonly count: number;
    readonly size: number;
    readonly path?: string;
  }>;
  readonly summary: {
    readonly totalItems: number;
    readonly totalSize: number;
    readonly exportTimeMs: number;
  };
}> {}

/**
 * Recurring task analysis script results
 */
export interface RecurringTaskAnalysisScriptResult extends JXAScriptSuccess<{
  readonly patterns: Array<{
    readonly taskId: string;
    readonly taskName: string;
    readonly frequency: string;
    readonly nextDue?: string;
    readonly lastCompleted?: string;
    readonly completionRate: number;
    readonly isConsistent: boolean;
    readonly pattern: {
      readonly type: string;
      readonly confidence: number;
      readonly source: string;
    };
  }>;
  readonly summary: {
    readonly totalRecurring: number;
    readonly consistentPatterns: number;
    readonly inconsistentPatterns: number;
    readonly averageConfidence: number;
  };
}> {}

export interface RecurringPatternsScriptResult extends JXAScriptSuccess<{
  readonly groups: Array<{
    readonly frequency: string;
    readonly tasks: Array<{
      readonly id: string;
      readonly name: string;
      readonly project?: string;
      readonly nextDue?: string;
    }>;
    readonly totalCount: number;
  }>;
  readonly summary: {
    readonly totalPatterns: number;
    readonly uniqueFrequencies: number;
    readonly mostCommonFrequency: string;
  };
}> {}

// ============================================================================
// Data Structure Types
// ============================================================================

/**
 * OmniFocus Task data structure
 */
export interface OmniFocusTaskData {
  readonly id: string;
  readonly name: string;
  readonly completed: boolean;
  readonly flagged: boolean;
  readonly blocked: boolean;
  readonly available?: boolean;
  readonly inInbox: boolean;
  readonly note?: string;
  readonly projectId?: string;
  readonly project?: string;
  readonly dueDate?: string;
  readonly deferDate?: string;
  readonly completionDate?: string;
  readonly estimatedMinutes?: number;
  readonly tags: string[];
  readonly added?: string;
  readonly repetitionRule?: {
    readonly type: string;
    readonly frequency?: string;
    readonly confidence?: number;
    readonly source?: string;
  };
  readonly recurringStatus?: {
    readonly isRecurring: boolean;
    readonly type: string;
    readonly frequency?: string;
    readonly confidence?: number;
    readonly source?: string;
  };
}

/**
 * OmniFocus Project data structure
 */
export interface OmniFocusProjectData {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly flagged: boolean;
  readonly note?: string;
  readonly folderId?: string;
  readonly folder?: string;
  readonly dueDate?: string;
  readonly deferDate?: string;
  readonly completionDate?: string;
  readonly taskCount: number;
  readonly availableTaskCount: number;
  readonly remainingTaskCount: number;
  readonly tags: string[];
  readonly isSequential: boolean;
  readonly isSingleAction: boolean;
  readonly lastReviewDate?: string;
  readonly nextReviewDate?: string;
}

/**
 * OmniFocus Tag data structure
 */
export interface OmniFocusTagData {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly note?: string;
  readonly allowsNextAction: boolean;
  readonly taskCount: number;
  readonly availableTaskCount: number;
  readonly remainingTaskCount: number;
  readonly parent?: string;
  readonly children: string[];
}

/**
 * OmniFocus Folder data structure
 */
export interface OmniFocusFolderData {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly projectCount: number;
  readonly folderCount: number;
  readonly parent?: string;
  readonly children: string[];
}

// ============================================================================
// Error-Specific Result Types
// ============================================================================

/**
 * Script size limit error result
 */
export interface ScriptSizeLimitError extends JXAScriptError {
  readonly error: JXAExecutionError & {
    readonly type: 'script_too_large';
    readonly details: {
      readonly currentSize: number;
      readonly maxSize: number;
      readonly helperSize: number;
      readonly coreScriptSize: number;
      readonly recommendations: string[];
    };
  };
}

/**
 * Syntax error result
 */
export interface SyntaxErrorResult extends JXAScriptError {
  readonly error: JXAExecutionError & {
    readonly type: 'syntax_error';
    readonly details: {
      readonly line?: number;
      readonly column?: number;
      readonly function?: string;
      readonly code?: string;
    };
  };
}

/**
 * Type conversion error result
 */
export interface TypeConversionErrorResult extends JXAScriptError {
  readonly error: JXAExecutionError & {
    readonly type: 'type_conversion_error';
    readonly details: {
      readonly expectedType: string;
      readonly actualType: string;
      readonly value: unknown;
      readonly context: string;
    };
  };
}

/**
 * Context switching error result
 */
export interface ContextErrorResult extends JXAScriptError {
  readonly error: JXAExecutionError & {
    readonly type: 'context_error';
    readonly details: {
      readonly sourceContext: string;
      readonly targetContext: string;
      readonly operation: string;
      readonly bridgeOperation?: string;
    };
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Zod schema for JXA script metadata
 */
export const JXAScriptMetadataSchema = z.object({
  executionTimeMs: z.number(),
  scriptSize: z.number(),
  memoryUsageBytes: z.number().optional(),
  context: z.string(),
  timestamp: z.number(),
  version: z.string(),
  platform: z.string(),
  helperCategory: z.string().optional(),
  bridgeOperations: z.number().optional(),
  errorCount: z.number(),
  warningCount: z.number(),
});

/**
 * Zod schema for OmniFocus task data
 */
export const OmniFocusTaskDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  completed: z.boolean(),
  flagged: z.boolean(),
  blocked: z.boolean(),
  available: z.boolean().optional(),
  inInbox: z.boolean(),
  note: z.string().optional(),
  projectId: z.string().optional(),
  project: z.string().optional(),
  dueDate: z.string().optional(),
  deferDate: z.string().optional(),
  completionDate: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  tags: z.array(z.string()),
  added: z.string().optional(),
  repetitionRule: z.object({
    type: z.string(),
    frequency: z.string().optional(),
    confidence: z.number().optional(),
    source: z.string().optional(),
  }).optional(),
  recurringStatus: z.object({
    isRecurring: z.boolean(),
    type: z.string(),
    frequency: z.string().optional(),
    confidence: z.number().optional(),
    source: z.string().optional(),
  }).optional(),
});

/**
 * Zod schema for OmniFocus project data
 */
export const OmniFocusProjectDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  flagged: z.boolean(),
  note: z.string().optional(),
  folderId: z.string().optional(),
  folder: z.string().optional(),
  dueDate: z.string().optional(),
  deferDate: z.string().optional(),
  completionDate: z.string().optional(),
  taskCount: z.number(),
  availableTaskCount: z.number(),
  remainingTaskCount: z.number(),
  tags: z.array(z.string()),
  isSequential: z.boolean(),
  isSingleAction: z.boolean(),
  lastReviewDate: z.string().optional(),
  nextReviewDate: z.string().optional(),
});

/**
 * Zod schema for OmniFocus tag data
 */
export const OmniFocusTagDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  note: z.string().optional(),
  allowsNextAction: z.boolean(),
  taskCount: z.number(),
  availableTaskCount: z.number(),
  remainingTaskCount: z.number(),
  parent: z.string().optional(),
  children: z.array(z.string()),
});

// ============================================================================
// Type Guards and Utility Functions
// ============================================================================

/**
 * Type guard to check if a result is a successful JXA script result
 */
export function isJXAScriptSuccess<T>(result: JXAScriptResult<T>): result is JXAScriptSuccess<T> {
  return result.success === true;
}

/**
 * Type guard to check if a result is a failed JXA script result
 */
export function isJXAScriptError<T>(result: JXAScriptResult<T>): result is JXAScriptError {
  return result.success === false;
}

/**
 * Type guard to check if a result is a script size limit error
 */
export function isScriptSizeLimitError(result: JXAScriptResult): result is ScriptSizeLimitError {
  return (
    isJXAScriptError(result) &&
    result.error.type === 'script_too_large'
  );
}

/**
 * Type guard to check if a result is a syntax error
 */
export function isSyntaxError(result: JXAScriptResult): result is SyntaxErrorResult {
  return (
    isJXAScriptError(result) &&
    result.error.type === 'syntax_error'
  );
}

/**
 * Type guard to check if a result is a type conversion error
 */
export function isTypeConversionError(result: JXAScriptResult): result is TypeConversionErrorResult {
  return (
    isJXAScriptError(result) &&
    result.error.type === 'type_conversion_error'
  );
}

/**
 * Type guard to check if a result is a context error
 */
export function isContextError(result: JXAScriptResult): result is ContextErrorResult {
  return (
    isJXAScriptError(result) &&
    result.error.type === 'context_error'
  );
}

/**
 * Helper function to create a successful JXA script result
 */
export function createJXAScriptSuccess<T>(
  data: T,
  metadata: JXAScriptMetadata,
  performance?: JXAPerformanceMetrics,
): JXAScriptSuccess<T> {
  return {
    success: true,
    data,
    metadata,
    performance,
  };
}

/**
 * Helper function to create a failed JXA script result
 */
export function createJXAScriptError(
  error: JXAExecutionError,
  metadata: JXAScriptMetadata,
  context?: string,
  suggestions?: string[],
  performance?: JXAPerformanceMetrics,
): JXAScriptError {
  return {
    success: false,
    error,
    metadata,
    context,
    suggestions,
    performance,
  };
}

/**
 * Helper function to unwrap a JXA script result, throwing on error
 */
export function unwrapJXAScriptResult<T>(result: JXAScriptResult<T>): T {
  if (isJXAScriptSuccess(result)) {
    return result.data;
  }

  const error = new Error(`JXA script execution failed: ${result.error.message}`);
  error.name = 'JXAScriptExecutionError';
  if (result.context) {
    error.message += ` (Context: ${result.context})`;
  }
  if (result.suggestions && result.suggestions.length > 0) {
    error.message += ` (Suggestions: ${result.suggestions.join(', ')})`;
  }
  throw error;
}

// ============================================================================
// Export all types for use in other modules
// ============================================================================

export type {
  JXAScriptResult,
  JXAScriptSuccess,
  JXAScriptError,
  JXAScriptMetadata,
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
  OmniFocusTaskData,
  OmniFocusProjectData,
  OmniFocusTagData,
  OmniFocusFolderData,
  ScriptSizeLimitError,
  SyntaxErrorResult,
  TypeConversionErrorResult,
  ContextErrorResult,
};
