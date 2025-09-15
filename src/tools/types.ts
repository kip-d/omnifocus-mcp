/**
 * Type definitions for MCP tool arguments and responses
 */

import {
  OmniFocusTask,
  OmniFocusProject,
  OmniFocusTag,
  TaskFilter,
  ProjectFilter,
  TaskUpdate,
  ProjectUpdate,
  ProductivityStats,
} from '../omnifocus/types.js';

// Task Tool Arguments
export interface CreateTaskArgs {
  name: string;
  note?: string;
  projectId?: string;
  flagged?: boolean;
  dueDate?: string;
  deferDate?: string;
  estimatedMinutes?: number;
  tags?: string[];
}

export interface UpdateTaskArgs extends TaskUpdate {
  taskId: string;
}

export interface DeleteTaskArgs {
  taskId: string;
}

export interface CompleteTaskArgs {
  taskId: string;
}

export interface ListTasksArgs extends TaskFilter {
  limit?: number;
}

export type GetTaskCountArgs = TaskFilter;

export interface TodaysAgendaArgs {
  includeFlagged?: boolean;
  includeOverdue?: boolean;
  includeAvailable?: boolean;
}

// Project Tool Arguments
export interface CreateProjectArgs {
  name: string;
  note?: string;
  status?: 'active' | 'onHold';
  flagged?: boolean;
  dueDate?: string;
  deferDate?: string;
  sequential?: boolean;
  reviewInterval?: number;
  folder?: string;
}

export interface UpdateProjectArgs extends ProjectUpdate {
  projectId: string;
}

export interface DeleteProjectArgs {
  projectId: string;
  deleteChildren?: boolean;
}

export interface CompleteProjectArgs {
  projectId: string;
  completeTasks?: boolean;
}

export type ListProjectsArgs = ProjectFilter;

// Tag Tool Arguments
export interface ListTagsArgs {
  sortBy?: string;
  includeEmpty?: boolean;
}

export interface ManageTagsArgs {
  action: 'create' | 'rename' | 'delete' | 'move';
  tagName: string;
  newName?: string;
  targetTag?: string;
}

// Analytics Tool Arguments
export interface OverdueAnalysisArgs {
  includeRecentlyCompleted?: boolean;
  groupBy?: string;
  limit?: number;
}

export interface ProductivityStatsArgs {
  period?: string;
  groupBy?: string;
  includeCompleted?: boolean;
}

export interface TaskVelocityArgs {
  period?: string;
  projectId?: string;
  tags?: string[];
}

// Recurring Task Tool Arguments
export interface AnalyzeRecurringTasksArgs {
  includeCompleted?: boolean;
  projectId?: string;
  tags?: string[];
  limit?: number;
}

export interface GetRecurringPatternsArgs {
  includeInferred?: boolean;
  groupByProject?: boolean;
  sortBy?: string;
}

// Export Tool Arguments
export interface ExportTasksArgs {
  format?: 'json' | 'csv' | 'markdown';
  includeCompleted?: boolean;
  includeNotes?: boolean;
  includeTags?: boolean;
  projectId?: string;
  filter?: TaskFilter;
  limit?: number;
}

export interface ExportProjectsArgs {
  format?: 'json' | 'csv' | 'markdown';
  includeStats?: boolean;
  status?: ('active' | 'onHold' | 'dropped' | 'completed')[];
}

export interface BulkExportArgs {
  includeProjects?: boolean;
  includeTasks?: boolean;
  includeTags?: boolean;
  includeCompleted?: boolean;
  format?: 'json';
}

// Script Response Types
export interface TaskListResponse {
  tasks: OmniFocusTask[];
  totalCount: number;
}

export interface TaskCountResponse {
  count: number;
  breakdown?: {
    overdue?: number;
    dueToday?: number;
    available?: number;
    flagged?: number;
  };
}

export interface ProjectListResponse {
  projects: OmniFocusProject[];
  totalCount: number;
}

export interface TagListResponse {
  tags: OmniFocusTag[];
  hierarchy?: Record<string, unknown>; // Complex nested structure
}

export interface CreateTaskResponse {
  success: boolean;
  taskId?: string;
  task?: OmniFocusTask;
  error?: string;
  tagWarning?: string;
}

export interface UpdateTaskResponse {
  success: boolean;
  taskId?: string;
  changes?: string[];
  error?: string;
}

export interface DeleteTaskResponse {
  success: boolean;
  deletedTaskId?: string;
  error?: string;
}

export interface CreateProjectResponse {
  success: boolean;
  projectId?: string;
  project?: OmniFocusProject;
  error?: string;
}

export interface UpdateProjectResponse {
  success: boolean;
  projectId?: string;
  changes?: string[];
  error?: string;
}

export interface DeleteProjectResponse {
  success: boolean;
  deletedProjectId?: string;
  deletedTaskCount?: number;
  error?: string;
}

export interface TagOperationResponse {
  success: boolean;
  action: string;
  tagName?: string;
  newName?: string;
  error?: string;
  message?: string;
}

export interface VersionInfoResponse {
  name: string;
  version: string;
  description: string;
  build: {
    hash: string;
    branch: string;
    commitDate: string;
    commitMessage: string;
    dirty: boolean;
    timestamp: string;
    buildId: string;
  };
  runtime: {
    node: string;
    platform: string;
    arch: string;
  };
  git: {
    repository: string;
    homepage: string;
  };
}

// Analytics Response Types
export interface OverdueAnalysisResponse {
  overview: {
    totalOverdue: number;
    oldestOverdueDate: string;
    averageDaysOverdue: number;
  };
  byProject?: Array<{
    project: string;
    count: number;
    oldestDate: string;
  }>;
  byTag?: Array<{
    tag: string;
    count: number;
  }>;
  tasks?: OmniFocusTask[];
}

export interface ProductivityStatsResponse {
  stats: ProductivityStats;
  trends?: Record<string, unknown>;
  insights?: string[];
}

export interface TaskVelocityResponse {
  velocity: {
    period: string;
    tasksCompleted: number;
    averagePerDay: number;
    estimatedAccuracy?: number;
  };
  byProject?: Array<{
    project: string;
    completed: number;
    created: number;
  }>;
  byTag?: Array<{
    tag: string;
    completed: number;
  }>;
}

// Recurring Task Response Types
export interface RecurringTaskAnalysisResponse {
  tasks: OmniFocusTask[];
  summary: {
    total: number;
    byFrequency: Record<string, number>;
    withScheduleDeviation: number;
  };
}

export interface RecurringPatternsResponse {
  patterns: Array<{
    frequency: string;
    count: number;
    examples: string[];
  }>;
  byProject: Array<{
    project: string;
    recurringCount: number;
    totalTasks: number;
  }>;
  mostCommon: {
    frequency: string;
    count: number;
  };
}

// Export Response Types
export interface ExportResponse {
  data: string | Record<string, unknown>; // JSON object or CSV/Markdown string
  format: 'json' | 'csv' | 'markdown';
  itemCount: number;
  exportDate: string;
}

export interface BulkExportResponse {
  projects?: OmniFocusProject[];
  tasks?: OmniFocusTask[];
  tags?: OmniFocusTag[];
  metadata: {
    exportDate: string;
    counts: {
      projects?: number;
      tasks?: number;
      tags?: number;
    };
  };
}
