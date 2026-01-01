import { z } from 'zod';
import { coerceNumber } from './coercion-helpers.js';
import { LocalDateTimeSchema } from './date-schemas.js';

/**
 * Comprehensive repeat/recurrence schema definitions for OmniFocus
 * Supports all OmniFocus repeat capabilities including complex weekly/monthly patterns
 */

// Basic repeat units supported by OmniFocus
export const RepeatUnitSchema = z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']);

// Repeat methods from OmniFocus API
export const RepeatMethodSchema = z
  .enum([
    'fixed', // Fixed schedule (Task.RepetitionMethod.Fixed)
    'start-after-completion', // Start after completion (Task.RepetitionMethod.DeferUntilDate)
    'due-after-completion', // Due after completion (Task.RepetitionMethod.DueDate)
    'none', // No repetition (Task.RepetitionMethod.None)
  ])
  .describe(
    'Repetition method: "fixed" = repeat on schedule regardless of completion (e.g., every Monday), "start-after-completion" = next occurrence starts N days after completion, "due-after-completion" = next due date is N days after completion, "none" = no repetition',
  );

// Weekdays for weekly patterns
export const WeekdaySchema = z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

// Monthly position indicators for "1st Tuesday", "last Friday", etc.
export const MonthlyPositionSchema = z.union([
  z.literal(1), // 1st
  z.literal(2), // 2nd
  z.literal(3), // 3rd
  z.literal(4), // 4th
  z.literal('last'), // last
]);

// Defer another setting for "defer X time before due"
export const DeferAnotherSchema = z.object({
  unit: RepeatUnitSchema.describe('Unit for defer another (minute, hour, day, week, month, year)'),
  steps: coerceNumber().int().positive().describe('Number of units to defer before due date'),
});

// Core repeat rule schema
export const RepeatRuleSchema = z.object({
  // Basic repeat settings
  unit: RepeatUnitSchema.describe('Time unit for repetition'),

  steps: coerceNumber().int().positive().default(1).describe('Interval - repeat every X units (e.g., every 2 weeks)'),

  method: RepeatMethodSchema.default('fixed').describe(
    'How the repetition is calculated: "fixed" = repeat on schedule (e.g., every Monday at 2pm), "start-after-completion" = next occurrence starts N days after you complete this one, "due-after-completion" = next due date is N days after you complete this one',
  ),

  // Weekly patterns - specific days of the week
  weekdays: z
    .array(WeekdaySchema)
    .optional()
    .describe('For weekly repeats, specify which days (e.g., ["monday", "wednesday", "friday"])'),

  // Monthly patterns - positional rules
  weekPosition: z
    .union([MonthlyPositionSchema, z.array(MonthlyPositionSchema)])
    .optional()
    .describe('For monthly repeats, specify position (1st, 2nd, 3rd, 4th, "last" or array of positions)'),

  weekday: WeekdaySchema.optional().describe(
    'For monthly positional repeats, specify the weekday (e.g., "tuesday" for "1st Tuesday")',
  ),

  // Defer another setting
  deferAnother: DeferAnotherSchema.optional().describe(
    'Defer the task X time before the due date (e.g., defer 3 days before due)',
  ),
});

/**
 * LLM-OPTIMIZED REPEAT SCHEMAS (NEW in 4.7+ upgrade)
 * These schemas expose user-friendly intent keywords that Claude understands
 * All technical OmniFocus internals are hidden server-side
 */

// Anchor intent for repeat rules (what date the repeat anchors to)
export const RepeatAnchorIntentSchema = z
  .enum([
    'when-deferred', // Count from defer date
    'when-due', // Count from due date - DEFAULT
    'when-marked-done', // Count from completion
    'planned-date', // Count from planned date
  ])
  .default('when-due')
  .describe(
    'What date to anchor the repeat to: "when-deferred" = count from defer date, "when-due" = count from due date (default), "when-marked-done" = count from completion, "planned-date" = count from planned date',
  );

// End condition for repeats (when should repeat stop?)
export const RepeatEndConditionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('never').describe('Never end - repeat forever (default)'),
    }),
    z.object({
      type: z.literal('afterDate'),
      date: LocalDateTimeSchema.describe('Stop repeating after this date'),
    }),
    z.object({
      type: z.literal('afterOccurrences'),
      count: coerceNumber().int().positive().describe('Stop after this many occurrences'),
    }),
  ])
  .optional()
  .describe('When should this repeat end? Omit for infinite repeats');

// User-intent-driven repeat schema (for create/update operations)
// This is what Claude sees and uses
export const RepeatRuleUserIntentSchema = z.object({
  frequency: z
    .string()
    .describe(
      'Repeat frequency in human-readable format. Examples: "daily", "every 3 days", "weekly on Monday", "monthly on the 15th", "yearly"',
    ),

  anchorTo: RepeatAnchorIntentSchema,

  skipMissed: z.coerce
    .boolean()
    .default(false)
    .describe('Should missed occurrences be skipped (caught up automatically)? Default: false'),

  endCondition: RepeatEndConditionSchema,
});

// Response schema includes both user-friendly and technical details
export const RepeatRuleResponseSchema = z.object({
  frequency: z.string(),
  anchorTo: z.string(),
  skipMissed: z.boolean(),
  endCondition: z.any().optional(),

  // Technical details (for advanced users/debugging)
  _details: z
    .object({
      ruleString: z.string().optional(),
      method: z.string().optional(),
      scheduleType: z.string().optional(),
      anchorDateKey: z.string().optional(),
      catchUpAutomatically: z.boolean().optional(),
    })
    .optional()
    .describe('Technical implementation details (for debugging)'),
});
