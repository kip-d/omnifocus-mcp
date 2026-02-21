import { z } from 'zod';
import { LocalDateTimeSchema, IdSchema } from './shared-schemas.js';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Consolidated tool schemas for better LLM usage
 */

// Review interval schema (extracted from project-schemas.ts)
export const ReviewIntervalSchema = z
  .object({
    unit: z.enum(['day', 'week', 'month', 'year']).describe('Time unit for review interval'),
    steps: z.number().int().positive().describe('Number of units between reviews'),
    fixed: z.boolean().optional().default(false).describe('Whether to use fixed scheduling (true) or floating (false)'),
  })
  .describe('Review interval configuration');

// Review management schema - single object with all parameters (MCP-compatible)
// Note: discriminatedUnion at top-level breaks MCP SDK JSON Schema serialization
// Runtime validation in OmniFocusAnalyzeTool checks required params per operation
export const ManageReviewsSchema = z.object({
  operation: z
    .enum(['list_for_review', 'mark_reviewed', 'set_schedule', 'clear_schedule'])
    .describe('Review operation to perform'),

  // list_for_review parameters
  overdue: coerceBoolean()
    .default(false)
    .optional()
    .describe('Show only projects overdue for review (list_for_review)'),
  daysAhead: coerceNumber()
    .int()
    .min(0)
    .max(365)
    .default(7)
    .optional()
    .describe('Include projects due for review within this many days (list_for_review)'),

  // mark_reviewed parameters
  projectId: IdSchema.optional().describe(
    'ID of the project to mark as reviewed (mark_reviewed) or clear schedule (clear_schedule with single project)',
  ),
  reviewDate: LocalDateTimeSchema.optional().describe(
    'Date of the review in your local time - defaults to now (mark_reviewed)',
  ),
  updateNextReviewDate: coerceBoolean()
    .default(true)
    .optional()
    .describe('Whether to automatically calculate the next review date based on the review interval (mark_reviewed)'),

  // set_schedule and clear_schedule parameters
  projectIds: z
    .array(IdSchema)
    .min(1)
    .optional()
    .describe('IDs of projects to update review schedules for (set_schedule) or clear schedules (clear_schedule)'),
  reviewInterval: ReviewIntervalSchema.optional().describe('Review interval to apply to all projects (set_schedule)'),
  nextReviewDate: LocalDateTimeSchema.optional().describe(
    'Next review date to set in your local time - if not provided, calculated from review interval (set_schedule)',
  ),
});

// Batch task operation schemas
const UpdateTasksOperation = z.object({
  operation: z.literal('update'),
  taskIds: z.array(IdSchema).min(1).describe('IDs of tasks to update'),
  updates: z
    .object({
      name: z.string().optional(),
      note: z.string().optional(),
      flagged: z.boolean().optional(),
      dueDate: LocalDateTimeSchema.optional(),
      deferDate: LocalDateTimeSchema.optional(),
      plannedDate: LocalDateTimeSchema.optional().describe('When the task is planned (OmniFocus 4.7+)'),
      tags: z.array(z.string()).optional(),
      project: z.string().optional(),
      context: z.string().optional(),
    })
    .describe('Updates to apply to all tasks'),
});

const CompleteTasksOperation = z.object({
  operation: z.literal('complete'),
  taskIds: z.array(IdSchema).min(1).describe('IDs of tasks to complete'),
  completionDate: LocalDateTimeSchema.optional().describe('Completion date in your local time (defaults to now)'),
});

const DeleteTasksOperation = z.object({
  operation: z.literal('delete'),
  taskIds: z.array(IdSchema).min(1).describe('IDs of tasks to delete'),
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
