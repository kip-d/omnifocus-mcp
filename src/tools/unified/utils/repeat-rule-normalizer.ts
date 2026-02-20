/**
 * Repeat rule normalization utilities
 *
 * Extracted from ManageTaskTool to be reusable across tools.
 *
 * Functions:
 * - normalizeRepeatMethod: Normalizes method strings to canonical values
 * - normalizeRepeatRuleInput: Validates and normalizes a raw repeat rule object (legacy format)
 * - convertToRepetitionRule: Converts legacy RepeatRule to unified RepetitionRule format
 */

import { createLogger } from '../../../utils/logger.js';
import type { RepetitionRule } from '../../../contracts/mutations.js';

const logger = createLogger('repeat-rule-normalizer');

/**
 * Legacy RepeatRule type (from script-response-types.ts)
 * Defined locally to avoid coupling — matches the shape used by ManageTaskTool.
 */
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

/**
 * Normalize a repeat method string to a canonical value.
 * Handles case-insensitivity, trimming, and aliases.
 */
export function normalizeRepeatMethod(
  method: unknown,
): 'fixed' | 'start-after-completion' | 'due-after-completion' | 'none' {
  if (typeof method !== 'string') return 'fixed';
  const normalized = method.toLowerCase().trim();
  switch (normalized) {
    case 'start-after-completion':
      return 'start-after-completion';
    case 'due-after-completion':
    case 'after-completion':
      return 'due-after-completion';
    case 'none':
      return 'none';
    case 'fixed':
    default:
      return 'fixed';
  }
}

/**
 * Validate and normalize a raw repeat rule input into a canonical RepeatRule.
 * Returns undefined if the input is invalid or missing required fields.
 */
export function normalizeRepeatRuleInput(rule: unknown): RepeatRule | undefined {
  if (!rule || typeof rule !== 'object') return undefined;
  const raw = rule as Record<string, unknown>;
  if (typeof raw.unit !== 'string') return undefined;

  const normalized: RepeatRule = {
    unit: raw.unit as RepeatRule['unit'],
    steps: (() => {
      const value = raw.steps;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      }
      return 1;
    })(),
    method: normalizeRepeatMethod(raw.method),
  };

  if (Array.isArray(raw.weekdays)) {
    normalized.weekdays = raw.weekdays as RepeatRule['weekdays'];
  }
  if (raw.weekPosition !== undefined) {
    normalized.weekPosition = raw.weekPosition as RepeatRule['weekPosition'];
  }
  if (typeof raw.weekday === 'string') {
    normalized.weekday = raw.weekday as RepeatRule['weekday'];
  }
  if (raw.deferAnother && typeof raw.deferAnother === 'object') {
    const defer = raw.deferAnother as Record<string, unknown>;
    if (typeof defer.unit === 'string') {
      const stepsValue = defer.steps;
      const stepsNumber =
        typeof stepsValue === 'number'
          ? stepsValue
          : typeof stepsValue === 'string'
            ? parseInt(stepsValue, 10)
            : undefined;
      if (stepsNumber && Number.isFinite(stepsNumber) && stepsNumber > 0) {
        type DeferAnother = NonNullable<RepeatRule['deferAnother']>;
        normalized.deferAnother = {
          unit: defer.unit as DeferAnother['unit'],
          steps: stepsNumber,
        };
      }
    }
  }

  return normalized;
}

/**
 * Convert a legacy RepeatRule to the unified RepetitionRule format.
 *
 * RepeatRule: { unit: 'day', steps: 2, method: 'fixed' }
 *   -> RepetitionRule: { frequency: 'daily', interval: 2, method: 'fixed' }
 *
 * The RepetitionRule frequency maps to ICS RRULE FREQ values used by OmniFocus.
 * Method maps to Task.RepetitionMethod enum values.
 */
export function convertToRepetitionRule(rule: RepeatRule | null | undefined): RepetitionRule | undefined {
  if (!rule) return undefined;

  const unitToFrequency: Record<string, 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'> = {
    minute: 'minutely',
    hour: 'hourly',
    day: 'daily',
    week: 'weekly',
    month: 'monthly',
    year: 'yearly',
  };

  const frequency = unitToFrequency[rule.unit];
  if (!frequency) {
    logger.warn('Unknown repetition unit, defaulting to daily', { unit: rule.unit });
    return { frequency: 'daily', interval: rule.steps || 1 };
  }

  // Map method from RepeatRule format to RepetitionRule format
  // 'start-after-completion' -> 'defer-after-completion' (defer date calculated from completion)
  // 'due-after-completion' -> 'due-after-completion' (due date calculated from completion)
  // 'fixed' -> 'fixed' (fixed schedule regardless of completion)
  // 'none' -> 'none'
  const methodMap: Record<string, 'fixed' | 'due-after-completion' | 'defer-after-completion' | 'none'> = {
    fixed: 'fixed',
    'due-after-completion': 'due-after-completion',
    'start-after-completion': 'defer-after-completion',
    none: 'none',
  };
  const method = rule.method ? methodMap[rule.method] || 'fixed' : 'fixed';

  // Determine scheduleType based on method
  // 'fixed' uses 'regularly', completion-based methods use 'from-completion'
  const scheduleType =
    method === 'due-after-completion' || method === 'defer-after-completion'
      ? ('from-completion' as const)
      : ('regularly' as const);

  // Determine anchorDateKey based on method
  // 'defer-after-completion' anchors to defer date, others anchor to due date
  const anchorDateKey = method === 'defer-after-completion' ? ('defer-date' as const) : ('due-date' as const);

  return {
    frequency,
    interval: rule.steps || 1,
    method,
    scheduleType,
    anchorDateKey,
    catchUpAutomatically: true, // Default to true (skip missed = false)
  };
}
