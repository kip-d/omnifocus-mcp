/**
 * API Type Imports and Extensions
 *
 * This module imports the official OmniFocus TypeScript definitions
 * and provides any necessary extensions or utility types.
 */

/// <reference path="./OmniFocus.d.ts" />

// The official OmniFocus types are available globally due to the reference path above
// They are ambient declarations and don't need to be imported or re-exported

// Re-export type aliases for convenience
export type OmniFocusTask = Task;
export type OmniFocusProject = Project;
export type OmniFocusTag = Tag;
export type OmniFocusDocument = Document;
export type OmniFocusDatabase = Database;
export type OmniFocusObjectIdentifier = ObjectIdentifier;

// Utility type for safe property access in JXA context
export type SafeGetter<T> = () => T | null | undefined;

// Extended types that include our custom analysis
export interface TaskWithAnalysis extends Task {
  // Our custom recurring task analysis
  recurringStatus?: {
    isRecurring: boolean;
    type: string;
    frequency?: string;
    nextExpectedDate?: Date | string;
    scheduleDeviation?: boolean;
    _detectionMethod?: string;
    _confidence?: string;
  };
}

// Type for script execution results
export interface ScriptResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: {
    message: string;
    details?: string;
  };
}

// Type for safe access wrapper functions
export interface SafeAccessors {
  safeGet<T>(getter: SafeGetter<T>, defaultValue?: T): T;
  safeGetDate(getter: SafeGetter<Date>): string | null;
  safeGetProject(task: Task): { name: string; id: string } | null;
  safeGetTags(task: Task): string[];
  safeIsCompleted(obj: Task | Project): boolean;
  safeIsFlagged(obj: Task | Project): boolean;
}
