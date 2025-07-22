/**
 * Type definitions for OmniFocus script responses
 * 
 * These interfaces define the expected JSON responses from our JXA scripts
 */

import { OmniFocusTask, OmniFocusProject, OmniFocusTag } from './types.js';

// Base script response types
export interface ScriptError {
  error: true;
  message: string;
  stack?: string;
  details?: unknown;
}

export interface ScriptSuccess<T = unknown> {
  error?: false;
  success?: boolean;
  data?: T;
}

export type ScriptResponse<T = unknown> = ScriptSuccess<T> | ScriptError;

// Task script responses
export interface CreateTaskScriptResponse {
  success: boolean;
  taskId?: string;
  task?: {
    id: string;
    name: string;
    flagged: boolean;
    inInbox: boolean;
    projectId: string | null;
    project: string | null;
    note?: string;
    tags?: string[];
    tagWarning?: string;
  };
  error?: boolean;
  message?: string;
}

export interface UpdateTaskScriptResponse {
  success: boolean;
  taskId?: string;
  changes?: string[];
  error?: boolean;
  message?: string;
}

export interface DeleteTaskScriptResponse {
  success: boolean;
  deletedTaskId?: string;
  error?: boolean;
  message?: string;
}

export interface ListTasksScriptResponse {
  tasks: Array<{
    id: string;
    name: string;
    note?: string;
    project?: string;
    projectId?: string;
    dueDate?: string;
    deferDate?: string;
    completionDate?: string;
    flagged: boolean;
    tags: string[];
    estimatedMinutes?: number;
    completed: boolean;
    dropped: boolean;
    effectivelyCompleted: boolean;
    blocked: boolean;
    sequential: boolean;
    inInbox: boolean;
    added?: string;
    repetitionRule?: {
      method?: string;
      ruleString?: string;
      unit?: string;
      steps?: number;
      frequency?: string;
    };
    recurringStatus?: {
      isRecurring: boolean;
      type: string;
      frequency?: string;
    };
  }>;
  totalCount: number;
}

export interface TaskCountScriptResponse {
  count: number;
  breakdown?: {
    overdue?: number;
    dueToday?: number;
    available?: number;
    flagged?: number;
  };
}

// Project script responses
export interface CreateProjectScriptResponse {
  success: boolean;
  projectId?: string;
  project?: {
    id: string;
    name: string;
    status: string;
    flagged: boolean;
    folder?: string;
  };
  error?: boolean;
  message?: string;
}

export interface UpdateProjectScriptResponse {
  success: boolean;
  projectId?: string;
  changes?: string[];
  error?: boolean;
  message?: string;
}

export interface DeleteProjectScriptResponse {
  success: boolean;
  deletedProjectId?: string;
  deletedTaskCount?: number;
  error?: boolean;
  message?: string;
}

export interface ListProjectsScriptResponse {
  projects: Array<{
    id: string;
    name: string;
    note?: string;
    status: string;
    deferDate?: string;
    dueDate?: string;
    completionDate?: string;
    flagged: boolean;
    sequential: boolean;
    containsSingletonActions: boolean;
    lastReviewDate?: string;
    reviewInterval?: number;
    folder?: string;
    numberOfTasks: number;
    numberOfAvailableTasks: number;
    numberOfCompletedTasks: number;
  }>;
  totalCount: number;
}

// Tag script responses
export interface ListTagsScriptResponse {
  tags: Array<{
    id: string;
    name: string;
    note?: string;
    allowsNextAction: boolean;
    parent?: string;
    children: string[];
    taskCount?: number;
  }>;
  hierarchy?: unknown; // Complex nested structure
}

export interface TagOperationScriptResponse {
  success?: boolean;
  action?: string;
  tagName?: string;
  oldName?: string;
  newName?: string;
  error?: boolean;
  message?: string;
}

// Analytics script responses
export interface OverdueAnalysisScriptResponse {
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
  tasks?: Array<OmniFocusTask>;
}

export interface ProductivityStatsScriptResponse {
  stats: {
    period: string;
    startDate: string;
    endDate: string;
    tasksCompleted: number;
    tasksCreated: number;
    tasksOverdue: number;
    averageCompletionTime?: number;
    completionRate: number;
    topTags: Array<{ tag: string; count: number }>;
    topProjects: Array<{ project: string; count: number }>;
    estimateAccuracy?: number;
  };
  trends?: unknown;
  insights?: unknown;
}

export interface TaskVelocityScriptResponse {
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

// Recurring task script responses
export interface RecurringTaskAnalysisScriptResponse {
  tasks: Array<OmniFocusTask>;
  summary: {
    total: number;
    byFrequency: Record<string, number>;
    withScheduleDeviation: number;
  };
}

export interface RecurringPatternsScriptResponse {
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

// Export script responses
export interface ExportScriptResponse {
  data: unknown; // Can be JSON object, CSV string, or Markdown string
  format: 'json' | 'csv' | 'markdown';
  itemCount: number;
  exportDate: string;
}

export interface BulkExportScriptResponse {
  projects?: Array<OmniFocusProject>;
  tasks?: Array<OmniFocusTask>;
  tags?: Array<OmniFocusTag>;
  metadata: {
    exportDate: string;
    counts: {
      projects?: number;
      tasks?: number;
      tags?: number;
    };
  };
}