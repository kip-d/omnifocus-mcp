/**
 * Zod schemas for batch operations
 */

import { z } from 'zod';
import { coerceBoolean } from '../schemas/coercion-helpers.js';
import { RepeatRuleSchema } from '../schemas/repeat-schemas.js';

/**
 * Base batch item schema
 */
const BaseBatchItemSchema = z.object({
  tempId: z.string()
    .min(1)
    .describe('Temporary ID for referencing this item within the batch'),

  parentTempId: z.string()
    .optional()
    .describe('Temporary ID of the parent (project for tasks, task for subtasks)'),

  name: z.string()
    .min(1)
    .describe('Name of the item'),

  note: z.string()
    .optional()
    .describe('Note/description'),

  tags: z.array(z.string())
    .optional()
    .describe('Tags to assign'),

  flagged: coerceBoolean()
    .optional()
    .describe('Whether to flag the item'),
});

/**
 * Project-specific fields
 */
const ProjectBatchItemSchema = BaseBatchItemSchema.extend({
  type: z.literal('project'),

  status: z.enum(['active', 'on-hold', 'done', 'dropped'])
    .optional()
    .describe('Project status'),

  sequential: coerceBoolean()
    .optional()
    .describe('Whether tasks must be completed in order'),

  reviewInterval: z.union([z.number(), z.string()])
    .optional()
    .describe('Review interval in days'),
});

/**
 * Task-specific fields
 */
const TaskBatchItemSchema = BaseBatchItemSchema.extend({
  type: z.literal('task'),

  dueDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format')
    .optional()
    .describe('Due date (YYYY-MM-DD or YYYY-MM-DD HH:mm)'),

  deferDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format')
    .optional()
    .describe('Defer date (YYYY-MM-DD or YYYY-MM-DD HH:mm)'),

  estimatedMinutes: z.union([z.number(), z.string()])
    .optional()
    .describe('Estimated duration in minutes'),

  sequential: coerceBoolean()
    .optional()
    .describe('Whether subtasks must be completed in order'),

  repetitionRule: RepeatRuleSchema
    .optional()
    .describe('Repeat rule for recurring tasks'),
});

/**
 * Discriminated union for batch items
 */
export const BatchItemSchema = z.discriminatedUnion('type', [
  ProjectBatchItemSchema,
  TaskBatchItemSchema,
]);

/**
 * Batch create operation schema
 */
export const BatchCreateSchema = z.object({
  items: z.array(BatchItemSchema)
    .min(1)
    .max(100)
    .describe('Items to create (max 100 per batch)'),

  createSequentially: coerceBoolean()
    .optional()
    .default(true)
    .describe('Create items in order (respects dependencies, default: true)'),

  atomicOperation: coerceBoolean()
    .optional()
    .default(false)
    .describe('Rollback all creations if any fail (default: false)'),

  returnMapping: coerceBoolean()
    .optional()
    .default(true)
    .describe('Return tempId -> realId mapping (default: true)'),

  stopOnError: coerceBoolean()
    .optional()
    .default(true)
    .describe('Stop processing on first error (default: true)'),
});

export type BatchCreateInput = z.infer<typeof BatchCreateSchema>;
export type BatchItem = z.infer<typeof BatchItemSchema>;
export type ProjectBatchItem = z.infer<typeof ProjectBatchItemSchema>;
export type TaskBatchItem = z.infer<typeof TaskBatchItemSchema>;