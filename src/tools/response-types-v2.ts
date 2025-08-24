/**
 * V2 Response Type Definitions for OmniFocus MCP Tools
 * These interfaces define the data structures returned by V2 tools
 */

import type { 
  StandardResponseV2
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
  repetitionRule?: any;
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
  changes?: Record<string, any>;
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
      category: string;
      count: number;
      percentage: number;
    }>;
    insights: Record<string, any>;
  };
  groupedAnalysis: Record<string, {
    count: number;
    averageDaysOverdue?: number;
    tasks?: any[];
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
    daily: any[];
    weekly: Record<string, any>;
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
  insights: Record<string, any>;
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
// Perspective-related types
export interface PerspectiveInfoV2 {
  name: string;
  identifier?: string;
  isBuiltIn?: boolean;
  isActive?: boolean;
  filterRules?: {
    available?: boolean | null;
    flagged?: boolean | null;
    duration?: number | null;
    tags?: string[];
  };
}

export interface PerspectivesListDataV2 {
  perspectives: PerspectiveInfoV2[];
}

export interface PerspectiveQueryDataV2 {
  perspectiveName: string;
  perspectiveType: 'builtin' | 'custom';
  tasks: TaskV2[];
  filterRules?: any;
  aggregation?: string;
}

export type PerspectivesListResponseV2 = StandardResponseV2<PerspectivesListDataV2>;
export type PerspectiveQueryResponseV2 = StandardResponseV2<PerspectiveQueryDataV2>;

// System-related types
export interface VersionInfoDataV2 {
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

export interface DiagnosticsDataV2 {
  timestamp: string;
  basic: Record<string, any>;
  testScript?: string;
}

export type SystemResponseV2 = StandardResponseV2<VersionInfoDataV2 | DiagnosticsDataV2>;
