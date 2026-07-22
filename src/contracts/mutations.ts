/**
 * MUTATION CONTRACTS
 *
 * This is the SINGLE SOURCE OF TRUTH for mutation data-shape types
 * (create/update payloads, repetition rules, target kinds).
 *
 * Used by:
 * - MutationCompiler (to transform input)
 * - OmniJS script generator (to generate mutation scripts)
 * - Tool wrappers (to understand what mutations were applied)
 *
 * OMN-281: the parallel imperative-validation subsystem that lived here
 * (TaskMutation union + validateMutation/createMutation and helpers) was
 * removed as dead — Zod schemas at the tool boundary (write-schema.ts) are
 * the live validation path.
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

// =============================================================================
// OPERATION TYPES
// =============================================================================

/**
 * Target entity types
 */
export type MutationTarget = 'task' | 'project' | 'folder' | 'tag';

// =============================================================================
// REPETITION RULE
// =============================================================================

/**
 * Day of week specification for BYDAY parameter
 * Can be simple (just day) or positioned (nth occurrence in month)
 *
 * Examples:
 * - { day: 'MO' } → Every Monday
 * - { day: 'FR', position: -1 } → Last Friday of month
 * - { day: 'MO', position: 2 } → Second Monday of month
 */
export interface DayOfWeek {
  day: 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';
  position?: number; // -1 = last, 1 = first, 2 = second, etc.
}

/**
 * Repetition rule for recurring tasks (RFC 5545 RRULE subset supported by OmniFocus)
 *
 * ## Supported Parameters (OmniFocus 4.x)
 *
 * | Parameter | Type | Example | Description |
 * |-----------|------|---------|-------------|
 * | frequency | string | 'weekly' | FREQ - Required. MINUTELY/HOURLY/DAILY/WEEKLY/MONTHLY/YEARLY |
 * | interval | number | 2 | INTERVAL - Every Nth occurrence (default: 1) |
 * | daysOfWeek | DayOfWeek[] | [{day:'MO'},{day:'WE'}] | BYDAY - Which days |
 * | daysOfMonth | number[] | [1, 15, -1] | BYMONTHDAY - Which days of month (-1 = last) |
 * | count | number | 10 | COUNT - Stop after N occurrences |
 * | endDate | string | '2025-12-31' | UNTIL - Stop on this date |
 * | weekStart | string | 'MO' | WKST - Week start day (default: SU) |
 * | setPositions | number[] | [1, -1] | BYSETPOS - Filter to Nth occurrences |
 *
 * ## NOT Supported by OmniFocus
 * - BYMONTH (restrict to specific months) - OmniFocus explicitly rejects this
 * - BYHOUR, BYMINUTE, BYSECOND
 * - BYYEARDAY, BYWEEKNO
 *
 * ## Common Patterns (for LLM reference)
 *
 * | Natural Language | RepetitionRule |
 * |-----------------|----------------|
 * | "Every day" | { frequency: 'daily', interval: 1 } |
 * | "Every 2 weeks" | { frequency: 'weekly', interval: 2 } |
 * | "Every Monday and Wednesday" | { frequency: 'weekly', interval: 1, daysOfWeek: [{day:'MO'},{day:'WE'}] } |
 * | "On the 15th of each month" | { frequency: 'monthly', interval: 1, daysOfMonth: [15] } |
 * | "Last Friday of each month" | { frequency: 'monthly', interval: 1, daysOfWeek: [{day:'FR', position:-1}] } |
 * | "Every weekday" | { frequency: 'weekly', daysOfWeek: [{day:'MO'},{day:'TU'},{day:'WE'},{day:'TH'},{day:'FR'}] } |
 * | "1st and 15th of month" | { frequency: 'monthly', daysOfMonth: [1, 15] } |
 * | "Daily until Dec 31" | { frequency: 'daily', endDate: '2025-12-31' } |
 * | "Weekly for 10 weeks" | { frequency: 'weekly', count: 10 } |
 */
export interface RepetitionRule {
  /** Required. Recurrence frequency */
  frequency: 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

  /** Every Nth occurrence. Default: 1 */
  interval: number;

  /** BYDAY - Days of week, optionally with position for monthly rules */
  daysOfWeek?: DayOfWeek[];

  /** BYMONTHDAY - Days of month (1-31, or negative from end: -1 = last day) */
  daysOfMonth?: number[];

  /** COUNT - Stop after this many occurrences */
  count?: number;

  /** UNTIL - End date in YYYY-MM-DD format */
  endDate?: string;

  /** WKST - Week start day. Default: SU (Sunday) */
  weekStart?: 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

  /** BYSETPOS - Filter to specific positions within the period (-1 = last, 1 = first) */
  setPositions?: number[];

  /**
   * Repetition method - how the next occurrence is calculated.
   * - 'fixed': Repeat on schedule regardless of completion (default)
   * - 'due-after-completion': Next due date is calculated from completion date
   * - 'defer-after-completion': Next defer date is calculated from completion date
   * - 'none': No repetition method
   */
  method?: 'fixed' | 'due-after-completion' | 'defer-after-completion' | 'none';

  /**
   * Schedule type - when repetitions are calculated.
   * - 'regularly': Repeat on fixed schedule (default)
   * - 'from-completion': Calculate from when task is completed/dropped
   * - 'none': No schedule
   */
  scheduleType?: 'regularly' | 'from-completion' | 'none';

  /**
   * Anchor date key - which date the repetition is based on.
   * - 'due-date': Anchor to due date (default)
   * - 'defer-date': Anchor to defer date
   * - 'planned-date': Anchor to planned date
   */
  anchorDateKey?: 'due-date' | 'defer-date' | 'planned-date';

  /** Whether to catch up on missed occurrences. Default: true */
  catchUpAutomatically?: boolean;
}

// =============================================================================
// CREATE DATA
// =============================================================================

/**
 * Data for creating a new task
 */
export interface TaskCreateData {
  name: string;
  note?: string;
  project?: string | null; // null = inbox
  parentTaskId?: string; // For subtask creation
  tags?: string[];
  dueDate?: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm
  deferDate?: string;
  plannedDate?: string;
  flagged?: boolean;
  sequential?: boolean; // Action-group ordering: meaningful on parent tasks; no-op on leaves (OMN-198)
  estimatedMinutes?: number;
  repetitionRule?: RepetitionRule;
}

/**
 * Data for creating a new project
 */
export interface ProjectCreateData {
  name: string;
  note?: string;
  folder?: string;
  tags?: string[];
  dueDate?: string;
  deferDate?: string;
  plannedDate?: string;
  flagged?: boolean;
  sequential?: boolean;
  status?: 'active' | 'on_hold' | 'completed' | 'dropped';
  reviewInterval?: number; // Days between reviews
}

/**
 * Data for creating a new folder
 */
export interface FolderCreateData {
  name: string;
  parentFolder?: string; // Parent folder name, path (" : " or "/"), or ID. Omit for top-level.
}

// =============================================================================
// UPDATE DATA
// =============================================================================

/**
 * Data for updating an existing task
 */
export interface TaskUpdateData {
  name?: string;
  note?: string;
  project?: string | null; // null = move to inbox
  parentTaskId?: string | null; // Move task to be subtask of this parent (null = move to project root)
  tags?: string[]; // Replace all tags
  addTags?: string[]; // Add to existing tags
  removeTags?: string[]; // Remove from existing tags
  dueDate?: string | null;
  deferDate?: string | null;
  plannedDate?: string | null;
  clearDueDate?: boolean;
  clearDeferDate?: boolean;
  clearPlannedDate?: boolean;
  flagged?: boolean;
  sequential?: boolean; // Live on tasks (action groups): the shared update schema + sanitizer forward it — spec §3 slice 4
  estimatedMinutes?: number;
  clearEstimatedMinutes?: boolean;
  repetitionRule?: RepetitionRule | null; // Set/update (object) or clear (null)
  status?: 'completed' | 'dropped';
}

/**
 * Data for updating an existing project
 */
export interface ProjectUpdateData {
  name?: string;
  note?: string;
  folder?: string | null;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  dueDate?: string | null;
  deferDate?: string | null;
  plannedDate?: string | null;
  clearDueDate?: boolean;
  clearDeferDate?: boolean;
  clearPlannedDate?: boolean;
  flagged?: boolean;
  sequential?: boolean;
  status?: 'active' | 'on_hold' | 'completed' | 'dropped';
  reviewInterval?: number;
}
