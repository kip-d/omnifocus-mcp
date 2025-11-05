import { z } from 'zod';

// Repetition rule schema
const RepetitionRuleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().min(1),
  daysOfWeek: z.array(z.number().min(1).max(7)).optional(),
  endDate: z.string().optional(),
});

// Create data schema
const CreateDataSchema = z.object({
  name: z.string().min(1),
  note: z.string().optional(),
  project: z.union([z.string(), z.null()]).optional(),
  tags: z.array(z.string()).optional(),
  dueDate: z.string().optional(),
  deferDate: z.string().optional(),
  flagged: z.boolean().optional(),
  estimatedMinutes: z.number().optional(),
  repetitionRule: RepetitionRuleSchema.optional(),

  // Project-specific
  folder: z.string().optional(),
  sequential: z.boolean().optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'dropped']).optional(),
});

// Update changes schema
const UpdateChangesSchema = z.object({
  name: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  addTags: z.array(z.string()).optional(),
  removeTags: z.array(z.string()).optional(),
  dueDate: z.union([z.string(), z.null()]).optional(),
  deferDate: z.union([z.string(), z.null()]).optional(),
  flagged: z.boolean().optional(),
  status: z.enum(['completed', 'dropped']).optional(),
  project: z.union([z.string(), z.null()]).optional(),
  estimatedMinutes: z.number().optional(),
}).passthrough();

// Enhanced batch item schema with hierarchical relationships
const BatchItemDataSchema = CreateDataSchema.extend({
  tempId: z.string().min(1).optional(),
  parentTempId: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  sequential: z.boolean().optional(),
  reviewInterval: z.number().optional(),
});

// Batch operation schema - discriminated union
const BatchOperationSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('create'),
    target: z.enum(['task', 'project']),
    data: BatchItemDataSchema,
  }),
  z.object({
    operation: z.literal('update'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    changes: UpdateChangesSchema,
  }),
]);

// Mutation schema - discriminated union by operation
const MutationSchema = z.discriminatedUnion('operation', [
  // Create operation
  z.object({
    operation: z.literal('create'),
    target: z.enum(['task', 'project']),
    data: CreateDataSchema,
  }),
  // Update operation
  z.object({
    operation: z.literal('update'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    changes: UpdateChangesSchema,
  }),
  // Complete operation
  z.object({
    operation: z.literal('complete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
  }),
  // Delete operation
  z.object({
    operation: z.literal('delete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
  }),
  // Batch operation with options
  z.object({
    operation: z.literal('batch'),
    target: z.enum(['task', 'project']),
    operations: z.array(BatchOperationSchema),
    createSequentially: z.boolean().optional().default(true),
    atomicOperation: z.boolean().optional().default(false),
    returnMapping: z.boolean().optional().default(true),
    stopOnError: z.boolean().optional().default(true),
  }),
]);

// Main write schema
export const WriteSchema = z.object({
  mutation: MutationSchema,
});

export type WriteInput = z.infer<typeof WriteSchema>;
