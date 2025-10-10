/**
 * V2 Response Type Definitions for OmniFocus MCP Tools
 * These interfaces define the data structures returned by V2 tools
 */

import type {
  StandardResponseV2,
} from '../utils/response-format-v2.js';

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
  preview?: TaskV2[];
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
  preview?: ProjectV2[];
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
  groupedAnalysis: Record<string, {
    count: number;
    averageDaysOverdue?: number;
    tasks?: unknown[];
  }>;
}

export type OverdueAnalysisResponseV2 = StandardResponseV2<OverdueAnalysisDataV2>;

export interface ProductivityStatsDataV2 {
  period: string;
  stats: {
    overview: {
      totalTasks: number;
      completedTasks: number;
      completionRate: number;
      activeProjects: number;
      overdueCount: number;
    };
    daily: unknown[];
    weekly: Record<string, unknown>;
    projectStats: Array<{
      name: string;
      completedCount: number;
      totalCount: number;
      completionRate: number;
    }>;
    tagStats: Array<{
      name: string;
      count: number;
    }>;
  };
  insights: Record<string, unknown>;
  healthScore: number;
}

export type ProductivityStatsResponseV2 = StandardResponseV2<ProductivityStatsDataV2>;

export interface TaskVelocityDataV2 {
  velocity: {
    period: string;
    tasksCompleted: number;
    averagePerDay: number;
    peakDay: {
      date: string | null;
      count: number;
    };
    trend: 'increasing' | 'stable' | 'decreasing';
    predictedCapacity: number;
  };
  daily: Array<{
    date: string;
    completed: number;
  }>;
  patterns: {
    byDayOfWeek: Record<string, number>;
    byTimeOfDay: Record<string, number>;
    byProject: Array<{
      name: string;
      completed: number;
    }>;
  };
  insights: string[];
}

export type TaskVelocityResponseV2 = StandardResponseV2<TaskVelocityDataV2>;

// Task Management Operation types
export interface TaskOperationDataV2 {
  task?: TaskV2 | {  // Can be full TaskV2 or simplified structure
    id: string;
    name: string;
    [key: string]: unknown;
  };
  operation?: 'create' | 'update' | 'delete' | 'complete' | 'bulk_complete' | 'bulk_delete';
  changes?: Record<string, unknown>;
  affected_count?: number; // For bulk operations
  taskIds?: string[]; // For bulk operations
  result?: {  // Some operations return a result object
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
  items: TagV2[] | string[]; // Can be full objects or just names (matches createListResponseV2)
  preview?: TagV2[] | string[];
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

export interface FolderOperationDataV2 {
  folder: FolderV2;
  operation: 'create' | 'update' | 'delete' | 'get' | 'search';
  changes?: Record<string, unknown>;
}

export type FoldersResponseV2 = StandardResponseV2<FoldersDataV2>;
export type FolderOperationResponseV2 = StandardResponseV2<FolderOperationDataV2>;

// Perspective-related types
export interface PerspectiveV2 {
  id: string;
  name: string;
  builtIn?: boolean;
}

export interface PerspectivesDataV2 {
  perspectives: PerspectiveV2[];
  tasks?: TaskV2[]; // When getting tasks for a specific perspective
  formatted?: string; // Formatted output for human reading
}

export type PerspectivesResponseV2 = StandardResponseV2<PerspectivesDataV2>;

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

// Batch operation types
export interface BatchResultV2 {
  tempId?: string;
  actualId?: string;
  type: 'project' | 'task';
  success: boolean;
  error?: string;
  item?: TaskV2 | ProjectV2;
}

export interface BatchCreateDataV2 {
  results: BatchResultV2[];
  summary: {
    totalProcessed: number;
    successCount: number;
    failureCount: number;
  };
  idMap?: Record<string, string>; // tempId -> actualId mapping
}

export type BatchCreateResponseV2 = StandardResponseV2<BatchCreateDataV2>;

// System types
export interface SystemInfoDataV2 {
  operation: 'version' | 'health' | 'metrics' | 'cache_stats' | 'diagnose';
  data: Record<string, unknown>;
}

export type SystemResponseV2 = StandardResponseV2<SystemInfoDataV2>;

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

// Workflow Analysis types
export interface WorkflowDataV2 {
  analysis: {
    bottlenecks: Array<{
      type: string;
      description: string;
      severity: 'high' | 'medium' | 'low';
      affectedItems: number;
    }>;
    opportunities: Array<{
      type: string;
      description: string;
      potentialImpact: string;
    }>;
    healthMetrics: Record<string, number>;
  };
  recommendations: string[];
}

export type WorkflowAnalysisResponseV2 = StandardResponseV2<WorkflowDataV2>;

// Meeting Notes parsing types
export interface ParsedMeetingNotesDataV2 {
  actionItems: Array<{
    name: string;
    note?: string;
    project?: string;
    dueDate?: string;
    deferDate?: string;
    tags?: string[];
    estimatedMinutes?: number;
    confidence: number;
  }>;
  projects?: Array<{
    name: string;
    note?: string;
    tasks?: string[];
  }>;
  summary: {
    totalActionItems: number;
    totalProjects: number;
    avgConfidence: number;
  };
  batchItems?: unknown[]; // For batch_create compatibility
}

export type ParsedMeetingNotesResponseV2 = StandardResponseV2<ParsedMeetingNotesDataV2>;
