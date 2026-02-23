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

// Project bottleneck structure for overdue analysis
export interface ProjectBottleneck {
  name: string;
  overdueCount: number;
  totalTasks?: number;
}

// Pattern data for analytics
export interface PatternData {
  type: string;
  value: string;
  count: number;
  percentage: number;
}

// Overdue analysis script response
export interface OverdueAnalysisData {
  summary: {
    totalOverdue: number;
    overduePercentage: number;
    averageDaysOverdue: number;
    avgDaysOverdue?: number; // Alternative field name
    oldestOverdueDate: string;
    mostOverdue?: {
      dueDate: string;
    };
  };
  overdueTasks: TaskData[];
  patterns: PatternData[];
  projectBottlenecks?: ProjectBottleneck[];
  recommendations?: string[];
  groupedAnalysis: Record<string, unknown>;
}

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
export interface VelocityMetrics {
  daily?: number;
  weekly?: number;
  monthly?: number;
  trend?: string;
}

// Trend data points
export interface TrendData {
  date: string;
  value: number;
  period?: string;
}

// Prediction data
export interface PredictionData {
  nextWeek?: number;
  nextMonth?: number;
  confidence?: number;
}

// Task velocity script response
export interface TaskVelocityData {
  velocity: VelocityMetrics;
  trends: TrendData[];
  predictions: PredictionData;
  summary?: {
    currentVelocity: number;
    previousVelocity: number;
    percentageChange: number;
  };
}

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

export interface TaskUpdateArgs {
  taskId: string;
  name?: string;
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
  clearDueDate?: boolean;
  clearDeferDate?: boolean;
  clearPlannedDate?: boolean;
  clearEstimatedMinutes?: boolean;
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
