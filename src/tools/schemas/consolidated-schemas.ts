import { z } from 'zod';
import {
  LocalDateTimeSchema,
  IdSchema,
} from './shared-schemas.js';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Consolidated tool schemas for better LLM usage
 */

// Review interval schema (extracted from project-schemas.ts)
export const ReviewIntervalSchema = z.object({
  unit: z.enum(['day', 'week', 'month', 'year']).describe('Time unit for review interval'),
  steps: z.number().int().positive().describe('Number of units between reviews'),
  fixed: z.boolean().optional().default(false).describe('Whether to use fixed scheduling (true) or floating (false)'),
}).describe('Review interval configuration');

// Base operation schemas for discriminated unions
const ListForReviewOperation = z.object({
  operation: z.literal('list_for_review'),
  overdue: coerceBoolean()
    .default(false)
    .describe('Show only projects overdue for review'),
  daysAhead: coerceNumber()
    .int()
    .min(0)
    .max(365)
    .default(7)
    .describe('Include projects due for review within this many days'),
});

const MarkReviewedOperation = z.object({
  operation: z.literal('mark_reviewed'),
  projectId: IdSchema
    .describe('ID of the project to mark as reviewed'),
  reviewDate: LocalDateTimeSchema
    .optional()
    .describe('Date of the review in your local time (defaults to now)'),
  updateNextReviewDate: coerceBoolean()
    .default(true)
    .describe('Whether to automatically calculate the next review date based on the review interval'),
});

const SetScheduleOperation = z.object({
  operation: z.literal('set_schedule'),
  projectIds: z.array(IdSchema)
    .min(1)
    .describe('IDs of projects to update review schedules for'),
  reviewInterval: ReviewIntervalSchema
    .describe('Review interval to apply to all projects'),
  nextReviewDate: LocalDateTimeSchema
    .optional()
    .describe('Next review date to set in your local time (if not provided, calculated from review interval)'),
});

const ClearScheduleOperation = z.object({
  operation: z.literal('clear_schedule'),
  projectIds: z.array(IdSchema)
    .min(1)
    .describe('IDs of projects to clear review schedules for'),
});

// ManageReviewsTool schema - discriminated union for type safety
export const ManageReviewsSchema = z.discriminatedUnion('operation', [
  ListForReviewOperation,
  MarkReviewedOperation,
  SetScheduleOperation,
  ClearScheduleOperation,
]);

// Batch task operation schemas
const UpdateTasksOperation = z.object({
  operation: z.literal('update'),
  taskIds: z.array(IdSchema)
    .min(1)
    .describe('IDs of tasks to update'),
  updates: z.object({
    name: z.string().optional(),
    note: z.string().optional(),
    flagged: z.boolean().optional(),
    dueDate: LocalDateTimeSchema.optional(),
    deferDate: LocalDateTimeSchema.optional(),
    plannedDate: LocalDateTimeSchema.optional().describe('When the task is planned (OmniFocus 4.7+)'),
    tags: z.array(z.string()).optional(),
    project: z.string().optional(),
    context: z.string().optional(),
  }).describe('Updates to apply to all tasks'),
});

const CompleteTasksOperation = z.object({
  operation: z.literal('complete'),
  taskIds: z.array(IdSchema)
    .min(1)
    .describe('IDs of tasks to complete'),
  completionDate: LocalDateTimeSchema
    .optional()
    .describe('Completion date in your local time (defaults to now)'),
});

const DeleteTasksOperation = z.object({
  operation: z.literal('delete'),
  taskIds: z.array(IdSchema)
    .min(1)
    .describe('IDs of tasks to delete'),
});

// BatchTaskOperationsTool schema - discriminated union for type safety
export const BatchTaskOperationsSchema = z.discriminatedUnion('operation', [
  UpdateTasksOperation,
  CompleteTasksOperation,
  DeleteTasksOperation,
]);

// Type exports for TypeScript
export type ManageReviewsInput = z.infer<typeof ManageReviewsSchema>;
export type BatchTaskOperationsInput = z.infer<typeof BatchTaskOperationsSchema>;
