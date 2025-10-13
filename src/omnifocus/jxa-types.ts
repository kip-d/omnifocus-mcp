/**
 * Type definitions for OmniFocus JXA (JavaScript for Automation) API responses
 * These types represent the data structures returned by OmniFocus automation scripts
 */

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
export interface OverduePattern {
  type: 'project' | 'tag' | 'timeOfDay' | 'dayOfWeek';
  value: string;
  count: number;
  percentage: number;
}
