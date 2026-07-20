/**
 * Task Query Pipeline - Reusable functions for task query processing
 *
 * These functions form the composable pipeline for task queries:
 *   filter → build script → execute → parse → sort → project fields
 *
 * Used by OmniFocusReadTool (unified read path).
 */

import type { OmniFocusTask, ProjectedTask } from '../../omnifocus/types.js';
import type { TaskFilter } from '../../contracts/filters.js';
import type { SortOption } from './filter-types.js';
import type { TaskFieldEnum } from '../unified/schemas/read-schema.js';
import type { z } from 'zod';

// OMN-222: compile-time guard closing the `as keyof OmniFocusTask` masking gap
// below. If a future TaskFieldEnum member (the set callers can request via
// `fields:[...]`) is added without a matching OmniFocusTask interface member,
// this line fails to build instead of silently widening the cast at runtime.
// One-directional on purpose: OmniFocusTask legitimately carries members
// (id, name, completed, ...) that aren't user-selectable, so the reverse
// direction is expected to have extras.
type _TaskFieldsAreKnownKeys =
  Exclude<z.output<typeof TaskFieldEnum>, keyof OmniFocusTask> extends never ? true : never;
const _taskFieldsAreKnownKeys: _TaskFieldsAreKnownKeys = true;
void _taskFieldsAreKnownKeys;

// OMN-232: today mode's category-bucketing fields live outside TaskFieldEnum
// (they're spliced into scriptFields by OmniFocusReadTool per query mode, not
// selected by the caller), so the guard above can't see them. This is the single
// source of truth for that splice: OmniFocusReadTool spreads MODE_INJECTED_FIELDS
// instead of repeating the literals, and the `satisfies` clause fails the build
// if a field is added here that isn't on OmniFocusTask — closing the drift gap
// the old `_modeInjectedFieldsAreKnownKeys` stopgap only detected after the fact.
export const MODE_INJECTED_FIELDS = ['reason', 'daysOverdue', 'modified'] as const satisfies ReadonlyArray<
  keyof OmniFocusTask
>;

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
  | 'smart_suggest'
  | 'forecast_past'; // OMN-133: rewritten to a single OR query in OmniFocusReadTool.executeForecastPast, not a MODE_DEFINITIONS entry

interface ModeOptions {
  daysAhead?: number;
}

/**
 * Declarative mode definitions.
 * Each mode maps to a filter factory and optional default sort.
 * Modes not listed here (all, inbox, search) require no augmentation.
 */
interface ModeDefinition {
  augment: (options: ModeOptions) => Partial<TaskFilter>;
  defaultSort?: SortOption[];
}

const MODE_DEFINITIONS: Partial<Record<TaskQueryMode, ModeDefinition>> = {
  overdue: {
    augment: () => ({
      completed: false,
      dropped: false,
      dueBefore: new Date().toISOString(),
      dueDateOperator: '<' as const,
    }),
    defaultSort: [{ field: 'dueDate', direction: 'asc' }],
  },
  today: {
    augment: (opts) => {
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
    defaultSort: [{ field: 'modified', direction: 'desc' }],
  },
  upcoming: {
    augment: (opts) => {
      const days = opts.daysAhead || 7;
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);
      return {
        completed: false,
        dropped: false,
        dueAfter: startDate.toISOString(),
        dueBefore: endDate.toISOString(),
      };
    },
    defaultSort: [{ field: 'dueDate', direction: 'asc' }],
  },
  // OMN-130: available:true now emits a 4-status membership check (Available, DueSoon,
  // Next, Overdue) — so mode:'available' returns all actionable-now tasks, including
  // overdue and due-soon tasks. Previously only Task.Status.Available tasks were returned.
  // BEHAVIOR CHANGE: overdue/due-soon/next tasks now appear in mode:'available' results.
  available: {
    augment: () => ({
      completed: false,
      dropped: false,
      available: true,
    }),
  },
  blocked: {
    augment: () => ({
      completed: false,
      dropped: false,
      blocked: true,
    }),
  },
  flagged: {
    augment: () => ({
      flagged: true,
    }),
  },
  // OMN-130: smart_suggest surfaces available next actions, NOT urgency-ranked tasks.
  // OMN-259: the screen-not-ranking posture is now the public contract — the
  // internal score selects a shortlist, and each returned task carries
  // screen_reasons so the caller re-ranks with the GTD engage criteria
  // (context → time → energy → priority). The old in-code-only "not a
  // definitive priority ranking" disclaimer is user-facing in the tool
  // description. Do NOT reintroduce a server-side priority verdict.
  smart_suggest: {
    augment: () => ({
      completed: false,
      dropped: false,
    }),
  },
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

  const augmentation = definition.augment(options);
  const result = { ...augmentation, ...filter };

  // Special case: flagged mode defaults completed=false and dropped=false only when not explicitly set
  if (mode === 'flagged' && filter.completed === undefined) {
    result.completed = false;
  }
  if (mode === 'flagged' && filter.dropped === undefined) {
    result.dropped = false;
  }

  return result;
}

/**
 * Get the default sort for a given mode.
 * Returns undefined if the mode has no default sort.
 */
export function getDefaultSort(mode: TaskQueryMode | undefined): SortOption[] | undefined {
  if (!mode) return undefined;
  return MODE_DEFINITIONS[mode]?.defaultSort;
}

// =============================================================================
// TASK PARSING
// =============================================================================

/**
 * Parse raw script output into typed OmniFocusTask objects.
 * Converts date strings to Date objects for date fields.
 */
// OMN-88: date fields the OmniJS field-projection step emits.
// Pre-OMN-88 parseTasks spread the input then unconditionally overrode each
// of these with `t.k ? Date : null`, so ABSENT input keys came back as
// `null` — defeating field-projection's payload reduction and silently
// breaking the "absent (not requested) vs null (explicitly cleared)"
// distinction the OMN-80/-82 comments claimed. We now only set a key when
// it was present in the input.
const TASK_DATE_FIELDS = ['dueDate', 'deferDate', 'completionDate', 'added', 'modified', 'dropDate'] as const;

export function parseTasks(tasks: unknown[]): OmniFocusTask[] {
  if (!tasks || !Array.isArray(tasks)) {
    return [];
  }
  return tasks.map((task) => {
    // OMN-82 / OMN-88: date fields come through as `string | null` from the
    // OmniJS projection. `null` means "explicitly cleared in OmniFocus"; an
    // absent key means "field not requested by the script." parseTasks now
    // honors both: strings convert to Date objects, nulls pass through as
    // nulls, absent keys stay absent. Truthy-check consumers
    // (`if (t.dueDate)`) are unaffected.
    const t = task as Record<string, unknown>;
    const result: Record<string, unknown> = { ...t };
    for (const field of TASK_DATE_FIELDS) {
      if (field in t) {
        const raw = t[field];
        // Strict null/undefined check (not truthy): the input type is
        // `string | null`, but a defensive `=== null` aligns with the
        // documented contract — strings → Date, nulls → null.
        result[field] = raw === null || raw === undefined ? null : new Date(raw as string);
      }
    }
    return result as unknown as OmniFocusTask;
  });
}

// =============================================================================
// SORTING
// =============================================================================

function toSortableString(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value as string | number | boolean);
}

function compareValues(aValue: unknown, bValue: unknown): number {
  if (typeof aValue === 'string' && typeof bValue === 'string') {
    return aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
  }
  if (typeof aValue === 'number' && typeof bValue === 'number') {
    return aValue - bValue;
  }
  if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
    if (aValue === bValue) return 0;
    return aValue ? -1 : 1;
  }
  if (aValue instanceof Date && bValue instanceof Date) {
    return aValue.getTime() - bValue.getTime();
  }
  return toSortableString(aValue).localeCompare(toSortableString(bValue));
}

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

      const comparison = compareValues(aValue, bValue);
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
/**
 * OMN-244/OMN-245: noteTruncated is a marker RIDING the note field, not a
 * field of its own — whenever `note` survives a post-hoc projection, the
 * marker must survive with it (the #204 live-verify bug class). ONE carry
 * rule shared by the task and project projection paths; change it here,
 * never per call site.
 */
export function carryNoteTruncatedMarker(source: Record<string, unknown>, projected: Record<string, unknown>): void {
  if ('note' in projected && source.noteTruncated === true) {
    projected.noteTruncated = true;
  }
}

/**
 * OMN-259: smart_suggest's screen_reasons is EVIDENCE, not a selectable field
 * (it isn't in TaskFieldEnum) — if the projection dropped it, a caller using
 * `fields:` would receive a shortlist with no way to see why each task was
 * selected (the #204 projection-strip class again). Carry it whenever the
 * source task has it; never invent it.
 */
export function carryScreenReasons(source: Record<string, unknown>, projected: Record<string, unknown>): void {
  if (Array.isArray(source.screen_reasons)) {
    projected.screen_reasons = source.screen_reasons;
  }
}

export function projectFields(tasks: OmniFocusTask[], selectedFields?: string[]): (OmniFocusTask | ProjectedTask)[] {
  if (!selectedFields || selectedFields.length === 0) {
    return tasks;
  }

  return tasks.map((task) => {
    const projectedTask: ProjectedTask = { id: task.id };

    selectedFields.forEach((field) => {
      if (field in task) {
        // OMN-222: selectedFields is `string[]` at this call site (CompiledQuery.fields
        // is shared across query types), so this cast can't be narrowed away without a
        // wider refactor of that shared type. The `_taskFieldsAreKnownKeys` guard above
        // makes drift safe: every literal TaskFieldEnum can emit is asserted to be a
        // real OmniFocusTask member at compile time, so a future field added to the
        // enum without a matching interface member fails the build there instead of
        // silently widening this cast.
        const typedField = field as keyof OmniFocusTask;
        (projectedTask as Record<string, unknown>)[field] = task[typedField];
      }
    });

    carryNoteTruncatedMarker(task as unknown as Record<string, unknown>, projectedTask as Record<string, unknown>);
    carryScreenReasons(task as unknown as Record<string, unknown>, projectedTask as Record<string, unknown>);

    // OMN-241: return the honest partial shape — no `as OmniFocusTask` cast.
    // Callers that need a specific field beyond `id` must narrow (check
    // presence) rather than assume it's always populated.
    return projectedTask;
  });
}

// =============================================================================
// SMART SUGGEST SCORING
// =============================================================================

/**
 * Screen tasks for smart suggestions (OMN-259: screen + evidence + model-judges).
 *
 * The additive score is INTERNAL — it exists only to pick a small shortlist
 * under token constraints. It is never returned; instead every suggested task
 * carries `screen_reasons`, the mechanical signals that selected it, so the
 * caller can re-rank against context the server can't see (stated intent,
 * calendar, energy — the GTD engage criteria).
 *
 * Internal selection weights (unchanged from the pre-OMN-259 scoring):
 * - Overdue: +100 base, +10 per day overdue (capped at 300) → 'overdue_<N>d'
 * - Due today: +80 → 'due_today'
 * - Flagged: +50 → 'flagged'
 * - Available: +30 → 'available'
 * - Quick win (≤15 min): +20 → 'quick_win'
 */
export function scoreForSmartSuggest(tasks: OmniFocusTask[], limit: number): OmniFocusTask[] {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const screen = (task: OmniFocusTask): { score: number; reasons: string[] } => {
    let score = 0;
    const reasons: string[] = [];

    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const isDueToday = dueDate.toDateString() === now.toDateString();
      if (dueDate < now) {
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        score += 100 + Math.min(daysOverdue * 10, 200);
        reasons.push(`overdue_${daysOverdue}d`);
      } else if (isDueToday || dueDate <= todayEnd) {
        score += 80;
        reasons.push('due_today');
      }
    }

    if (task.flagged) {
      score += 50;
      reasons.push('flagged');
    }
    if (task.available) {
      score += 30;
      reasons.push('available');
    }
    if (task.estimatedMinutes && task.estimatedMinutes <= 15) {
      score += 20;
      reasons.push('quick_win');
    }

    return { score, reasons };
  };

  const scoredTasks = tasks.map((task) => {
    const { score, reasons } = screen(task);
    return { task: { ...task, screen_reasons: reasons }, _score: score };
  });

  const suggestedTasks = scoredTasks
    .filter((t) => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map((t) => t.task);

  // Ensure at least one due-today task is surfaced
  const dueTodayCandidate = tasks.find((t) => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString());
  if (dueTodayCandidate) {
    const alreadyIncluded = suggestedTasks.some((t) => t.id === dueTodayCandidate.id);
    if (!alreadyIncluded) {
      const withReasons = { ...dueTodayCandidate, screen_reasons: screen(dueTodayCandidate).reasons };
      if (suggestedTasks.length < limit) {
        suggestedTasks.push(withReasons);
      } else if (suggestedTasks.length > 0) {
        suggestedTasks[suggestedTasks.length - 1] = withReasons;
      }
    }
  }

  return suggestedTasks;
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
    const reason = task.reason;
    if (reason === 'overdue') overdueCount++;
    else if (reason === 'due_soon') dueSoonCount++;
    else if (reason === 'flagged') flaggedCount++;
  }
  return { overdueCount, dueSoonCount, flaggedCount };
}
