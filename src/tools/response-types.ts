/**
 * Type definitions for tool responses
 * These provide specific return types for each tool to improve type safety
 */

import { StandardResponse } from '../utils/response-format.js';
import { 
  OmniFocusTask,
  OmniFocusProject,
  OmniFocusTag
} from '../omnifocus/types.js';

// Re-export the shared types for convenience
export { OmniFocusTask, OmniFocusProject, OmniFocusTag };

export interface TaskListMetadata {
  total_items: number;
  items_returned: number;
  limit_applied: number;
  has_more: boolean;
  query_time_ms: number;
  filters_applied: Record<string, unknown>;
  performance_note?: string;
}

export type ListTasksResponse = StandardResponse<{ items: OmniFocusTask[] }>;

export interface CreateTaskResponseData {
  task: {
    success: true;
    taskId: string;
    task: {
      id: string;
      name: string;
      flagged: boolean;
      inInbox: boolean;
      projectId: string | null;
      project: string | null;
      note?: string;
      dueDate?: string;
      deferDate?: string;
      estimatedMinutes?: number;
      tags?: string[];
      tagWarning?: string;
    };
  };
}

export type CreateTaskResponse = StandardResponse<CreateTaskResponseData>;

export interface UpdateTaskResponseData {
  task: {
    id: string;
    name: string;
    updated: boolean;
    changes: Record<string, unknown>;
  };
}

export type UpdateTaskResponse = StandardResponse<UpdateTaskResponseData>;

export interface CompleteTaskResponseData {
  task: {
    id: string;
    completed: true;
    completionDate: string;
  };
}

export type CompleteTaskResponse = StandardResponse<CompleteTaskResponseData>;

export interface DeleteTaskResponseData {
  task: {
    success: true;
    id: string;
    deleted: true;
    name: string;
  };
}

export type DeleteTaskResponse = StandardResponse<DeleteTaskResponseData>;

export interface TaskCountResponseData {
  count: number;
}

export type TaskCountResponse = StandardResponse<TaskCountResponseData>;

export interface TodaysAgendaResponseData {
  tasks: Array<OmniFocusTask & { reason: string }>;
  summary: {
    total: number;
    overdue: number;
    due_today: number;
    flagged: number;
  };
}

export type TodaysAgendaResponse = StandardResponse<TodaysAgendaResponseData>;

// Project tool responses
// OmniFocusProject is imported from '../omnifocus/types.js'

export type ListProjectsResponse = StandardResponse<{ items: OmniFocusProject[] }>;

export interface CreateProjectResponseData {
  project: {
    id: string;
    name: string;
    created: true;
  };
}

export type CreateProjectResponse = StandardResponse<CreateProjectResponseData>;

export interface UpdateProjectResponseData {
  project: {
    id: string;
    name: string;
    updated: true;
    changes: Record<string, unknown>;
  };
}

export type UpdateProjectResponse = StandardResponse<UpdateProjectResponseData>;

export type CompleteProjectResponse = StandardResponse<{ project: { id: string; completed: true } }>;
export type DeleteProjectResponse = StandardResponse<{ project: { id: string; deleted: true; name: string } }>;

// Tag tool responses
// OmniFocusTag is imported from '../omnifocus/types.js'

export type ListTagsResponse = StandardResponse<{ items: OmniFocusTag[] }>;

export interface ManageTagsResponseData {
  operation: 'create' | 'rename' | 'delete';
  tag: {
    id?: string;
    name: string;
    oldName?: string;
    success: boolean;
    message?: string;
  };
}

export type ManageTagsResponse = StandardResponse<ManageTagsResponseData>;

// Analytics tool responses
export interface ProductivityStatsResponseData {
  stats: {
    today: {
      completed: number;
      created: number;
      netProgress: number;
    };
    week: {
      completed: number;
      created: number;
      avgPerDay: number;
    };
    month: {
      completed: number;
      created: number;
      avgPerDay: number;
    };
    trends?: Record<string, unknown>;
    insights?: Record<string, unknown>;
  };
  summary: Record<string, unknown>;
}

export type ProductivityStatsResponse = StandardResponse<ProductivityStatsResponseData>;

export interface TaskVelocityResponseData {
  stats: {
    averageTimeToComplete: {
      overall: number;
      byProject: Record<string, number>;
      byTag: Record<string, number>;
    };
    completionRates: {
      overall: number;
      byProject: Record<string, number>;
      byTag: Record<string, number>;
    };
    velocity: {
      tasksPerDay: number;
      tasksPerWeek: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    };
  };
  summary: Record<string, unknown>;
}

export type TaskVelocityResponse = StandardResponse<TaskVelocityResponseData>;

export interface OverdueAnalysisResponseData {
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
      dueDate: string;
      daysOverdue: number;
      project?: string;
      tags: string[];
    }>;
    patterns: Array<{
      type: string;
      value: string;
      count: number;
      percentage: number;
    }>;
    insights: Record<string, unknown>;
  };
  summary: Record<string, unknown>;
}

export type OverdueAnalysisResponse = StandardResponse<OverdueAnalysisResponseData>;

// Export tool responses
export interface ExportTasksResponseData {
  export: {
    format: 'json' | 'csv' | 'taskpaper';
    data: string | object;
    metadata: {
      exportDate: string;
      taskCount: number;
      format: string;
    };
  };
}

export type ExportTasksResponse = StandardResponse<ExportTasksResponseData>;

export interface ExportProjectsResponseData {
  export: {
    format: 'json' | 'csv' | 'markdown';
    data: string | object;
    metadata: {
      exportDate: string;
      projectCount: number;
      format: string;
    };
  };
}

export type ExportProjectsResponse = StandardResponse<ExportProjectsResponseData>;

export interface BulkExportResponseData {
  exports: {
    tasks?: {
      format: string;
      taskCount: number;
      exported: boolean;
    };
    projects?: {
      format: string;
      projectCount: number;
      exported: boolean;
    };
    tags?: {
      format: string;
      tagCount: number;
      exported: boolean;
    };
  };
  summary: {
    totalExported: number;
    exportDate: string;
  };
}

export type BulkExportResponse = StandardResponse<BulkExportResponseData>;

// Recurring task tool responses
export interface RecurringTaskPattern {
  taskId: string;
  taskName: string;
  frequency: string;
  nextDue?: string;
  lastCompleted?: string;
  completionRate: number;
  isConsistent: boolean;
  pattern: {
    type: string;
    confidence: number;
    source: string;
  };
}

export interface AnalyzeRecurringTasksResponseData {
  analysis: {
    recurringTasks: RecurringTaskPattern[];
    summary: {
      totalRecurring: number;
      byFrequency: Record<string, number>;
      consistencyRate: number;
    };
  };
}

export type AnalyzeRecurringTasksResponse = StandardResponse<AnalyzeRecurringTasksResponseData>;

export interface RecurringPatternGroup {
  frequency: string;
  tasks: Array<{
    id: string;
    name: string;
    project?: string;
    nextDue?: string;
  }>;
  totalCount: number;
}

export interface GetRecurringPatternsResponseData {
  patterns: RecurringPatternGroup[];
  summary: {
    totalPatterns: number;
    totalTasks: number;
  };
}

export type GetRecurringPatternsResponse = StandardResponse<GetRecurringPatternsResponseData>;

// System tool responses
export interface VersionInfoResponseData {
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

export type VersionInfoResponse = StandardResponse<VersionInfoResponseData>;