/**
 * Type definitions for OmniFocus script responses
 * Used to provide type safety when processing script results in analytics tools
 */

// Base task data structure
export interface TaskData {
  id: string;
  name: string;
  dueDate?: string;
  projectId?: string;
  tags?: string[];
  completed?: boolean;
  flagged?: boolean;
}

// OMN-187: the former `OverdueAnalysisData` interface lived here as a hand-
// maintained copy of the overdue payload shape and silently drifted from what
// the v3 script emits — the root cause of the always-0/empty overdue_analysis
// bug. The read-path now types against `OverdueAnalysisV3Data` (z.infer of
// OVERDUE_ANALYSIS_V3_SCHEMA in script-response-schemas.ts); do not reintroduce
// a parallel interface here. The `ProjectBottleneck` and `PatternData`
// interfaces were deleted alongside it — they had no other consumers.

// Stats overview for productivity analysis
export interface StatsOverview {
  totalTasks?: number;
  completedTasks?: number;
  overdueTasks?: number;
  flaggedTasks?: number;
  completionRate?: number;
}

// Project statistics
export interface ProjectStats {
  name: string;
  id?: string;
  completedCount: number;
  totalTasks?: number;
  overdueCount?: number;
}

// Tag statistics
export interface TagStats {
  name: string;
  count: number;
  completionRate?: number;
}

// Productivity stats script response
export interface ProductivityStatsData {
  stats: {
    overview: StatsOverview;
    projectStats?: ProjectStats[];
    tagStats?: TagStats[];
  };
  healthScore?: number;
  insights?: string[];
}

// Velocity metrics
// Trend data points
// Prediction data
// Task velocity script response
// Workflow pattern
export interface Pattern {
  type: string;
  description: string;
  severity?: 'low' | 'medium' | 'high';
  count?: number;
}

// Workflow bottleneck
export interface Bottleneck {
  area: string;
  description: string;
  impact: string;
  suggestions?: string[];
}

// Workflow analysis script response
export interface WorkflowAnalysisData {
  analysis: {
    patterns: Pattern[];
    bottlenecks: Bottleneck[];
    recommendations: string[];
    insights?: string[];
  };
  summary?: {
    score: number;
    status: string;
  };
}

// Review data for OmniFocusAnalyzeTool manage_reviews
export interface ReviewProjectData {
  id: string;
  name: string;
  reviewDate?: string;
  needsReview?: boolean;
}

export interface ReviewListData {
  projects?: ReviewProjectData[];
  items?: ReviewProjectData[];
  count?: number;
}

// Task creation/update structures for OmniFocusWriteTool
export interface TaskCreationArgs {
  name: string;
  note?: string;
  projectId?: string;
  parentTaskId?: string;
  dueDate?: string;
  deferDate?: string;
  plannedDate?: string;
  flagged?: boolean;
  estimatedMinutes?: number;
  tags?: string[];
  sequential?: boolean;
  repeatRule?: RepeatRule;
}

export interface RepeatRule {
  method: string;
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  steps: number;
  deferAnother?: {
    unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
    steps: number;
  };
  weekPosition?: string;
  weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  weekdays?: string[];
}

// Task operation results
export interface TaskOperationResult {
  success: boolean;
  task?: TaskData;
  error?: string;
  details?: unknown;
}

// Script execution result wrappers
export interface ScriptExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  details?: unknown;
}
