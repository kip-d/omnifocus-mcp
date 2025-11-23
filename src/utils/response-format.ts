/**
 * Enhanced response format utilities for OmniFocus MCP tools v1.16.0
 * Optimized for LLM processing speed and user experience
 */

// Type interfaces for OmniFocus data structures
interface OmniFocusTask {
  id?: string;
  name?: string;
  completed?: boolean;
  flagged?: boolean;
  status?: string;
  dueDate?: string | Date | null;
  project?: string | null;
  [key: string]: unknown;
}

interface OmniFocusProject {
  id?: string;
  name?: string;
  status?: string;
  nextReviewDate?: string | Date | null;
  modifiedDate?: string | Date | null;
  [key: string]: unknown;
}

// Type guard functions
function isValidDateValue(value: unknown): value is string | Date {
  return typeof value === 'string' || value instanceof Date;
}

function isValidStringValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export interface TaskSummary extends Record<string, unknown> {
  total_count: number;
  returned_count: number;
  breakdown?: {
    overdue?: number;
    due_today?: number;
    due_tomorrow?: number;
    upcoming?: number;
    flagged?: number;
    completed?: number;
    available?: number;
    blocked?: number;
  };
  key_insights?: string[];
  preview?: Array<{
    id: string;
    name: string;
    dueDate?: string;
    project?: string;
    flagged?: boolean;
  }>;
}

export interface ProjectSummary extends Record<string, unknown> {
  total_projects: number;
  active: number;
  on_hold?: number;
  completed?: number;
  dropped?: number;
  needs_review?: number;
  overdue_reviews?: number;
  key_insight?: string;
  bottlenecks?: string[];
}

export interface AnalyticsSummary extends Record<string, unknown> {
  analysis_type: string;
  total_items_analyzed: number;
  time_period?: string;
  key_findings: string[];
  top_issues?: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  recommendations?: string[];
  health_score?: number;
}

export interface StandardMetadataV2 {
  // Operation info
  operation: string;
  timestamp: string;

  // Performance/source info
  from_cache: boolean;
  query_time_ms?: number;

  // Pagination/count info
  total_count?: number;
  returned_count?: number;
  has_more?: boolean;

  // Query info
  query_type?: string;
  filters_applied?: Record<string, unknown>;

  // Operation-specific metadata
  [key: string]: string | number | boolean | undefined | null | Record<string, unknown> | unknown[];
}

export interface StandardResponseV2<T> {
  // Status
  success: boolean;

  // Quick summary for LLM (always first for fastest processing)
  summary?: TaskSummary | ProjectSummary | AnalyticsSummary;

  // Main payload (may be truncated/limited)
  data: T;

  // Full metadata with performance metrics
  metadata: StandardMetadataV2;

  // Error handling
  error?: {
    code: string;
    message: string;
    suggestion?: string; // Help LLM fix the issue
    details?: unknown;
  };
}

/**
 * Generate enhanced task summary with insights and preview
 */
export function generateTaskSummary(tasks: unknown[], limit: number = 25): TaskSummary {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const summary: TaskSummary = {
    total_count: tasks.length,
    returned_count: Math.min(tasks.length, limit),
    breakdown: {
      overdue: 0,
      due_today: 0,
      due_tomorrow: 0,
      flagged: 0,
      completed: 0,
      available: 0,
      blocked: 0,
    },
    key_insights: [],
    preview: [],
  };

  let mostOverdueTask: OmniFocusTask | null = null;
  let mostOverdueDays = 0;

  for (const taskItem of tasks) {
    // Type assertion for OmniFocus task data from scripts
    const task = taskItem as OmniFocusTask;

    // Count by status
    if (task.completed) summary.breakdown!.completed = (summary.breakdown!.completed || 0) + 1;
    if (task.flagged) summary.breakdown!.flagged = (summary.breakdown!.flagged || 0) + 1;
    if (task.status === 'available') summary.breakdown!.available = (summary.breakdown!.available || 0) + 1;
    if (task.status === 'blocked') summary.breakdown!.blocked = (summary.breakdown!.blocked || 0) + 1;

    // Count by due date
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);

      if (dueDate < now && !task.completed) {
        summary.breakdown!.overdue = (summary.breakdown!.overdue || 0) + 1;
        const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (overdueDays > mostOverdueDays) {
          mostOverdueDays = overdueDays;
          mostOverdueTask = task;
        }
      } else if (dueDate <= todayEnd) {
        summary.breakdown!.due_today = (summary.breakdown!.due_today || 0) + 1;
      } else if (dueDate <= tomorrowEnd) {
        summary.breakdown!.due_tomorrow = (summary.breakdown!.due_tomorrow || 0) + 1;
      }
    }
  }

  // Generate key insights
  const insights: string[] = [];

  // Overdue insight
  if (summary.breakdown!.overdue && summary.breakdown!.overdue > 0) {
    if (mostOverdueTask) {
      insights.push(`${summary.breakdown!.overdue} tasks overdue, oldest: "${mostOverdueTask.name}" (${mostOverdueDays} days)`);
    } else {
      insights.push(`${summary.breakdown!.overdue} task${summary.breakdown!.overdue > 1 ? 's' : ''} overdue`);
    }
  }

  // Pattern detection for bottlenecks
  const projectCounts: Record<string, number> = {};
  for (const taskItem of tasks) {
    const task = taskItem as OmniFocusTask;
    if (isValidStringValue(task.project) && !task.completed && isValidDateValue(task.dueDate)) {
      const dueDate = new Date(task.dueDate);
      if (dueDate < now) {
        projectCounts[task.project] = (projectCounts[task.project] || 0) + 1;
      }
    }
  }

  // Find project with most overdue tasks
  const projectBottlenecks = Object.entries(projectCounts)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  if (projectBottlenecks.length > 0) {
    const [projectName, count] = projectBottlenecks[0];
    insights.push(`${projectName} has ${count} overdue tasks (potential bottleneck)`);
  }

  // Today's priority
  if (summary.breakdown!.due_today && summary.breakdown!.due_today > 0) {
    insights.push(`${summary.breakdown!.due_today} task${summary.breakdown!.due_today > 1 ? 's' : ''} due today`);
  }

  // Blocked tasks warning
  if (summary.breakdown!.blocked && summary.breakdown!.blocked > 5) {
    insights.push(`${summary.breakdown!.blocked} tasks blocked - review dependencies`);
  }

  summary.key_insights = insights.slice(0, 3); // Limit to 3 insights

  // Generate preview of most important tasks
  const previewTasks = tasks
    .map(item => item as OmniFocusTask)
    .filter(t => !t.completed)
    .sort((a, b) => {
      // Sort by: overdue first, then due today, then flagged
      const aDate = isValidDateValue(a.dueDate) ? new Date(a.dueDate) : null;
      const bDate = isValidDateValue(b.dueDate) ? new Date(b.dueDate) : null;

      if (aDate && bDate) {
        if (aDate < now && bDate >= now) return -1;
        if (bDate < now && aDate >= now) return 1;
        return aDate.getTime() - bDate.getTime();
      }
      if (aDate && !bDate) return -1;
      if (bDate && !aDate) return 1;
      if (a.flagged && !b.flagged) return -1;
      if (b.flagged && !a.flagged) return 1;
      return 0;
    })
    .slice(0, 3)
    .map(t => ({
      id: t.id || '',
      name: t.name || '',
      dueDate: t.dueDate && t.dueDate !== null ? (typeof t.dueDate === 'string' ? t.dueDate : t.dueDate.toISOString()) : undefined,
      project: t.project || undefined,
      flagged: t.flagged,
    }));

  if (previewTasks.length > 0) {
    summary.preview = previewTasks;
  }

  return summary;
}

/**
 * Generate enhanced project summary with insights
 */
export function generateProjectSummary(projects: unknown[]): ProjectSummary {
  const summary: ProjectSummary = {
    total_projects: projects.length,
    active: 0,
    on_hold: 0,
    completed: 0,
    dropped: 0,
    needs_review: 0,
    overdue_reviews: 0,
    bottlenecks: [],
  };

  let mostOverdueReview: OmniFocusProject | null = null;
  let mostOverdueDays = 0;
  const now = new Date();

  for (const projectItem of projects) {
    // Type assertion for OmniFocus project data from scripts
    const project = projectItem as OmniFocusProject;

    // Count by status
    switch (project.status) {
      case 'active': summary.active = (summary.active || 0) + 1; break;
      case 'on-hold':
      case 'onHold': summary.on_hold = (summary.on_hold || 0) + 1; break;
      case 'done':
      case 'completed': summary.completed = (summary.completed || 0) + 1; break;
      case 'dropped': summary.dropped = (summary.dropped || 0) + 1; break;
    }

    // Check for review
    if (isValidDateValue(project.nextReviewDate)) {
      const reviewDate = new Date(project.nextReviewDate);
      if (reviewDate < now) {
        summary.needs_review = (summary.needs_review || 0) + 1;
        const overdueDays = Math.floor((now.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24));
        if (overdueDays > 7) {
          summary.overdue_reviews = (summary.overdue_reviews || 0) + 1;
        }
        if (overdueDays > mostOverdueDays) {
          mostOverdueDays = overdueDays;
          mostOverdueReview = project;
        }
      }
    }
  }

  // Generate insights and detect bottlenecks
  const bottlenecks: string[] = [];

  if (summary.overdue_reviews && summary.overdue_reviews > 0) {
    bottlenecks.push(`${summary.overdue_reviews} projects haven't been reviewed in 7+ days`);
  }

  if (mostOverdueReview && mostOverdueDays > 30) {
    bottlenecks.push(`"${mostOverdueReview.name}" hasn't been reviewed in ${mostOverdueDays} days`);
  }

  // Detect stalled projects (active but no recent activity)
  const stalledProjects = projects
    .map(item => item as OmniFocusProject)
    .filter(p => {
      if (p.status !== 'active') return false;
      if (!isValidDateValue(p.modifiedDate)) return false;
      const daysSinceModified = Math.floor((now.getTime() - new Date(p.modifiedDate).getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceModified > 14;
    });

  if (stalledProjects.length > 0) {
    bottlenecks.push(`${stalledProjects.length} active projects with no activity in 14+ days`);
  }

  summary.bottlenecks = bottlenecks.slice(0, 3);

  // Generate key insight
  if (summary.needs_review && summary.needs_review > 0) {
    summary.key_insight = `${summary.needs_review} project${summary.needs_review > 1 ? 's' : ''} need review`;
  } else if (summary.active) {
    summary.key_insight = `${summary.active} active project${summary.active > 1 ? 's' : ''}`;
  }

  return summary;
}

/**
 * Create enhanced success response with summary
 */
export function createSuccessResponseV2<T>(
  operation: string,
  data: T,
  summary?: TaskSummary | ProjectSummary | AnalyticsSummary,
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<T> {
  return {
    success: true,
    summary,
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      optimization: 'summary_first_v2',
      ...metadata,
    },
  };
}

/**
 * Create analytics response with insights
 */
export function createAnalyticsResponseV2<T>(
  operation: string,
  data: T,
  analysisType: string,
  keyFindings: string[],
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<T> {
  const summary: AnalyticsSummary = {
    analysis_type: analysisType,
    total_items_analyzed: 0,
    key_findings: keyFindings,
  };

  // Extract item count from data if available
  if (data && typeof data === 'object') {
    // Analytics data structure from OmniFocus scripts is untyped
    const dataObj = data as {
      stats?: {
        overdueTasks?: unknown[];
        totalTasks?: number;
      };
      velocity?: {
        tasksCompleted?: number;
      };
    };
    if (dataObj.stats?.overdueTasks?.length) {
      summary.total_items_analyzed = dataObj.stats.overdueTasks.length;
    } else if (dataObj.velocity?.tasksCompleted) {
      summary.total_items_analyzed = dataObj.velocity.tasksCompleted;
    } else if (dataObj.stats?.totalTasks) {
      summary.total_items_analyzed = dataObj.stats.totalTasks;
    }
  }

  return createSuccessResponseV2(operation, data, summary, metadata);
}

/**
 * Create enhanced error response with suggestions
 */
export function createErrorResponseV2<T = unknown>(
  operation: string,
  errorCode: string,
  message: string,
  suggestion?: string,
  details?: unknown,
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<T> {
  return {
    success: false,
    data: {} as T,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
    error: {
      code: errorCode,
      message,
      suggestion,
      details,
    },
  };
}

/**
 * Create enhanced list response with automatic summary
 */
export function createListResponseV2<T>(
  operation: string,
  items: T[],
  itemType: 'tasks' | 'projects' | 'other',
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<{ items: T[]; preview?: T[] }> {
  // Generate summary based on item type
  let summary: TaskSummary | ProjectSummary | undefined;
  if (itemType === 'tasks') {
    summary = generateTaskSummary(items as unknown[]);
  } else if (itemType === 'projects') {
    summary = generateProjectSummary(items as unknown[]);
  }

  // Create preview (first 5 items for quick processing)
  const preview = items.slice(0, 5);

  return {
    success: true,
    summary,
    data: {
      items,
      preview,
    },
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      total_count: items.length,
      returned_count: items.length,
      ...metadata,
    },
  };
}

import { CHARACTER_LIMIT } from './constants.js';

export interface TruncationInfo {
  truncated: boolean;
  originalLength?: number;
  truncatedLength?: number;
  message?: string;
}

export function truncateResponse<T>(
  data: T,
  limit: number = CHARACTER_LIMIT
): { data: T; truncation?: TruncationInfo } {
  const serialized = JSON.stringify(data);

  if (serialized.length <= limit) {
    return { data };
  }

  // For arrays, truncate by removing items from the end
  if (Array.isArray(data)) {
    const truncatedData = data.slice(0, Math.max(1, Math.floor(data.length / 2)));
    return {
      data: truncatedData as T,
      truncation: {
        truncated: true,
        originalLength: data.length,
        truncatedLength: truncatedData.length,
        message: `Response truncated from ${data.length} to ${truncatedData.length} items. Use 'limit' or 'offset' parameters to see more results.`
      }
    };
  }

  // For strings, truncate with ellipsis
  if (typeof data === 'string') {
    return {
      data: (data.slice(0, limit - 100) + '\n\n[... truncated ...]') as T,
      truncation: {
        truncated: true,
        originalLength: data.length,
        truncatedLength: limit,
        message: 'Response truncated. Use filters to reduce result size.'
      }
    };
  }

  // For objects, return as-is (already limited by other mechanisms)
  return { data };
}

/**
 * Create task-specific response with insights
 */
export function createTaskResponseV2<T>(
  operation: string,
  tasks: T[],
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<{ tasks: T[]; preview?: T[] }> {
  const summary = generateTaskSummary(tasks as unknown[]);

  // Apply truncation
  const { data: truncatedTasks, truncation } = truncateResponse(tasks);

  return {
    success: true,
    summary,
    data: {
      tasks: truncatedTasks,
      preview: tasks.slice(0, 5),
    },
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      total_count: tasks.length,
      returned_count: truncatedTasks.length,
      ...(truncation && {
        truncated: truncation.truncated,
        truncation_message: truncation.message
      }),
      ...metadata,
    },
  };
}

/**
 * Helper to measure operation timing
 */
export class OperationTimerV2 {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  toMetadata(): { query_time_ms: number } {
    return { query_time_ms: this.getElapsedMs() };
  }
}

/**
 * Input normalization helpers
 */
export function normalizeDateInput(
  input: string | Date | null | undefined,
  context: 'due' | 'defer' | 'completion' | 'generic' = 'generic',
): Date | null {
  if (!input) return null;

  // Handle Date objects
  if (input instanceof Date) return input;

  // Handle common natural language inputs
  const lowerInput = String(input).toLowerCase().trim();
  const now = new Date();

  // Determine default time based on context
  const getDefaultTime = (baseDate: Date, ctx: typeof context = context) => {
    if (ctx === 'defer') {
      baseDate.setHours(8, 0, 0, 0); // 8am for deferrals
    } else if (ctx === 'due') {
      baseDate.setHours(17, 0, 0, 0); // 5pm for due dates
    } else {
      baseDate.setHours(12, 0, 0, 0); // Noon for generic/completion
    }
    return baseDate;
  };

  switch (lowerInput) {
    case 'today':
      return getDefaultTime(new Date(now));
    case 'tomorrow':
      {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return getDefaultTime(tomorrow);
      }
    case 'next week':
      {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return getDefaultTime(nextWeek);
      }
    case 'next monday':
      {
        const nextMonday = new Date(now);
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
        nextMonday.setHours(9, 0, 0, 0); // Keep 9am for Monday
        return nextMonday;
      }
    case 'end of week':
    case 'friday':
      {
        const friday = new Date(now);
        const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
        friday.setDate(friday.getDate() + daysUntilFriday);
        friday.setHours(17, 0, 0, 0); // Keep 5pm for Friday
        return friday;
      }
  }

  // Check if it's a plain YYYY-MM-DD date (no time specified)
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(String(input).trim())) {
    // Parse with context-appropriate default time
    const defaultTime = context === 'defer' ? '08:00' : context === 'due' ? '17:00' : '12:00';
    const parsed = new Date(input + ' ' + defaultTime);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Try to parse as date string (including YYYY-MM-DD HH:mm format)
  try {
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Fall through to null
  }

  return null;
}

export function normalizeBooleanInput(input: string | boolean | null | undefined): boolean | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'boolean') return input;

  const lowerInput = String(input).toLowerCase().trim();
  if (lowerInput === 'true' || lowerInput === 'yes' || lowerInput === '1') return true;
  if (lowerInput === 'false' || lowerInput === 'no' || lowerInput === '0') return false;

  return null;
}

export function normalizeStringInput(input: string | null | undefined): string | null {
  if (!input || input === 'null' || input === 'undefined' || input === '""' || input === "''") {
    return null;
  }
  return String(input).trim();
}
