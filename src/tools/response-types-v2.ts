/**
 * V2 Response Type Definitions for OmniFocus MCP Tools
 * These interfaces define the data structures returned by V2 tools
 */

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
  action: 'create' | 'rename' | 'delete' | 'merge' | 'nest' | 'unparent' | 'reparent';
  tagName: string;
  newName?: string;
  targetTag?: string;
}

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

// Export types
export interface ExportDataV2 {
  format: 'json' | 'csv' | 'markdown';
  exportType: 'tasks' | 'projects' | 'bulk';
  data: string | object;
  count: number;
  summary?: Record<string, unknown>;
  outputPath?: string;
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
