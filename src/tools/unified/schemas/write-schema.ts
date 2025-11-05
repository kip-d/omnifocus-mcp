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

// Batch operation schema
const BatchOperationSchema = z.object({
  operation: z.enum(['create', 'update']),
  target: z.enum(['task', 'project']),
  data: CreateDataSchema.optional(),
  id: z.string().optional(),
  changes: UpdateChangesSchema.optional(),
});

// Main write schema
export const WriteSchema = z.object({
  mutation: z.object({
    operation: z.enum(['create', 'update', 'complete', 'delete', 'batch']),
    target: z.enum(['task', 'project']),
    data: CreateDataSchema.optional(),
    id: z.string().optional(),
    changes: UpdateChangesSchema.optional(),
    operations: z.array(BatchOperationSchema).optional(),
  }),
}).superRefine((data, ctx) => {
  const { operation, data: createData, id, changes, operations } = data.mutation;

  // Validation rules per operation
  if (operation === 'create' && !createData) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'data is required for create operation',
      path: ['mutation', 'data'],
    });
  }

  if ((operation === 'update' || operation === 'complete' || operation === 'delete') && !id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'id is required for update/complete/delete operations',
      path: ['mutation', 'id'],
    });
  }

  if (operation === 'update' && !changes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'changes is required for update operation',
      path: ['mutation', 'changes'],
    });
  }

  if (operation === 'batch' && !operations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'operations is required for batch operation',
      path: ['mutation', 'operations'],
    });
  }
});

export type WriteInput = z.infer<typeof WriteSchema>;
