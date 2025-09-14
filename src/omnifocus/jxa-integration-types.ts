/**
 * Comprehensive JXA Integration Types for OmniFocus MCP
 *
 * This module provides specific, type-safe definitions for all JXA integration points,
 * addressing the lessons learned from script size limits, performance issues, and
 * context switching problems documented in LESSONS_LEARNED.md.
 */

import { z } from 'zod';

// ============================================================================
// JXA Script Execution Context Types
// ============================================================================

/**
 * JXA script execution context - defines the environment where scripts run
 */
export interface JXAExecutionContext {
  readonly app: OmniFocusApplication;
  readonly document: OmniFocusDocument;
  readonly database: OmniFocusDatabase;
  readonly console: unknown; // Console type not available in JXA context
  readonly version: string;
  readonly platform: 'macOS';
}

/**
 * Script execution parameters with size and performance constraints
 */
export interface JXAScriptParams {
  readonly maxSize: number; // Default: 300KB (from LESSONS_LEARNED.md)
  readonly timeout: number; // Default: 120 seconds
  readonly enableDebugLogging: boolean;
  readonly skipAnalysis?: boolean; // For 30% performance improvement
}

/**
 * Script execution result with comprehensive error information
 */
export interface JXAScriptExecutionResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: JXAExecutionError;
  readonly metadata: {
    readonly executionTimeMs: number;
    readonly scriptSize: number;
    readonly memoryUsage?: number;
    readonly context: string;
  };
}

/**
 * Comprehensive JXA execution error types
 */
export interface JXAExecutionError {
  readonly type: JXAErrorType;
  readonly message: string;
  readonly context?: string;
  readonly details?: unknown;
  readonly stack?: string;
  readonly scriptLocation?: {
    readonly line?: number;
    readonly column?: number;
    readonly function?: string;
  };
}

export type JXAErrorType =
  | 'script_too_large'           // Script exceeds size limits
  | 'syntax_error'               // JavaScript syntax errors
  | 'runtime_error'              // JXA runtime errors
  | 'type_conversion_error'      // "Can't convert types" errors
  | 'timeout_error'              // Script execution timeout
  | 'memory_error'               // Memory allocation failures
  | 'context_error'              // Bridge context switching issues
  | 'omni_focus_error'           // OmniFocus-specific errors
  | 'permission_error'           // Automation permission issues
  | 'unknown_error';             // Unexpected errors

// ============================================================================
// OmniFocus Object Types in JXA Context
// ============================================================================

/**
 * OmniFocus Application object in JXA context
 * Includes all methods available through JavaScript for Automation
 */
export interface OmniFocusApplication {
  readonly name: string;
  readonly version: string;
  readonly buildVersion: string;
  readonly userVersion: string;

  // Document management
  openDocument(from: unknown | null, url: URL, completed: (documentOrError: Error, alreadyOpen: boolean) => void): void;

  // Global collections
  readonly flattenedTasks: () => OmniFocusTaskArray;
  readonly flattenedProjects: () => OmniFocusProjectArray;
  readonly flattenedTags: () => OmniFocusTagArray;
  readonly flattenedFolders: () => OmniFocusFolderArray;

  // Utility methods
  evaluateJavascript(script: string): unknown;
}

/**
 * OmniFocus Document object in JXA context
 */
export interface OmniFocusDocument {
  readonly name: string | null;
  readonly database: OmniFocusDatabase;
  readonly windows: OmniFocusDocumentWindow[];

  // Document operations
  save(): void;
  close(didCancel: (document: unknown) => void | null): void;
  sync(): Promise<boolean>;
}

/**
 * OmniFocus Database object in JXA context
 */
export interface OmniFocusDatabase {
  readonly app: OmniFocusApplication;
  readonly document: OmniFocusDocument | null;
  readonly console: unknown; // Console type not available in JXA context

  // Collections
  readonly flattenedTasks: OmniFocusTaskArray;
  readonly flattenedProjects: OmniFocusProjectArray;
  readonly flattenedTags: OmniFocusTagArray;
  readonly flattenedFolders: OmniFocusFolderArray;
  readonly inbox: OmniFocusInbox;
  readonly library: OmniFocusLibrary;

  // Object retrieval
  objectForURL(url: URL): OmniFocusDatabaseObject | null;
  tagNamed(name: string): OmniFocusTag | null;
  folderNamed(name: string): OmniFocusFolder | null;
  projectNamed(name: string): OmniFocusProject | null;
  taskNamed(name: string): OmniFocusTask | null;

  // Operations
  save(): void;
  undo(): void;
  redo(): void;
  cleanUp(): void;
}

/**
 * OmniFocus Task object in JXA context with precise method signatures
 */
export interface OmniFocusTask extends OmniFocusActiveObject {
  // Core properties
  readonly id: () => string;
  readonly name: () => string;
  name: (value: string) => void;
  readonly note: () => string;
  note: (value: string) => void;

  // Status properties
  readonly completed: () => boolean;
  completed: (value: boolean) => void;
  readonly flagged: () => boolean;
  flagged: (value: boolean) => void;
  readonly blocked: () => boolean;
  readonly inInbox: () => boolean;
  readonly effectivelyCompleted: () => boolean;
  readonly effectivelyDropped: () => boolean;

  // Date properties
  readonly dueDate: () => Date | null;
  dueDate: (value: Date | null) => void;
  readonly deferDate: () => Date | null;
  deferDate: (value: Date | null) => void;
  readonly completionDate: () => Date | null;
  readonly added: () => Date | null;

  // Relationships
  readonly containingProject: () => OmniFocusProject | null;
  readonly project: () => OmniFocusProject | null;
  readonly parent: () => OmniFocusTask | null;
  readonly tags: () => OmniFocusTagArray;
  readonly children: () => OmniFocusTaskArray;

  // Task-specific properties
  readonly estimatedMinutes: () => number | null;
  estimatedMinutes: (value: number | null) => void;
  readonly sequential: () => boolean;
  sequential: (value: boolean) => void;
  readonly repetitionRule: () => OmniFocusRepetitionRule | null;
  repetitionRule: (value: OmniFocusRepetitionRule | null) => void;

  // Task operations
  markComplete(date: Date | null): OmniFocusTask;
  markIncomplete(): void;
  drop(allOccurrences: boolean, dateDropped: Date | null): void;

  // Tag operations
  addTag(tag: OmniFocusTag, location?: OmniFocusTaskTagInsertionLocation | null): void;
  addTags(tags: OmniFocusTag[], location?: OmniFocusTaskTagInsertionLocation | null): void;
  removeTag(tag: OmniFocusTag): void;
  removeTags(tags: OmniFocusTag[]): void;
  clearTags(): void;

  // Child operations
  readonly numberOfTasks: () => number;
  readonly numberOfAvailableTasks: () => number;
  readonly numberOfCompletedTasks: () => number;
  readonly next: () => boolean;
}

/**
 * OmniFocus Project object in JXA context
 */
export interface OmniFocusProject extends OmniFocusDatabaseObject {
  // Core properties
  readonly id: () => string;
  readonly name: () => string;
  name: (value: string) => void;
  readonly note: () => string;
  note: (value: string) => void;

  // Status properties
  readonly status: () => string;
  status: (value: string) => void;
  readonly flagged: () => boolean;
  flagged: (value: boolean) => void;
  readonly completed: () => boolean;
  readonly effectiveStatus: () => string;

  // Date properties
  readonly dueDate: () => Date | null;
  dueDate: (value: Date | null) => void;
  readonly deferDate: () => Date | null;
  deferDate: (value: Date | null) => void;
  readonly completionDate: () => Date | null;
  readonly lastReviewDate: () => Date | null;
  lastReviewDate: (value: Date | null) => void;
  readonly nextReviewDate: () => Date | null;
  nextReviewDate: (value: Date | null) => void;

  // Relationships
  readonly parentFolder: () => OmniFocusFolder | null;
  readonly tasks: () => OmniFocusTaskArray;
  readonly flattenedTasks: () => OmniFocusTaskArray;
  readonly tags: () => OmniFocusTagArray;

  // Project-specific properties
  readonly sequential: () => boolean;
  sequential: (value: boolean) => void;
  readonly containsSingletonActions: () => boolean;
  readonly defaultSingletonActionHolder: () => boolean;
  readonly singletonActionHolder: () => boolean;
  readonly reviewInterval: () => OmniFocusProjectReviewInterval;
  reviewInterval: (value: OmniFocusProjectReviewInterval) => void;

  // Project operations
  markComplete(date: Date | null): OmniFocusTask;
  markIncomplete(): void;
  taskNamed(name: string): OmniFocusTask | null;

  // Tag operations
  addTag(tag: OmniFocusTag): void;
  addTags(tags: OmniFocusTag[]): void;
  removeTag(tag: OmniFocusTag): void;
  removeTags(tags: OmniFocusTag[]): void;
  clearTags(): void;
}

/**
 * OmniFocus Tag object in JXA context
 */
export interface OmniFocusTag extends OmniFocusActiveObject {
  // Core properties
  readonly id: () => string;
  readonly name: () => string;
  name: (value: string) => void;
  readonly note: () => string;
  note: (value: string) => void;

  // Status properties
  readonly status: () => string;
  status: (value: string) => void;
  readonly allowsNextAction: () => boolean;
  allowsNextAction: (value: boolean) => void;

  // Relationships
  readonly parent: () => OmniFocusTag | null;
  readonly children: () => OmniFocusTagArray;
  readonly flattenedChildren: () => OmniFocusTagArray;
  readonly tasks: () => OmniFocusTaskArray;
  readonly availableTasks: () => OmniFocusTaskArray;
  readonly remainingTasks: () => OmniFocusTaskArray;
  readonly projects: () => OmniFocusProjectArray;

  // Tag operations
  tagNamed(name: string): OmniFocusTag | null;
  childNamed(name: string): OmniFocusTag | null;
  moveTask(task: OmniFocusTask, location: OmniFocusTagTaskInsertionLocation): void;
  moveTasks(tasks: OmniFocusTask[], location: OmniFocusTagTaskInsertionLocation): void;
}

/**
 * OmniFocus Folder object in JXA context
 */
export interface OmniFocusFolder extends OmniFocusActiveObject {
  // Core properties
  readonly id: () => string;
  readonly name: () => string;
  name: (value: string) => void;

  // Status properties
  readonly status: () => string;
  status: (value: string) => void;

  // Relationships
  readonly parent: () => OmniFocusFolder | null;
  readonly children: () => OmniFocusSectionArray;
  readonly flattenedChildren: () => OmniFocusSectionArray;
  readonly folders: () => OmniFocusFolderArray;
  readonly projects: () => OmniFocusProjectArray;
  readonly sections: () => OmniFocusSectionArray;

  // Folder operations
  folderNamed(name: string): OmniFocusFolder | null;
  projectNamed(name: string): OmniFocusProject | null;
  sectionNamed(name: string): OmniFocusProject | OmniFocusFolder | null;
  childNamed(name: string): OmniFocusProject | OmniFocusFolder | null;
}

// ============================================================================
// OmniFocus Collection Types
// ============================================================================

/**
 * OmniFocus Task Array with JXA-specific methods
 */
export interface OmniFocusTaskArray extends Array<OmniFocusTask> {
  byName(name: string): OmniFocusTask | null;
  apply(f: (task: OmniFocusTask) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
}

/**
 * OmniFocus Project Array with JXA-specific methods
 */
export interface OmniFocusProjectArray extends Array<OmniFocusProject> {
  byName(name: string): OmniFocusProject | null;
  apply(f: (project: OmniFocusProject) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
}

/**
 * OmniFocus Tag Array with JXA-specific methods
 */
export interface OmniFocusTagArray extends Array<OmniFocusTag> {
  byName(name: string): OmniFocusTag | null;
  apply(f: (tag: OmniFocusTag) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
}

/**
 * OmniFocus Folder Array with JXA-specific methods
 */
export interface OmniFocusFolderArray extends Array<OmniFocusFolder> {
  byName(name: string): OmniFocusFolder | null;
  apply(f: (folder: OmniFocusFolder) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
}

/**
 * OmniFocus Section Array (Projects and Folders)
 */
export interface OmniFocusSectionArray extends Array<OmniFocusProject | OmniFocusFolder> {
  byName(name: string): OmniFocusProject | OmniFocusFolder | null;
  apply(f: (section: OmniFocusProject | OmniFocusFolder) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
}

/**
 * OmniFocus Inbox (specialized Task Array)
 */
export interface OmniFocusInbox extends OmniFocusTaskArray {
  apply(f: (task: OmniFocusTask) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
}

/**
 * OmniFocus Library (specialized Section Array)
 */
export interface OmniFocusLibrary extends OmniFocusSectionArray {
  apply(f: (section: OmniFocusProject | OmniFocusFolder) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
}

// ============================================================================
// OmniFocus Supporting Types
// ============================================================================

/**
 * Base OmniFocus Database Object
 */
export interface OmniFocusDatabaseObject {
  readonly id: () => string;
  readonly url: () => URL | null;
}

/**
 * Base OmniFocus Active Object (has active status)
 */
export interface OmniFocusActiveObject extends OmniFocusDatabaseObject {
  readonly active: () => boolean;
  readonly effectiveActive: () => boolean;
}

/**
 * OmniFocus Repetition Rule
 */
export interface OmniFocusRepetitionRule {
  readonly method: () => OmniFocusRepetitionMethod;
  readonly ruleString: () => string;
  firstDateAfterDate(date: Date): Date;
}

/**
 * OmniFocus Repetition Method
 */
export interface OmniFocusRepetitionMethod {
  readonly name: string;
  readonly toString: () => string;
}

/**
 * OmniFocus Project Review Interval
 */
export interface OmniFocusProjectReviewInterval {
  readonly steps: () => number;
  steps: (value: number) => void;
  readonly unit: () => string;
  unit: (value: string) => void;
}

/**
 * OmniFocus Apply Result
 */
export interface OmniFocusApplyResult {
  readonly name: string;
  readonly toString: () => string;
}

/**
 * OmniFocus Document Window
 */
export interface OmniFocusDocumentWindow {
  readonly content: OmniFocusContentTree | null;
  readonly selection: OmniFocusSelection;
  readonly sidebar: OmniFocusSidebarTree | null;
  readonly perspective: OmniFocusPerspective | null;
  selectObjects(objects: OmniFocusDatabaseObject[]): void;
}

/**
 * OmniFocus Content Tree
 */
export interface OmniFocusContentTree extends OmniFocusTree {
  // Tree-specific methods
}

/**
 * OmniFocus Sidebar Tree
 */
export interface OmniFocusSidebarTree extends OmniFocusTree {
  // Tree-specific methods
}

/**
 * OmniFocus Tree
 */
export interface OmniFocusTree {
  nodeForObject(object: OmniFocusDatabaseObject): OmniFocusTreeNode | null;
  nodesForObjects(objects: OmniFocusDatabaseObject[]): OmniFocusTreeNode[];
  reveal(nodes: OmniFocusTreeNode[]): void;
  select(nodes: OmniFocusTreeNode[], extending?: boolean | null): void;
  readonly rootNode: OmniFocusTreeNode;
  readonly selectedNodes: OmniFocusTreeNode[];
}

/**
 * OmniFocus Tree Node
 */
export interface OmniFocusTreeNode {
  childAtIndex(childIndex: number): OmniFocusTreeNode;
  expand(completely?: boolean | null): void;
  collapse(completely?: boolean | null): void;
  reveal(): void;
  apply(f: (node: OmniFocusTreeNode) => OmniFocusApplyResult | null): OmniFocusApplyResult | null;
  readonly canCollapse: boolean;
  readonly canExpand: boolean;
  readonly childCount: number;
  readonly children: OmniFocusTreeNode[];
  readonly index: number;
  readonly isExpanded: boolean;
  readonly isRevealed: boolean;
  readonly isRootNode: boolean;
  readonly isSelectable: boolean;
  isSelected: boolean;
  readonly level: number;
  readonly object: OmniFocusDatabaseObject;
  readonly parent: OmniFocusTreeNode | null;
  readonly rootNode: OmniFocusTreeNode;
}

/**
 * OmniFocus Selection
 */
export interface OmniFocusSelection {
  readonly allObjects: OmniFocusDatabaseObject[];
  readonly database: OmniFocusDatabase | null;
  readonly databaseObjects: OmniFocusDatabaseObject[];
  readonly document: OmniFocusDocument | null;
  readonly folders: OmniFocusFolderArray;
  readonly projects: OmniFocusProjectArray;
  readonly tags: OmniFocusTagArray;
  readonly tasks: OmniFocusTaskArray;
  readonly window: OmniFocusDocumentWindow | null;
}

/**
 * OmniFocus Perspective
 */
export interface OmniFocusPerspective {
  readonly name: string;
}

// ============================================================================
// JXA Bridge and Context Switching Types
// ============================================================================

/**
 * JXA Bridge operation types for context switching
 */
export type JXABridgeOperation =
  | 'evaluate_javascript'        // Switch to evaluateJavascript context
  | 'jxa_direct'                 // Direct JXA method calls
  | 'mixed_context'              // Mixed context (problematic - see LESSONS_LEARNED.md)
  | 'safe_context';              // Safe context with proper error handling

/**
 * JXA Bridge context information
 */
export interface JXABridgeContext {
  readonly operation: JXABridgeOperation;
  readonly sourceContext: string;
  readonly targetContext: string;
  readonly timestamp: number;
  readonly success: boolean;
  readonly error?: JXAExecutionError;
}

/**
 * JXA Bridge operation result
 */
export interface JXABridgeResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly context: JXABridgeContext;
  readonly executionTimeMs: number;
  readonly error?: JXAExecutionError;
}

// ============================================================================
// JXA Performance and Monitoring Types
// ============================================================================

/**
 * JXA performance metrics
 */
export interface JXAPerformanceMetrics {
  readonly scriptSize: number;
  readonly executionTimeMs: number;
  readonly memoryUsageBytes?: number;
  readonly operationCount: number;
  readonly errorCount: number;
  readonly contextSwitches: number;
  readonly timestamp: number;
}

/**
 * JXA script size limits and monitoring
 */
export interface JXAScriptLimits {
  readonly maxSize: number;                    // Default: 300KB
  readonly warningThreshold: number;          // Default: 250KB
  readonly criticalThreshold: number;         // Default: 280KB
  readonly currentSize: number;
  readonly helperSize: number;                // Size of injected helpers
  readonly coreScriptSize: number;            // Size of core script logic
  readonly isWithinLimits: boolean;
  readonly warnings: string[];
}

/**
 * JXA helper function categories for size optimization
 */
export type JXAHelperCategory =
  | 'minimal'          // Essential utilities only (~5KB)
  | 'basic'            // Common operations (~15KB)
  | 'tag_operations'   // Tag-specific helpers (~8KB)
  | 'recurrence'       // Recurring task helpers (~35KB)
  | 'analytics'        // Analytics helpers (~20KB)
  | 'serialization'    // Export/serialization helpers (~15KB)
  | 'all';             // Complete helper suite (~75KB - avoid!)

/**
 * JXA helper configuration
 */
export interface JXAHelperConfig {
  readonly category: JXAHelperCategory;
  readonly size: number;
  readonly functions: string[];
  readonly dependencies: JXAHelperCategory[];
  readonly performanceImpact: 'low' | 'medium' | 'high';
}

// ============================================================================
// JXA Validation and Schema Types
// ============================================================================

/**
 * JXA script parameter validation schema
 */
export const JXAScriptParamsSchema = z.object({
  maxSize: z.number().min(1000).max(1000000).default(300000),
  timeout: z.number().min(1000).max(600000).default(120000),
  enableDebugLogging: z.boolean().default(false),
  skipAnalysis: z.boolean().optional(),
});

/**
 * JXA execution result validation schema
 */
export const JXAExecutionResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    type: z.enum([
      'script_too_large',
      'syntax_error',
      'runtime_error',
      'type_conversion_error',
      'timeout_error',
      'memory_error',
      'context_error',
      'omni_focus_error',
      'permission_error',
      'unknown_error',
    ]),
    message: z.string(),
    context: z.string().optional(),
    details: z.unknown().optional(),
    stack: z.string().optional(),
    scriptLocation: z.object({
      line: z.number().optional(),
      column: z.number().optional(),
      function: z.string().optional(),
    }).optional(),
  }).optional(),
  metadata: z.object({
    executionTimeMs: z.number(),
    scriptSize: z.number(),
    memoryUsage: z.number().optional(),
    context: z.string(),
  }),
});

/**
 * JXA performance metrics validation schema
 */
export const JXAPerformanceMetricsSchema = z.object({
  scriptSize: z.number(),
  executionTimeMs: z.number(),
  memoryUsageBytes: z.number().optional(),
  operationCount: z.number(),
  errorCount: z.number(),
  contextSwitches: z.number(),
  timestamp: z.number(),
});

// ============================================================================
// Type Guards and Utility Functions
// ============================================================================

/**
 * Type guard to check if a value is a valid JXA execution result
 */
export function isJXAExecutionResult(value: unknown): value is JXAScriptExecutionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'metadata' in value &&
    typeof (value as Record<string, unknown>).success === 'boolean' &&
    typeof (value as Record<string, unknown>).metadata === 'object'
  );
}

/**
 * Type guard to check if a value is a JXA execution error
 */
export function isJXAExecutionError(value: unknown): value is JXAExecutionError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'message' in value &&
    typeof (value as Record<string, unknown>).type === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

/**
 * Type guard to check if a value is an OmniFocus task in JXA context
 */
export function isOmniFocusTask(value: unknown): value is OmniFocusTask {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'completed' in value &&
    typeof (value as Record<string, unknown>).id === 'function' &&
    typeof (value as Record<string, unknown>).name === 'function' &&
    typeof (value as Record<string, unknown>).completed === 'function'
  );
}

/**
 * Type guard to check if a value is an OmniFocus project in JXA context
 */
export function isOmniFocusProject(value: unknown): value is OmniFocusProject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'status' in value &&
    typeof (value as Record<string, unknown>).id === 'function' &&
    typeof (value as Record<string, unknown>).name === 'function' &&
    typeof (value as Record<string, unknown>).status === 'function'
  );
}

/**
 * Type guard to check if a value is an OmniFocus tag in JXA context
 */
export function isOmniFocusTag(value: unknown): value is OmniFocusTag {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'status' in value &&
    typeof (value as Record<string, unknown>).id === 'function' &&
    typeof (value as Record<string, unknown>).name === 'function' &&
    typeof (value as Record<string, unknown>).status === 'function'
  );
}

// ============================================================================
// Insertion Location Types (for JXA operations)
// ============================================================================

/**
 * Task child insertion location
 */
export interface OmniFocusTaskChildInsertionLocation {
  readonly name: string;
}

/**
 * Task tag insertion location
 */
export interface OmniFocusTaskTagInsertionLocation {
  readonly name: string;
}

/**
 * Tag task insertion location
 */
export interface OmniFocusTagTaskInsertionLocation {
  readonly name: string;
}

/**
 * Tag child insertion location
 */
export interface OmniFocusTagChildInsertionLocation {
  readonly name: string;
}

/**
 * Folder child insertion location
 */
export interface OmniFocusFolderChildInsertionLocation {
  readonly name: string;
}

// ============================================================================
// Export all types for use in other modules
// ============================================================================

export type {
  JXAExecutionContext,
  JXAScriptParams,
  JXAScriptExecutionResult,
  JXAExecutionError,
  JXAErrorType,
  OmniFocusApplication,
  OmniFocusDocument,
  OmniFocusDatabase,
  OmniFocusTask,
  OmniFocusProject,
  OmniFocusTag,
  OmniFocusFolder,
  OmniFocusTaskArray,
  OmniFocusProjectArray,
  OmniFocusTagArray,
  OmniFocusFolderArray,
  OmniFocusSectionArray,
  OmniFocusInbox,
  OmniFocusLibrary,
  OmniFocusDatabaseObject,
  OmniFocusActiveObject,
  OmniFocusRepetitionRule,
  OmniFocusRepetitionMethod,
  OmniFocusProjectReviewInterval,
  OmniFocusApplyResult,
  OmniFocusDocumentWindow,
  OmniFocusContentTree,
  OmniFocusSidebarTree,
  OmniFocusTree,
  OmniFocusTreeNode,
  OmniFocusSelection,
  OmniFocusPerspective,
  JXABridgeOperation,
  JXABridgeContext,
  JXABridgeResult,
  JXAPerformanceMetrics,
  JXAScriptLimits,
  JXAHelperCategory,
  JXAHelperConfig,
};
