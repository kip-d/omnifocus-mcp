import { z } from 'zod';
import { 
  DateTimeSchema, 
  IdSchema,
} from './shared-schemas.js';
import { ReviewIntervalSchema } from './project-schemas.js';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Consolidated tool schemas for better LLM usage
 */

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
  reviewDate: DateTimeSchema
    .optional()
    .describe('Date of the review (defaults to now)'),
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
  nextReviewDate: DateTimeSchema
    .optional()
    .describe('Next review date to set (if not provided, calculated from review interval)'),
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
    dueDate: DateTimeSchema.optional(),
    deferDate: DateTimeSchema.optional(),
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
  completionDate: DateTimeSchema
    .optional()
    .describe('Completion date (defaults to now)'),
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