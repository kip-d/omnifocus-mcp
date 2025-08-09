/**
 * Type definitions for OmniFocus JXA (JavaScript for Automation) API responses
 * These types represent the data structures returned by OmniFocus automation scripts
 */

/**
 * Generic wrapper for OmniFocus JXA responses
 * Provides type safety while acknowledging the dynamic nature of JXA returns
 */
export type OmniFocusResponse<T> =
  | { success: true; data: T }
  | { success: false; error: OmniFocusError };

export interface OmniFocusError {
  error: true;
  message: string;
  details?: string;
}

/**
 * Repetition rule structures from OmniFocus
 * These vary significantly based on the recurrence type
 */
export interface BaseRepetitionRule {
  method?: string;
  ruleString?: string;
  anchorDateKey?: string;
  catchUpAutomatically?: boolean;
  scheduleType?: string;
  unit?: string;
  steps?: number;
  _inferenceSource?: string;
}

export interface HourlyRepetitionRule extends BaseRepetitionRule {
  unit: 'hours';
  steps: number;
}

export interface DailyRepetitionRule extends BaseRepetitionRule {
  unit: 'days';
  steps: number;
}

export interface WeeklyRepetitionRule extends BaseRepetitionRule {
  unit: 'weeks';
  steps: number;
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday
}

export interface MonthlyRepetitionRule extends BaseRepetitionRule {
  unit: 'months';
  steps: number;
  dayOfMonth?: number;
  weekOfMonth?: number;
  dayOfWeek?: number;
}

export interface YearlyRepetitionRule extends BaseRepetitionRule {
  unit: 'years';
  steps: number;
  month?: number;
  dayOfMonth?: number;
}

export type RepetitionRule =
  | HourlyRepetitionRule
  | DailyRepetitionRule
  | WeeklyRepetitionRule
  | MonthlyRepetitionRule
  | YearlyRepetitionRule
  | BaseRepetitionRule;

/**
 * Tag hierarchy structures
 */
export interface TagHierarchyNode {
  name: string;
  id: string;
  taskCount: number;
  children?: TagHierarchyNode[];
}

/**
 * Analytics and insights structures
 */
export interface ProductivityTrends {
  daily: Array<{
    date: string;
    completed: number;
    created: number;
    netProgress: number;
  }>;
  weekly: Array<{
    week: string;
    completed: number;
    created: number;
    avgPerDay: number;
  }>;
}

export interface ProductivityInsights {
  mostProductiveDay: string;
  mostProductiveDayCount: number;
  leastProductiveDay: string;
  leastProductiveDayCount: number;
  averageCompletionRate: number;
  currentStreak: number;
  longestStreak: number;
}

export interface TaskVelocityMetrics {
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
}

export interface OverduePattern {
  type: 'project' | 'tag' | 'timeOfDay' | 'dayOfWeek';
  value: string;
  count: number;
  percentage: number;
}

export interface OverdueAnalysis {
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
  patterns: OverduePattern[];
  insights: {
    mostOverdueProject?: string;
    mostOverdueTag?: string;
    commonOverduePeriod?: string;
  };
}

/**
 * Recurring task analysis structures
 */
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

/**
 * Export format structures
 */
export interface TaskExport {
  format: 'json' | 'csv' | 'taskpaper';
  data: string | object;
  metadata: {
    exportDate: string;
    taskCount: number;
    format: string;
  };
}

export interface ProjectExport {
  format: 'json' | 'csv' | 'markdown';
  data: string | object;
  metadata: {
    exportDate: string;
    projectCount: number;
    format: string;
  };
}

/**
 * Script execution results
 */
export interface ListTasksScriptResult {
  tasks: Array<{
    id: string;
    name: string;
    completed: boolean;
    flagged: boolean;
    inInbox: boolean;
    note?: string;
    project?: string;
    projectId?: string;
    dueDate?: string;
    deferDate?: string;
    completionDate?: string;
    tags: string[];
    added?: string;
    repetitionRule?: RepetitionRule;
    recurringStatus?: {
      isRecurring: boolean;
      type: string;
      frequency?: string;
      confidence?: number;
      source?: string;
    };
  }>;
  metadata: {
    total_items: number;
    items_returned: number;
    limit_applied: number;
    has_more: boolean;
    query_time_ms: number;
    filters_applied: Record<string, unknown>;
    performance_note?: string;
  };
}

export interface CreateTaskScriptResult {
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
}

export interface UpdateTaskScriptResult {
  id: string;
  name: string;
  updated: true;
  changes: Record<string, unknown>;
}

export interface ListProjectsScriptResult {
  projects: Array<{
    id: string;
    name: string;
    status: string;
    flagged: boolean;
    dueDate?: string;
    deferDate?: string;
    completionDate?: string;
    note?: string;
    taskCount: number;
    availableTaskCount: number;
    remainingTaskCount: number;
    tags: string[];
    folder?: string;
    isSequential: boolean;
    isSingleAction: boolean;
  }>;
  metadata: {
    total: number;
    cached: boolean;
    query_time_ms: number;
  };
}

/**
 * Type guards for runtime validation
 */
export function isOmniFocusError(value: unknown): value is OmniFocusError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    (value as OmniFocusError).error === true &&
    'message' in value &&
    typeof (value as OmniFocusError).message === 'string'
  );
}

export function isRepetitionRule(value: unknown): value is RepetitionRule {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('unit' in value || 'ruleString' in value || 'method' in value)
  );
}

export function hasRepetitionUnit(rule: RepetitionRule): rule is RepetitionRule & { unit: string; steps: number } {
  return 'unit' in rule && 'steps' in rule;
}
