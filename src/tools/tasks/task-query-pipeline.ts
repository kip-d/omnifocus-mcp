/**
 * Task Query Pipeline - Reusable functions extracted from QueryTasksTool
 *
 * These functions form the composable pipeline for task queries:
 *   filter → build script → execute → parse → sort → project fields
 *
 * Used by both QueryTasksTool (legacy path) and OmniFocusReadTool (direct path).
 */

import type { OmniFocusTask } from '../../omnifocus/types.js';
import type { TaskFilter } from '../../contracts/filters.js';
import type { SortOption } from './filter-types.js';

// =============================================================================
// MODE-SPECIFIC FILTER AUGMENTATION
// =============================================================================

export type TaskQueryMode =
  | 'all'
  | 'inbox'
  | 'search'
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'available'
  | 'blocked'
  | 'flagged'
  | 'smart_suggest';

interface ModeOptions {
  daysAhead?: number;
}

/**
 * Declarative mode definitions.
 * Each mode maps to a factory that returns the filter properties to merge.
 * Modes not listed here (all, inbox, search) require no augmentation.
 */
type ModeDefinition = (options: ModeOptions) => Partial<TaskFilter>;

const MODE_DEFINITIONS: Partial<Record<TaskQueryMode, ModeDefinition>> = {
  overdue: () => ({
    completed: false,
    dueBefore: new Date().toISOString(),
    dueDateOperator: '<' as const,
  }),
  today: (opts) => {
    const dueSoonDays = opts.daysAhead || 3;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dueSoonCutoff = new Date(todayStart);
    dueSoonCutoff.setDate(dueSoonCutoff.getDate() + dueSoonDays);
    return {
      todayMode: true,
      dueBefore: dueSoonCutoff.toISOString(),
      completed: false,
      dropped: false,
      tagStatusValid: true,
      dueSoonDays,
    };
  },
  upcoming: (opts) => {
    const days = opts.daysAhead || 7;
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);
    return {
      completed: false,
      dueAfter: startDate.toISOString(),
      dueBefore: endDate.toISOString(),
    };
  },
  available: () => ({
    completed: false,
    available: true,
  }),
  blocked: () => ({
    completed: false,
    blocked: true,
  }),
  flagged: () => ({
    flagged: true,
  }),
  smart_suggest: () => ({
    completed: false,
  }),
};

/**
 * Augment a TaskFilter with mode-specific constraints.
 *
 * Uses declarative MODE_DEFINITIONS: each mode is a data entry that returns
 * the filter properties to merge. Modes not in the registry (all, inbox,
 * search) pass through unchanged.
 */
export function augmentFilterForMode(
  mode: TaskQueryMode | undefined,
  filter: TaskFilter,
  options: ModeOptions = {},
): TaskFilter {
  if (!mode) return { ...filter };

  const definition = MODE_DEFINITIONS[mode];
  if (!definition) return { ...filter };

  const augmentation = definition(options);
  const result = { ...filter, ...augmentation };

  // Special case: flagged mode defaults completed=false only when not explicitly set
  if (mode === 'flagged' && filter.completed === undefined) {
    result.completed = false;
  }

  return result;
}

/**
 * Get the default sort for a given mode.
 * Returns undefined if the mode has no default sort.
 */
export function getDefaultSort(mode: TaskQueryMode | undefined): SortOption[] | undefined {
  switch (mode) {
    case 'overdue':
    case 'upcoming':
      return [{ field: 'dueDate', direction: 'asc' }];
    case 'today':
      return [{ field: 'modified', direction: 'desc' }];
    default:
      return undefined;
  }
}

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

    // Always include id for task identity (even if not explicitly requested)
    projectedTask.id = task.id;

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

// =============================================================================
// TODAY MODE CATEGORY COUNTING
// =============================================================================

export interface TodayCategoryCounts {
  overdueCount: number;
  dueSoonCount: number;
  flaggedCount: number;
}

/**
 * Count today-mode tasks by their `reason` field.
 *
 * Tasks returned by the today-mode script include a `reason` field
 * ('overdue' | 'due_soon' | 'flagged') indicating why they appear.
 * This must run BEFORE field projection, since `reason` may not be
 * in the user's requested fields.
 */
export function countTodayCategories(tasks: OmniFocusTask[]): TodayCategoryCounts {
  let overdueCount = 0,
    dueSoonCount = 0,
    flaggedCount = 0;
  for (const task of tasks) {
    const reason = (task as unknown as Record<string, unknown>).reason;
    if (reason === 'overdue') overdueCount++;
    else if (reason === 'due_soon') dueSoonCount++;
    else if (reason === 'flagged') flaggedCount++;
  }
  return { overdueCount, dueSoonCount, flaggedCount };
}
