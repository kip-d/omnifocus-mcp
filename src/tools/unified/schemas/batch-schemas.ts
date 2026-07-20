/**
 * Zod schemas for batch operations
 *
 * Derived from the canonical CreateDataSchema in write-schema.ts
 * to prevent field drift. All creation fields (dates, tags, status, etc.)
 * are inherited automatically.
 */

import { z } from 'zod';
import { coerceBoolean } from '../../schemas/coercion-helpers.js';
import { BatchItemDataSchema } from './write-schema.js';

/**
 * Task batch item = unified schema + type discriminator.
 * Inherits all fields from CreateDataSchema: project, dates, tags,
 * estimatedMinutes, repetitionRule, status, etc.
 */
const TaskBatchItemSchema = BatchItemDataSchema.extend({
  type: z.literal('task'),
  tempId: z.string().min(1), // Required for batch operations (optional in unified API)
});

/**
 * Project batch item = unified schema + type discriminator.
 */
const ProjectBatchItemSchema = BatchItemDataSchema.extend({
  type: z.literal('project'),
  tempId: z.string().min(1), // Required for batch operations (optional in unified API)
});

/**
 * Discriminated union for batch items
 */
export const BatchItemSchema = z.discriminatedUnion('type', [ProjectBatchItemSchema, TaskBatchItemSchema]);

/**
 * Batch create operation schema
 */
export const BatchCreateSchema = z.object({
  items: z.array(BatchItemSchema).min(1).max(100).describe('Items to create (max 100 per batch)'),

  createSequentially: coerceBoolean()
    .optional()
    .default(true)
    .describe('Create items in order (respects dependencies, default: true)'),

  atomicOperation: coerceBoolean()
    .optional()
    .default(false)
    .describe(
      'Best-effort rollback of prior creations if any fail (default: false). ' +
        'If a compensating delete itself fails, the response reports rolledBack: "partial" ' +
        'plus a rollbackFailures list of orphaned items — check for it rather than assuming a clean undo. ' +
        'A top-level data.orphanedItems { count, ids } also appears in that case — check it before ' +
        'retrying the whole batch, or you will duplicate items that already persisted.',
    ),

  returnMapping: coerceBoolean().optional().default(true).describe('Return tempId -> realId mapping (default: true)'),

  stopOnError: coerceBoolean().optional().default(true).describe('Stop processing on first error (default: true)'),
});

export type BatchItem = z.infer<typeof BatchItemSchema>;
