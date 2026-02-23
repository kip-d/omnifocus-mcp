import { z } from 'zod';
import { coerceBoolean, coerceObject } from '../../schemas/coercion-helpers.js';
import type { RepetitionRule } from '../../../contracts/mutations.js';

// ── Schema ↔ contract sync guards ────────────────────────────────────
// Two complementary compile-time checks prevent schema/contract drift:
//   1. `satisfies z.ZodType<T>` on the schema — catches type mismatches and missing required fields
//   2. `SameKeys<A, B>` after the schema — catches missing optional fields (which `satisfies` allows)
// Together they guarantee the schema output is structurally identical to the contract.

/** Compile-time key-set equality. Resolves to `true` if A and B have identical keys, `never` otherwise. */
type SameKeys<A, B> =
  Exclude<keyof A, keyof B> extends never ? (Exclude<keyof B, keyof A> extends never ? true : never) : never;

// Repetition rule schema — derived from RepetitionRule contract via `satisfies`.
// Constrains output type only (input is `unknown` to allow MCP bridge string coercion).
// If the contract changes a field type, `satisfies` errors here.
const RepetitionRuleSchema = z.object({
  frequency: z.enum(['minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly']),
  interval: z
    .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
    .pipe(z.number().min(1))
    .optional()
    .default(1),
  // Fix 1: daysOfWeek must be DayOfWeek[] (object with day + optional position), not number[]
  daysOfWeek: z
    .array(
      z.object({
        day: z.enum(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']),
        position: z.number().optional(),
      }),
    )
    .optional(),
  // Fix 2: 4 missing fields that contract + script builder already support
  daysOfMonth: z.array(z.number().min(-31).max(31)).optional(),
  count: z
    .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
    .pipe(z.number().min(1))
    .optional(),
  weekStart: z.enum(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']).optional(),
  setPositions: z.array(z.number().min(-366).max(366)).optional(),
  endDate: z.string().optional(),
  // OmniFocus 4.7+ repetition method control
  method: z.enum(['fixed', 'due-after-completion', 'defer-after-completion', 'none']).optional(),
  scheduleType: z.enum(['regularly', 'from-completion', 'none']).optional(),
  anchorDateKey: z.enum(['due-date', 'defer-date', 'planned-date']).optional(),
  // Fix 4: coerceBoolean for MCP bridge compatibility (Claude Desktop sends strings)
  catchUpAutomatically: coerceBoolean().optional(),
}) satisfies z.ZodType<RepetitionRule, z.ZodTypeDef, unknown>;

// Key-set sync: catches missing optional fields (which `satisfies` alone allows through).
// If RepetitionRule gains or loses a field, `never = true` fails to compile.
const _repetitionRuleKeysSync: SameKeys<z.output<typeof RepetitionRuleSchema>, RepetitionRule> = true;
void _repetitionRuleKeysSync;

// Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm (never ISO-8601 with Z suffix)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;
const DATE_FORMAT_MSG = 'Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm';

// Create data schema — single source of truth for task/project creation fields.
// Both the unified write tool and batch-schemas derive from this.
const CreateDataSchema = z.object({
  name: z.string().min(1),
  note: z.string().optional(),
  project: z.union([z.string(), z.null()]).optional(),
  parentTaskId: z.string().optional(), // Bug #17: Enable subtask creation
  tags: z.array(z.string()).optional(),
  dueDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional(),
  deferDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional(),
  plannedDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional(),
  flagged: coerceBoolean().optional(),
  estimatedMinutes: z
    .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
    .pipe(z.number())
    .optional(),
  repetitionRule: RepetitionRuleSchema.optional(),

  // Project-specific
  folder: z.string().optional(),
  sequential: coerceBoolean().optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'dropped']).optional(),
});

// Update changes schema
const UpdateChangesSchema = z
  .object({
    name: z.string().optional(),
    note: z.string().optional(),
    tags: z.array(z.string()).optional(),
    addTags: z.array(z.string()).optional(),
    removeTags: z.array(z.string()).optional(),
    dueDate: z.union([z.string(), z.null()]).optional(),
    deferDate: z.union([z.string(), z.null()]).optional(),
    plannedDate: z.union([z.string(), z.null()]).optional(),
    clearDueDate: coerceBoolean().optional(),
    clearDeferDate: coerceBoolean().optional(),
    clearPlannedDate: coerceBoolean().optional(),
    flagged: coerceBoolean().optional(),
    // Note: tasks only support 'completed'/'dropped'; projects support all 4.
    // Task-specific narrowing happens in sanitizer + script builder.
    status: z.enum(['active', 'on_hold', 'completed', 'dropped']).optional(),
    project: z.union([z.string(), z.null()]).optional(),
    folder: z.union([z.string(), z.null()]).optional(),
    parentTaskId: z.union([z.string(), z.null()]).optional(), // Bug OMN-5: Update parent task relationship
    estimatedMinutes: z
      .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
      .pipe(z.number())
      .optional(),
    clearEstimatedMinutes: coerceBoolean().optional(), // Bug #18: Clear estimated time
    clearRepeatRule: coerceBoolean().optional(), // Bug #19: Clear repetition rule
    repetitionRule: RepetitionRuleSchema.optional(), // Bug: Was missing from update schema
    // Project-specific update fields
    sequential: coerceBoolean().optional(),
    reviewInterval: z
      .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
      .pipe(z.number())
      .optional(),
  })
  .strict();

// Enhanced batch item schema with hierarchical relationships.
// Exported so batch-schemas.ts can derive from it (single source of truth).
export const BatchItemDataSchema = CreateDataSchema.extend({
  tempId: z.string().min(1).optional(),
  parentTempId: z.string().optional(),
  reviewInterval: z
    .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
    .pipe(z.number())
    .optional(),
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
  z.object({
    operation: z.literal('complete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    completionDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional(),
  }),
  z.object({
    operation: z.literal('delete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
  }),
]);

// Tag management action enum
const TagActionSchema = z.enum([
  'create', // Create a new tag
  'rename', // Rename a tag
  'delete', // Delete a tag
  'merge', // Merge source tag into target tag
  'nest', // Move tag under a parent tag
  'unnest', // Move tag to root level (alias for unparent)
  'reparent', // Move tag to a different parent
]);

// Mutation schema - discriminated union by operation
const MutationSchema = z.discriminatedUnion('operation', [
  // Create operation
  z.object({
    operation: z.literal('create'),
    target: z.enum(['task', 'project']),
    data: CreateDataSchema,
    minimalResponse: z.boolean().optional(), // Bug #21: Reduce response size
  }),
  // Update operation
  z.object({
    operation: z.literal('update'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    changes: UpdateChangesSchema,
    minimalResponse: z.boolean().optional(), // Bug #21: Reduce response size
  }),
  // Complete operation
  z.object({
    operation: z.literal('complete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    completionDate: z.string().optional(), // Bug #20: Allow custom completion date
    minimalResponse: z.boolean().optional(), // Bug #21: Reduce response size
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
    createSequentially: coerceBoolean().optional().default(true),
    atomicOperation: coerceBoolean().optional().default(false),
    returnMapping: coerceBoolean().optional().default(true),
    stopOnError: coerceBoolean().optional().default(true),
    dryRun: coerceBoolean().optional().default(false), // Preview without executing
  }),
  // Bulk delete operation - for efficient batch deletion
  z.object({
    operation: z.literal('bulk_delete'),
    target: z.enum(['task', 'project']),
    ids: z.array(z.string()).min(1).max(100), // Limit to 100 items for safety
    dryRun: coerceBoolean().optional().default(false), // Preview without executing
  }),
  // Tag management operation
  z.object({
    operation: z.literal('tag_manage'),
    action: TagActionSchema,
    tagName: z.string().min(1).describe('The tag name to operate on'),
    newName: z.string().optional().describe('New name for rename action'),
    targetTag: z.string().optional().describe('Target tag for merge action'),
    parentTag: z.string().optional().describe('Parent tag name for nest/reparent actions'),
  }),
]);

// Main write schema
// Note: coerceObject handles JSON string->object conversion from MCP bridge
export const WriteSchema = z.object({
  mutation: coerceObject(MutationSchema),
});

export type WriteInput = z.infer<typeof WriteSchema>;
