/**
 * Enhanced response format utilities for OmniFocus MCP tools v1.16.0
 * Optimized for LLM processing speed and user experience
 */

export interface TaskSummary extends Record<string, unknown> {
  total: number;
  overdue?: number;
  dueToday?: number;
  dueTomorrow?: number;
  flagged?: number;
  completed?: number;
  available?: number;
  blocked?: number;
  key_insight?: string;
  most_urgent?: string;
  next_action?: string;
}

export interface ProjectSummary extends Record<string, unknown> {
  total: number;
  active?: number;
  onHold?: number;
  completed?: number;
  dropped?: number;
  needingReview?: number;
  key_insight?: string;
  most_overdue_review?: string;
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
  summary?: string | TaskSummary | ProjectSummary;
  
  // Key insights (1-3 bullet points)
  insights?: string[];
  
  // Main payload (may be truncated/limited)
  data: T;
  
  // Full metadata
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
 * Generate task summary from task list
 */
export function generateTaskSummary(tasks: any[]): TaskSummary {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  
  const summary: TaskSummary = {
    total: tasks.length,
    overdue: 0,
    dueToday: 0,
    dueTomorrow: 0,
    flagged: 0,
    completed: 0,
    available: 0,
    blocked: 0,
  };
  
  let mostOverdueTask: any = null;
  let mostOverdueDays = 0;
  
  for (const task of tasks) {
    // Count by status
    if (task.completed) summary.completed = (summary.completed || 0) + 1;
    if (task.flagged) summary.flagged = (summary.flagged || 0) + 1;
    if (task.status === 'available') summary.available = (summary.available || 0) + 1;
    if (task.status === 'blocked') summary.blocked = (summary.blocked || 0) + 1;
    
    // Count by due date
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      
      if (dueDate < now && !task.completed) {
        summary.overdue = (summary.overdue || 0) + 1;
        const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (overdueDays > mostOverdueDays) {
          mostOverdueDays = overdueDays;
          mostOverdueTask = task;
        }
      } else if (dueDate <= todayEnd) {
        summary.dueToday = (summary.dueToday || 0) + 1;
      } else if (dueDate <= tomorrowEnd) {
        summary.dueTomorrow = (summary.dueTomorrow || 0) + 1;
      }
    }
  }
  
  // Generate key insights
  if (summary.overdue && summary.overdue > 0) {
    summary.key_insight = `${summary.overdue} task${summary.overdue > 1 ? 's' : ''} overdue`;
    if (mostOverdueTask) {
      summary.most_urgent = `"${mostOverdueTask.name}" (${mostOverdueDays} days overdue)`;
    }
  } else if (summary.dueToday && summary.dueToday > 0) {
    summary.key_insight = `${summary.dueToday} task${summary.dueToday > 1 ? 's' : ''} due today`;
  } else if (summary.available && summary.available > 0) {
    summary.key_insight = `${summary.available} task${summary.available > 1 ? 's' : ''} available to work on`;
  }
  
  // Find next action
  const nextAction = tasks.find(t => !t.completed && t.status === 'available' && t.flagged);
  if (nextAction) {
    summary.next_action = nextAction.name;
  } else {
    const firstAvailable = tasks.find(t => !t.completed && t.status === 'available');
    if (firstAvailable) {
      summary.next_action = firstAvailable.name;
    }
  }
  
  return summary;
}

/**
 * Generate project summary from project list
 */
export function generateProjectSummary(projects: any[]): ProjectSummary {
  const summary: ProjectSummary = {
    total: projects.length,
    active: 0,
    onHold: 0,
    completed: 0,
    dropped: 0,
    needingReview: 0,
  };
  
  let mostOverdueReview: any = null;
  let mostOverdueDays = 0;
  const now = new Date();
  
  for (const project of projects) {
    // Count by status
    switch (project.status) {
      case 'active': summary.active = (summary.active || 0) + 1; break;
      case 'on-hold': summary.onHold = (summary.onHold || 0) + 1; break;
      case 'done': summary.completed = (summary.completed || 0) + 1; break;
      case 'dropped': summary.dropped = (summary.dropped || 0) + 1; break;
    }
    
    // Check for review
    if (project.nextReviewDate) {
      const reviewDate = new Date(project.nextReviewDate);
      if (reviewDate < now) {
        summary.needingReview = (summary.needingReview || 0) + 1;
        const overdueDays = Math.floor((now.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24));
        if (overdueDays > mostOverdueDays) {
          mostOverdueDays = overdueDays;
          mostOverdueReview = project;
        }
      }
    }
  }
  
  // Generate insights
  if (summary.needingReview && summary.needingReview > 0) {
    summary.key_insight = `${summary.needingReview} project${summary.needingReview > 1 ? 's' : ''} need review`;
    if (mostOverdueReview) {
      summary.most_overdue_review = `"${mostOverdueReview.name}" (${mostOverdueDays} days overdue for review)`;
    }
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
  summary?: string | TaskSummary | ProjectSummary,
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
      ...metadata,
    },
  };
}

/**
 * Create enhanced error response with suggestions
 */
export function createErrorResponseV2<T = never>(
  operation: string,
  errorCode: string,
  message: string,
  suggestion?: string,
  details?: unknown,
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<T> {
  return {
    success: false,
    data: null as T,
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
    summary = generateTaskSummary(items as any[]);
  } else if (itemType === 'projects') {
    summary = generateProjectSummary(items as any[]);
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

/**
 * Create task-specific response with insights
 */
export function createTaskResponseV2<T>(
  operation: string,
  tasks: T[],
  metadata: Partial<StandardMetadataV2> = {},
): StandardResponseV2<{ tasks: T[]; preview?: T[] }> {
  const summary = generateTaskSummary(tasks as any[]);
  const insights: string[] = [];
  
  // Generate insights
  if (summary.overdue && summary.overdue > 0) {
    insights.push(`You have ${summary.overdue} overdue task${summary.overdue > 1 ? 's' : ''}`);
  }
  if (summary.dueToday && summary.dueToday > 0) {
    insights.push(`${summary.dueToday} task${summary.dueToday > 1 ? 's are' : ' is'} due today`);
  }
  if (summary.next_action) {
    insights.push(`Next action: "${summary.next_action}"`);
  }
  
  return {
    success: true,
    summary,
    insights: insights.length > 0 ? insights : undefined,
    data: {
      tasks,
      preview: tasks.slice(0, 5),
    },
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      total_count: tasks.length,
      returned_count: tasks.length,
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
export function normalizeDateInput(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  
  // Handle Date objects
  if (input instanceof Date) return input;
  
  // Handle common natural language inputs
  const lowerInput = String(input).toLowerCase().trim();
  const now = new Date();
  
  switch (lowerInput) {
    case 'today':
      return new Date(now.setHours(17, 0, 0, 0)); // Default to 5pm
    case 'tomorrow':
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(17, 0, 0, 0);
      return tomorrow;
    case 'next week':
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(17, 0, 0, 0);
      return nextWeek;
    case 'next monday':
      const nextMonday = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      nextMonday.setHours(9, 0, 0, 0);
      return nextMonday;
    case 'end of week':
    case 'friday':
      const friday = new Date(now);
      const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
      friday.setDate(friday.getDate() + daysUntilFriday);
      friday.setHours(17, 0, 0, 0);
      return friday;
  }
  
  // Try to parse as date string
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