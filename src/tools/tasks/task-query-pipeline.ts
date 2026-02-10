/**
 * Task Query Pipeline - Reusable functions extracted from QueryTasksTool
 *
 * These functions form the composable pipeline for task queries:
 *   filter → build script → execute → parse → sort → project fields
 *
 * Used by both QueryTasksTool (legacy path) and OmniFocusReadTool (direct path).
 */

import type { OmniFocusTask } from '../../omnifocus/types.js';
import type { SortOption } from './filter-types.js';

// =============================================================================
// TASK PARSING
// =============================================================================

/**
 * Parse raw script output into typed OmniFocusTask objects.
 * Converts date strings to Date objects for date fields.
 */
export function parseTasks(tasks: unknown[]): OmniFocusTask[] {
  if (!tasks || !Array.isArray(tasks)) {
    return [];
  }
  return tasks.map((task) => {
    const t = task as {
      dueDate?: string | Date;
      deferDate?: string | Date;
      completionDate?: string | Date;
      added?: string | Date;
      modified?: string | Date;
      dropDate?: string | Date;
      parentTaskId?: string;
      parentTaskName?: string;
      inInbox?: boolean;
      [key: string]: unknown;
    };
    return {
      ...t,
      dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
      deferDate: t.deferDate ? new Date(t.deferDate) : undefined,
      completionDate: t.completionDate ? new Date(t.completionDate) : undefined,
      added: t.added ? new Date(t.added) : undefined,
      modified: t.modified ? new Date(t.modified) : undefined,
      dropDate: t.dropDate ? new Date(t.dropDate) : undefined,
      parentTaskId: t.parentTaskId,
      parentTaskName: t.parentTaskName,
      inInbox: t.inInbox,
    } as unknown as OmniFocusTask;
  });
}

// =============================================================================
// SORTING
// =============================================================================

/**
 * Sort tasks based on provided sort options.
 *
 * Applies multi-level sorting in the order specified.
 * Null/undefined values are pushed to the end.
 */
export function sortTasks(tasks: OmniFocusTask[], sortOptions?: SortOption[]): OmniFocusTask[] {
  if (!sortOptions || sortOptions.length === 0) {
    return tasks;
  }

  return [...tasks].sort((a, b) => {
    for (const option of sortOptions) {
      const aValue = (a as unknown as Record<string, unknown>)[option.field];
      const bValue = (b as unknown as Record<string, unknown>)[option.field];

      // Handle null/undefined values (push to end)
      if (aValue === null || aValue === undefined) {
        if (bValue === null || bValue === undefined) continue;
        return 1;
      }
      if (bValue === null || bValue === undefined) {
        return -1;
      }

      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
        comparison = aValue === bValue ? 0 : aValue ? -1 : 1;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      } else {
        let aStr: string;
        let bStr: string;
        if (typeof aValue === 'object' && aValue !== null) {
          aStr = JSON.stringify(aValue);
        } else {
          aStr = String(aValue as string | number | boolean);
        }
        if (typeof bValue === 'object' && bValue !== null) {
          bStr = JSON.stringify(bValue);
        } else {
          bStr = String(bValue as string | number | boolean);
        }
        comparison = aStr.localeCompare(bStr);
      }

      if (comparison !== 0) {
        return option.direction === 'desc' ? -comparison : comparison;
      }
    }

    return 0;
  });
}

// =============================================================================
// FIELD PROJECTION
// =============================================================================

/**
 * Project task fields based on user selection for performance optimization.
 * Always includes 'id' if any fields are selected.
 */
export function projectFields(tasks: OmniFocusTask[], selectedFields?: string[]): OmniFocusTask[] {
  if (!selectedFields || selectedFields.length === 0) {
    return tasks;
  }

  return tasks.map((task) => {
    const projectedTask: Partial<OmniFocusTask> = {};

    if (selectedFields.includes('id') || !selectedFields.length) {
      projectedTask.id = task.id;
    }

    selectedFields.forEach((field) => {
      if (field in task) {
        const typedField = field as keyof OmniFocusTask;
        (projectedTask as Record<string, unknown>)[field] = task[typedField];
      }
    });

    return projectedTask as OmniFocusTask;
  });
}

// =============================================================================
// SMART SUGGEST SCORING
// =============================================================================

/**
 * Score and rank tasks for smart suggestions.
 * Returns top N tasks sorted by priority score.
 *
 * Scoring algorithm:
 * - Overdue: +100 base, +10 per day overdue (capped at 300)
 * - Due today: +80
 * - Flagged: +50
 * - Available: +30
 * - Quick win (≤15 min): +20
 */
export function scoreForSmartSuggest(tasks: OmniFocusTask[], limit: number): OmniFocusTask[] {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const scoredTasks = tasks.map((task) => {
    let score = 0;

    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const isDueToday = dueDate.toDateString() === now.toDateString();
      if (dueDate < now) {
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        score += 100 + Math.min(daysOverdue * 10, 200);
      } else if (isDueToday || dueDate <= todayEnd) {
        score += 80;
      }
    }

    if (task.flagged) score += 50;
    if (task.available) score += 30;
    if (task.estimatedMinutes && task.estimatedMinutes <= 15) score += 20;

    return { ...task, _score: score };
  });

  let suggestedTasks = scoredTasks
    .filter((t) => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...task }) => task);

  // Ensure at least one due-today task is surfaced
  const dueTodayCandidate = tasks.find((t) => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString());
  if (dueTodayCandidate) {
    const alreadyIncluded = suggestedTasks.some((t) => t.id === dueTodayCandidate.id);
    if (!alreadyIncluded) {
      if (suggestedTasks.length < limit) {
        suggestedTasks.push(dueTodayCandidate);
      } else if (suggestedTasks.length > 0) {
        suggestedTasks[suggestedTasks.length - 1] = dueTodayCandidate;
      }
    }
  }

  return suggestedTasks as OmniFocusTask[];
}
