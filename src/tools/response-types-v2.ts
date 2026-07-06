/**
 * V2 Response Type Definitions for OmniFocus MCP Tools
 * These interfaces define the data structures returned by V2 tools
 */

// Task-related types
// NOTE: kept (not removed per the OMN-94 Cat A work order) because TaskOperationDataV2
// (a live/kept interface below) still references it as `task?: TaskV2 | {...}`.
export interface TaskV2 {
  id: string;
  name: string;
  completed?: boolean;
  flagged?: boolean;
  dueDate?: string | null;
  deferDate?: string | null;
  project?: string | null;
  tags?: string[];
  note?: string | null;
  blocked?: boolean;
  available?: boolean;
  effectivelyCompleted?: boolean;
  repetitionRule?: Record<string, unknown>;
  numberOfAvailableTasks?: number;
  numberOfCompletedTasks?: number;
  modificationDate?: string;
  completionDate?: string | null;
}

// Analytics-related types
export interface OverdueAnalysisDataV2 {
  stats: {
    summary: {
      totalOverdue: number;
      overduePercentage: number;
      averageDaysOverdue: number;
      oldestOverdueDate: string;
    };
    overdueTasks: Array<{
      id: string;
      name: string;
      // OMN-187: always a string — the v3 script guards `if (!dueDate) return`
      // before pushing a task to any urgency bucket, so overdue rows always have one.
      dueDate: string;
      daysOverdue: number;
      project?: string;
      tags?: string[];
    }>;
    patterns: Array<{
      type: string;
      value: string;
      count: number;
      percentage: number;
    }>;
    // OMN-187: typed concretely (not Record<string, unknown>) so the compiler
    // catches a key/shape drift — the exact silent-default class this fix closes.
    insights: { topRecommendations: string[] };
  };
  groupedAnalysis: Record<
    string,
    {
      count: number;
      averageDaysOverdue?: number;
      tasks?: unknown[];
    }
  >;
}

// Task Management Operation types
export interface TaskOperationDataV2 {
  task?:
    | TaskV2
    | {
        // Can be full TaskV2 or simplified structure
        id: string;
        name: string;
        [key: string]: unknown;
      };
  operation?: 'create' | 'update' | 'delete' | 'complete' | 'bulk_complete' | 'bulk_delete';
  changes?: Record<string, unknown>;
  affected_count?: number; // For bulk operations
  taskIds?: string[]; // For bulk operations
  result?: {
    // Some operations return a result object
    success: boolean;
    message?: string;
    data?: unknown;
  };
  [key: string]: unknown; // Allow additional fields for flexibility
}

// Recurring task types
export interface RecurringTaskV2 {
  id: string;
  name: string;
  project?: string | null;
  frequency?: string;
  nextDue?: string | null;
  lastCompleted?: string | null;
  repetitionRule?: Record<string, unknown>;
  completionRate?: number;
}

export interface RecurringTasksDataV2 {
  recurringTasks: RecurringTaskV2[];
  patterns?: Record<string, RecurringTaskV2[]>;
  summary?: {
    totalRecurring: number;
    byFrequency?: Record<string, number>;
  };
}
