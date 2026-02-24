/**
 * V2 Response Type Definitions for OmniFocus MCP Tools
 * These interfaces define the data structures returned by V2 tools
 */

import type { StandardResponseV2 } from '../utils/response-format.js';

// Task-related types
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

export interface TasksDataV2 {
  tasks: TaskV2[];
}

export type TasksResponseV2 = StandardResponseV2<TasksDataV2>;

// Project-related types
export interface ProjectV2 {
  id: string;
  name: string;
  status?: string;
  completed?: boolean;
  dueDate?: string | null;
  deferDate?: string | null;
  completionDate?: string | null;
  note?: string | null;
  flagged?: boolean;
  tags?: string[];
  taskCount?: number;
  availableTaskCount?: number;
  completedTaskCount?: number;
  nextReviewDate?: string | null;
  lastReviewDate?: string | null;
  reviewInterval?: number | { unit: string; steps: number; fixed?: boolean };
  folder?: string | null;
  effectiveStatus?: string;
}

export interface ProjectsDataV2 {
  projects: ProjectV2[];
}

export interface ProjectOperationDataV2 {
  project: ProjectV2;
  operation: string;
  changes?: Record<string, unknown>;
}

export type ProjectsResponseV2 = StandardResponseV2<ProjectsDataV2>;
export type ProjectOperationResponseV2 = StandardResponseV2<ProjectOperationDataV2>;

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
    insights: Record<string, unknown>;
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

export type TaskOperationResponseV2 = StandardResponseV2<TaskOperationDataV2>;

// Tag-related types
export interface TagV2 {
  id: string;
  name: string;
  available?: boolean;
  availableTaskCount?: number;
  remainingTaskCount?: number;
  noteExpanded?: boolean;
  note?: string | null;
  allowsNextAction?: boolean;
  status?: string;
  children?: TagV2[];
}

export interface TagsDataV2 {
  tags: TagV2[] | string[]; // Entity-specific key for consistency
}

export interface TagOperationDataV2 {
  result: {
    success: boolean;
    message?: string;
    data?: unknown;
  };
  action: 'create' | 'rename' | 'delete' | 'merge' | 'nest' | 'unparent' | 'reparent' | 'set_mutual_exclusivity';
  tagName: string;
  newName?: string;
  targetTag?: string;
}

export type TagsResponseV2 = StandardResponseV2<TagsDataV2>;
export type TagOperationResponseV2 = StandardResponseV2<TagOperationDataV2>;

// Folder-related types
export interface FolderV2 {
  id: string;
  name: string;
  status?: string;
  noteExpanded?: boolean;
  note?: string | null;
  projectCount?: number;
  effectiveStatus?: string;
  children?: FolderV2[];
}

export interface FoldersDataV2 {
  folders: FolderV2[];
}

// Pattern Analysis types
export interface PatternFinding {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  count: number;
  items?: unknown;
  recommendation?: string;
}

// Pattern analysis returns a record of pattern findings keyed by pattern name
export type PatternAnalysisDataV2 = Record<string, PatternFinding>;

export type PatternAnalysisResponseV2 = StandardResponseV2<PatternAnalysisDataV2>;

// Export types
export interface ExportDataV2 {
  format: 'json' | 'csv' | 'markdown';
  exportType: 'tasks' | 'projects' | 'bulk';
  data: string | object;
  count: number;
  summary?: Record<string, unknown>;
}

export type ExportResponseV2 = StandardResponseV2<ExportDataV2>;

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

export type RecurringTasksResponseV2 = StandardResponseV2<RecurringTasksDataV2>;

// System types
// Review types
export interface ReviewV2 {
  projectId: string;
  projectName: string;
  nextReviewDate?: string | null;
  lastReviewDate?: string | null;
  reviewInterval?: number | { unit: string; steps: number };
  overdue?: boolean;
  daysUntilReview?: number;
}

export interface ReviewsDataV2 {
  reviews: ReviewV2[];
  summary?: {
    totalReviews: number;
    overdue: number;
    upcoming: number;
  };
}

export type ReviewsResponseV2 = StandardResponseV2<ReviewsDataV2>;
