/**
 * V2 Response Type Definitions for OmniFocus MCP Tools
 * These interfaces define the data structures returned by V2 tools
 */

import type { RecurringPatternEntry, RecurringByProjectEntry } from '../omnifocus/response-schemas/read.js';
import type { Coverage } from './unified/coverage.js';

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
      // OMN-253: the true full-population most-overdue task, tracked uncapped in
      // the script — NOT necessarily overdueTasks[0] below (that array stays
      // capped to maxTasks for payload size, so its head can miss the true max).
      mostOverdue: {
        id: string;
        name: string;
        dueDate: string;
        daysOverdue: number;
        project: string;
        tags: string[];
        blocked: boolean;
        isNext: boolean;
      } | null;
    };
    // OMN-340: this array is the N MOST overdue (sorted before slicing), capped
    // to the script's maxTasks — NOT the full overdue population. Use
    // `summary.totalOverdue` (and `coverage` below) for the true count; this
    // array is a detail SAMPLE, never a complete listing past the cap.
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
    // OMN-340 (D4a): the shared coverage disclosure for the detail sample above —
    // `coverage.total` is the true overdue count, `coverage.returned` is how many
    // detail rows this response actually carries, `coverage.capped` is true when
    // `total` exceeds `coverage.cap`.
    coverage: Coverage;
  };
  groupedAnalysis: Record<
    string,
    {
      // OMN-340: read from the script's uncapped urgencyCounts, NOT
      // tasks.length (tasks is the capped detail sample below).
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

// OMN-341: split what was one shared shape for both recurring_tasks operations
// (`analyze` and `patterns`) into two, so the `patterns` op's always-empty
// placeholders (`recurringTasks: []`, `summary.byFrequency: {}`) can't be
// reintroduced just to satisfy a type both operations shared.
export interface RecurringAnalyzeDataV2 {
  recurringTasks: RecurringTaskV2[];
  summary?: {
    totalRecurring: number;
    byFrequency?: Record<string, number>;
  };
}

// Import type only — see src/omnifocus/response-schemas/read.ts for the
// script-wire shape (`RecurringPatternEntry` / `RecurringByProjectEntry`
// inferred from the strict `RecurringPatternsSchema`).
export interface RecurringPatternsDataV2 {
  summary: { totalRecurring: number };
  patterns: RecurringPatternEntry[];
  byProject: RecurringByProjectEntry[];
  mostCommon: RecurringPatternEntry | null;
  insights: string[];
}
