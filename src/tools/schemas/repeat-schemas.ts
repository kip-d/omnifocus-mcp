import { z } from 'zod';
import { coerceNumber } from './coercion-helpers.js';

/**
 * Comprehensive repeat/recurrence schema definitions for OmniFocus
 * Supports all OmniFocus repeat capabilities including complex weekly/monthly patterns
 */

// Basic repeat units supported by OmniFocus
export const RepeatUnitSchema = z.enum([
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'year',
]);

// Repeat methods from OmniFocus API
export const RepeatMethodSchema = z.enum([
  'fixed',                    // Fixed schedule (Task.RepetitionMethod.Fixed)
  'start-after-completion',   // Start after completion (Task.RepetitionMethod.DeferUntilDate)
  'due-after-completion',     // Due after completion (Task.RepetitionMethod.DueDate)
  'none',                      // No repetition (Task.RepetitionMethod.None)
])
  .describe('Repetition method: "fixed" = repeat on schedule regardless of completion (e.g., every Monday), "start-after-completion" = next occurrence starts N days after completion, "due-after-completion" = next due date is N days after completion, "none" = no repetition');

// Weekdays for weekly patterns
export const WeekdaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

// Monthly position indicators for "1st Tuesday", "last Friday", etc.
export const MonthlyPositionSchema = z.union([
  z.literal(1),    // 1st
  z.literal(2),    // 2nd
  z.literal(3),    // 3rd
  z.literal(4),    // 4th
  z.literal('last'), // last
]);

// Defer another setting for "defer X time before due"
export const DeferAnotherSchema = z.object({
  unit: RepeatUnitSchema.describe('Unit for defer another (minute, hour, day, week, month, year)'),
  steps: coerceNumber()
    .int()
    .positive()
    .describe('Number of units to defer before due date'),
});

// Core repeat rule schema
export const RepeatRuleSchema = z.object({
  // Basic repeat settings
  unit: RepeatUnitSchema
    .describe('Time unit for repetition'),

  steps: coerceNumber()
    .int()
    .positive()
    .default(1)
    .describe('Interval - repeat every X units (e.g., every 2 weeks)'),

  method: RepeatMethodSchema
    .default('fixed')
    .describe('How the repetition is calculated: "fixed" = repeat on schedule (e.g., every Monday at 2pm), "start-after-completion" = next occurrence starts N days after you complete this one, "due-after-completion" = next due date is N days after you complete this one'),

  // Weekly patterns - specific days of the week
  weekdays: z.array(WeekdaySchema)
    .optional()
    .describe('For weekly repeats, specify which days (e.g., ["monday", "wednesday", "friday"])'),

  // Monthly patterns - positional rules
  weekPosition: z.union([
    MonthlyPositionSchema,
    z.array(MonthlyPositionSchema),
  ])
    .optional()
    .describe('For monthly repeats, specify position (1st, 2nd, 3rd, 4th, "last" or array of positions)'),

  weekday: WeekdaySchema
    .optional()
    .describe('For monthly positional repeats, specify the weekday (e.g., "tuesday" for "1st Tuesday")'),

  // Defer another setting
  deferAnother: DeferAnotherSchema
    .optional()
    .describe('Defer the task X time before the due date (e.g., defer 3 days before due)'),
});

// Validation and derived schemas for common patterns
export const HourlyRepeatSchema = RepeatRuleSchema.extend({
  unit: z.literal('hour'),
  steps: coerceNumber().int().min(1).max(12).describe('Every X hours (1-12)'),
});

export const DailyRepeatSchema = RepeatRuleSchema.extend({
  unit: z.literal('day'),
  steps: coerceNumber().int().min(1).max(30).describe('Every X days (1-30)'),
});

export const WeeklyRepeatSchema = RepeatRuleSchema.extend({
  unit: z.literal('week'),
  steps: coerceNumber().int().min(1).max(4).describe('Every X weeks (1-4)'),
  weekdays: z.array(WeekdaySchema).optional().describe('Specific weekdays for weekly repeats'),
});

export const MonthlyRepeatSchema = RepeatRuleSchema.extend({
  unit: z.literal('month'),
  steps: coerceNumber().int().min(1).max(12).describe('Every X months (1-12)'),
  weekPosition: z.union([
    MonthlyPositionSchema,
    z.array(MonthlyPositionSchema),
  ]).optional(),
  weekday: WeekdaySchema.optional(),
});

export const YearlyRepeatSchema = RepeatRuleSchema.extend({
  unit: z.literal('year'),
  steps: coerceNumber().int().min(1).max(5).describe('Every X years (1-5)'),
});

// Helper schemas for common repeat patterns
export const CommonRepeatPatterns = z.union([
  // Simple patterns
  z.object({
    pattern: z.literal('hourly'),
    interval: coerceNumber().int().min(1).max(12).default(1),
  }),
  z.object({
    pattern: z.literal('daily'),
    interval: coerceNumber().int().min(1).max(30).default(1),
  }),
  z.object({
    pattern: z.literal('weekly'),
    interval: coerceNumber().int().min(1).max(4).default(1),
    weekdays: z.array(WeekdaySchema).optional(),
  }),
  z.object({
    pattern: z.literal('monthly'),
    interval: coerceNumber().int().min(1).max(12).default(1),
  }),
  z.object({
    pattern: z.literal('yearly'),
    interval: coerceNumber().int().min(1).max(5).default(1),
  }),

  // Complex weekly patterns
  z.object({
    pattern: z.literal('weekdays'),
    description: z.literal('Monday through Friday').optional(),
  }),
  z.object({
    pattern: z.literal('weekends'),
    description: z.literal('Saturday and Sunday').optional(),
  }),

  // Complex monthly patterns
  z.object({
    pattern: z.literal('first-weekday-of-month'),
    weekday: WeekdaySchema,
    description: z.string().optional(),
  }),
  z.object({
    pattern: z.literal('last-weekday-of-month'),
    weekday: WeekdaySchema,
    description: z.string().optional(),
  }),
  z.object({
    pattern: z.literal('nth-weekday-of-month'),
    position: MonthlyPositionSchema,
    weekday: WeekdaySchema,
    description: z.string().optional(),
  }),
]);

// Schema for parsing existing repeat rules (from OmniFocus)
export const ExistingRepeatRuleSchema = z.object({
  method: z.string().optional(),
  ruleString: z.string().optional(),
  unit: z.string().optional(),
  steps: z.number().optional(),
  _inferenceSource: z.enum(['ruleString', 'api', 'inference']).optional(),
});

/**
 * Utility functions for converting between different repeat formats
 */

// Convert RepeatRuleSchema to RRULE format string for OmniFocus
export function convertToRRULE(rule: z.infer<typeof RepeatRuleSchema>): string {
  let rrule = '';

  // Basic frequency mapping
  switch (rule.unit) {
    case 'minute':
      rrule = 'FREQ=MINUTELY';
      break;
    case 'hour':
      rrule = 'FREQ=HOURLY';
      break;
    case 'day':
      rrule = 'FREQ=DAILY';
      break;
    case 'week':
      rrule = 'FREQ=WEEKLY';
      break;
    case 'month':
      rrule = 'FREQ=MONTHLY';
      break;
    case 'year':
      rrule = 'FREQ=YEARLY';
      break;
  }

  // Add interval if > 1
  if (rule.steps && rule.steps > 1) {
    rrule += `;INTERVAL=${rule.steps}`;
  }

  // Add weekdays for weekly patterns
  if (rule.weekdays && rule.weekdays.length > 0) {
    const weekdayMap: Record<string, string> = {
      'sunday': 'SU',
      'monday': 'MO',
      'tuesday': 'TU',
      'wednesday': 'WE',
      'thursday': 'TH',
      'friday': 'FR',
      'saturday': 'SA',
    };

    const days = rule.weekdays.map(day => weekdayMap[day]).join(',');
    rrule += `;BYDAY=${days}`;
  }

  // Add monthly positional patterns
  if (rule.weekPosition && rule.weekday) {
    const weekdayMap: Record<string, string> = {
      'sunday': 'SU',
      'monday': 'MO',
      'tuesday': 'TU',
      'wednesday': 'WE',
      'thursday': 'TH',
      'friday': 'FR',
      'saturday': 'SA',
    };

    const weekdayCode = weekdayMap[rule.weekday];

    if (Array.isArray(rule.weekPosition)) {
      const positions = rule.weekPosition.map(pos =>
        pos === 'last' ? `-1${weekdayCode}` : `${pos}${weekdayCode}`,
      ).join(',');
      rrule += `;BYDAY=${positions}`;
    } else {
      const position = rule.weekPosition === 'last' ? '-1' : rule.weekPosition.toString();
      rrule += `;BYDAY=${position}${weekdayCode}`;
    }
  }

  return rrule;
}

// Convert OmniFocus RepetitionMethod to our method enum
export function convertRepetitionMethod(ofMethod: string): z.infer<typeof RepeatMethodSchema> {
  switch (ofMethod) {
    case 'Fixed':
      return 'fixed';
    case 'DeferUntilDate':
      return 'start-after-completion';
    case 'DueDate':
      return 'due-after-completion';
    case 'None':
    default:
      return 'none';
  }
}

// Convert our method enum to OmniFocus RepetitionMethod
export function convertToOmniMethod(method: z.infer<typeof RepeatMethodSchema>): string {
  switch (method) {
    case 'fixed':
      return 'Fixed';
    case 'start-after-completion':
      return 'DeferUntilDate';
    case 'due-after-completion':
      return 'DueDate';
    case 'none':
    default:
      return 'None';
  }
}

// Example patterns for documentation
export const EXAMPLE_REPEAT_PATTERNS = [
  {
    description: 'Every 30 minutes',
    rule: { unit: 'minute', steps: 30, method: 'fixed' },
  },
  {
    description: 'Every 2 hours',
    rule: { unit: 'hour', steps: 2, method: 'fixed' },
  },
  {
    description: 'Daily',
    rule: { unit: 'day', steps: 1, method: 'fixed' },
  },
  {
    description: 'Every Monday, Wednesday, Friday',
    rule: { unit: 'week', steps: 1, weekdays: ['monday', 'wednesday', 'friday'], method: 'fixed' },
  },
  {
    description: 'Weekdays only',
    rule: { unit: 'week', steps: 1, weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], method: 'fixed' },
  },
  {
    description: 'First Tuesday of each month',
    rule: { unit: 'month', steps: 1, weekPosition: 1, weekday: 'tuesday', method: 'fixed' },
  },
  {
    description: 'First and third Friday of each month',
    rule: { unit: 'month', steps: 1, weekPosition: [1, 3], weekday: 'friday', method: 'fixed' },
  },
  {
    description: 'Last Monday of every month',
    rule: { unit: 'month', steps: 1, weekPosition: 'last', weekday: 'monday', method: 'fixed' },
  },
  {
    description: 'Every 2 weeks after completion',
    rule: { unit: 'week', steps: 2, method: 'start-after-completion' },
  },
  {
    description: 'Monthly with 3-day advance notice',
    rule: { unit: 'month', steps: 1, method: 'fixed', deferAnother: { unit: 'day', steps: 3 } },
  },
  {
    description: 'Quarterly (every 3 months)',
    rule: { unit: 'month', steps: 3, method: 'fixed' },
  },
  {
    description: 'Yearly',
    rule: { unit: 'year', steps: 1, method: 'fixed' },
  },
];
