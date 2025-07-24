/**
 * API Type Imports and Extensions
 * 
 * This module imports the official OmniFocus TypeScript definitions
 * and provides any necessary extensions or utility types.
 */

/// <reference path="./OmniFocus.d.ts" />

// Re-export commonly used types from the official API
export type { 
  Task,
  Project,
  Tag,
  Document,
  Database,
  ObjectIdentifier,
  DateComponents,
  Folder,
  Perspective,
  ReviewInterval
} from './OmniFocus';

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
export interface ScriptResult<T = any> {
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