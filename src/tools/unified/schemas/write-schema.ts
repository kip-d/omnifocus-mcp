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
const RepetitionRuleSchema = z
  .object({
    frequency: z.enum(['minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly']),
    interval: z
      .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
      .pipe(z.number().min(1))
      .optional()
      .default(1),
    // Fix 1: daysOfWeek must be DayOfWeek[] (object with day + optional position), not number[]
    daysOfWeek: z
      .array(
        z
          .object({
            day: z.enum(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']),
            position: z.number().optional(),
          })
          .strict(), // OMN-98: reject unknown keys in a daysOfWeek entry
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
  })
  .strict() satisfies z.ZodType<RepetitionRule, z.ZodTypeDef, unknown>; // OMN-98: last non-strict object in the write tree

// Key-set sync: catches missing optional fields (which `satisfies` alone allows through).
// If RepetitionRule gains or loses a field, `never = true` fails to compile.
const _repetitionRuleKeysSync: SameKeys<z.output<typeof RepetitionRuleSchema>, RepetitionRule> = true;
void _repetitionRuleKeysSync;

// Review interval: accepts days (number/string) or { steps, unit } object.
// Object form is what OmniFocus reads back; number form is what the script builder expects.
const UNIT_TO_DAYS: Record<string, number> = {
  days: 1,
  day: 1,
  weeks: 7,
  week: 7,
  months: 30,
  month: 30,
  years: 365,
  year: 365,
};

const ReviewIntervalObjectSchema = z
  .object({
    steps: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]).pipe(z.number().min(1)),
    unit: z.string(),
  })
  // OMN-99: .strict() rejects unknown keys (e.g. a typo'd `bogu`) instead of
  // silently stripping them — same data-loss class as OMN-76/97/98. Must chain
  // BEFORE .transform(): .strict() is a ZodObject method; .transform() returns
  // ZodEffects, which has none. This was the last non-strict object on the
  // write mutation tree.
  .strict()
  .transform((obj) => {
    const multiplier = UNIT_TO_DAYS[obj.unit.toLowerCase()] ?? 1;
    return obj.steps * multiplier;
  });

const ReviewIntervalSchema = z
  .union([z.number(), z.string().transform((v) => parseInt(v, 10)), ReviewIntervalObjectSchema])
  .pipe(z.number().min(1));

// Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm (never ISO-8601 with Z suffix)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;
const DATE_FORMAT_MSG = 'Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm';

// ── OMN-97: strict everywhere + actionable redirects ─────────────────
// `.strict()` does NOT propagate through discriminatedUnion/union (prior art
// OMN-90 on the read path), so every object literal in the mutation tree needs
// its own — otherwise a key at the wrong nesting level (e.g. `flagged` as a
// sibling of `data`) is silently stripped and the caller believes it was set.
//
// `.strict()`'s generic "Unrecognized key(s)" error is unhelpful for the
// handful of fields LLMs reach for that OmniFocus simply doesn't have (or
// names differently). We attach an errorMap that turns those into a loud error
// that ALSO names the supported alternative. Empirically the errorMap fires
// for unrecognized_keys at every depth — leaf `data`, member sibling, wrapper.
const WRITE_FIELD_REDIRECTS: Record<string, string> = {
  estimate: "use 'estimatedMinutes' (duration in minutes as a number)",
  context: "OmniFocus 3+ has no contexts — use 'tags'",
  priority: "OmniFocus has no priority levels — use 'flagged: true'",
  subtasks: "create children via a batch op with 'parentTempId' (or set 'parentTaskId' on create)",
};

// OMN-260: a bare root `{data:{...}}` (no `operation`, no `mutation`) is the
// recorded small-model failure shape that wrapper-lift structurally cannot
// repair — its discriminant gate is `'operation' in current`, and inferring
// the operation was declined with data (see normalize-input.ts at that gate).
// Reject-and-hint: the strict surface is unchanged, but the root-level error
// names the missing envelope so the caller gets an actionable correction.
// Root-only (path []): a misplaced `data` at a nested level has an envelope
// already — the generic unrecognized-key error is the right one there.
// Also gated on `mutation` being genuinely ABSENT from the root object
// (ctx.data): a valid `mutation` envelope alongside an unrelated stray root
// `data` key already HAS its envelope — claiming it's "missing" there would
// be actively misleading, not actionable.
const ROOT_DATA_ENVELOPE_HINT =
  'missing the mutation envelope: wrap the payload as ' +
  '{"mutation":{"operation":"create"|"update"|"complete"|"delete"|..., ...}} — ' +
  "'operation' is required and cannot be inferred from a bare 'data' object";

const writeAliasErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    const hints = issue.keys.filter((k) => k in WRITE_FIELD_REDIRECTS).map((k) => `${k} → ${WRITE_FIELD_REDIRECTS[k]}`);
    const rootData = ctx.data as unknown;
    const envelopeAbsent =
      typeof rootData === 'object' && rootData !== null && !('mutation' in (rootData as Record<string, unknown>));
    if (issue.path.length === 0 && issue.keys.includes('data') && envelopeAbsent) {
      hints.push(ROOT_DATA_ENVELOPE_HINT);
    }
    if (hints.length > 0) {
      return { message: `${ctx.defaultError}. ${hints.join('; ')}` };
    }
  }
  return { message: ctx.defaultError };
};

/**
 * Strict object literal with the write-path alias errorMap attached. Use for
 * EVERY object in the mutation tree so unknown keys are rejected (not stripped)
 * and the four known misplaced/aliased fields get an actionable message.
 */
const strictObj = <T extends z.ZodRawShape>(shape: T) => z.object(shape, { errorMap: writeAliasErrorMap }).strict();

// Create data schema — single source of truth for task/project creation fields.
// Both the unified write tool and batch-schemas derive from this.
// Exported for OMN-61 write-side parity testing (settable field ↔ builder).
//
// OMN-76: `.strict()` parity with UpdateChangesSchema. Without it, unknown
// fields the caller passes (e.g. `subtasks`, `context`, `priority`, `estimate`)
// were silently dropped on create — the call returned `success:true`, the
// fields vanished, and the OMN-37 failure-log/diagnose-failures pipeline never
// saw them (it only records Zod rejects + execution errors). Strictness turns
// silent data loss into a loud Zod rejection that `logToolFailure` records,
// closing the diagnose-pipeline blind spot.
export const CreateDataSchema = z
  .object(
    {
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
      folder: z
        .string()
        .describe(
          'Place the project in this folder. Accepts a bare name ("Shop Titans"), a nested path ("Personal : Other Games : Shop Titans" or "Personal/Other Games"), or a folder ID. Paths resolve as a strict parent→child chain from the root — partial paths do NOT resolve. An unresolvable folder returns an error (never a silent root placement). Omit for top-level.',
        )
        .optional(),
      sequential: coerceBoolean().optional(),
      status: z.enum(['active', 'on_hold', 'completed', 'dropped']).optional(),
      reviewInterval: ReviewIntervalSchema.optional(),
    },
    { errorMap: writeAliasErrorMap },
  ) // OMN-97: actionable redirects on unknown keys
  .strict();

// Update changes schema
// Exported for OMN-61 write-side parity testing (settable field ↔ builder).
export const UpdateChangesSchema = z
  .object(
    {
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
      folder: z
        .union([z.string(), z.null()])
        .describe(
          'Move the project to this folder. Same resolution as create: bare name, nested path (" : " or "/", strict parent→child chain), or folder ID. An unresolvable folder errors. null moves the project to the database root.',
        )
        .optional(),
      parentTaskId: z.union([z.string(), z.null()]).optional(), // Bug OMN-5: Update parent task relationship
      estimatedMinutes: z
        .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
        .pipe(z.number())
        .optional(),
      clearEstimatedMinutes: coerceBoolean().optional(), // Bug #18: Clear estimated time
      repetitionRule: z.union([RepetitionRuleSchema, z.null()]).optional(), // Set (object) or clear (null)
      // Project-specific update fields
      sequential: coerceBoolean().optional(),
      reviewInterval: ReviewIntervalSchema.optional(),
    },
    { errorMap: writeAliasErrorMap },
  ) // OMN-97: actionable redirects on unknown keys
  .strict();

// Folder create data schema — minimal: just name + optional parent folder
// OMN-97: strict so misplaced keys are rejected, not silently dropped.
const FolderCreateDataSchema = strictObj({
  name: z.string().min(1),
  parentFolder: z.string().optional(),
});

// Enhanced batch item schema with hierarchical relationships.
// Exported so batch-schemas.ts can derive from it (single source of truth).
export const BatchItemDataSchema = CreateDataSchema.extend({
  tempId: z.string().min(1).optional(),
  parentTempId: z.string().optional(),
});

// Batch operation schema - discriminated union
// OMN-97: each member strictObj() so a misplaced sibling of `data`/`changes`
// inside a batch entry is rejected, not silently stripped.
const BatchOperationSchema = z.discriminatedUnion('operation', [
  strictObj({
    operation: z.literal('create'),
    target: z.enum(['task', 'project']),
    data: BatchItemDataSchema,
  }),
  strictObj({
    operation: z.literal('update'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    changes: UpdateChangesSchema,
  }),
  strictObj({
    operation: z.literal('complete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    completionDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional(),
  }),
  strictObj({
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
  // Create operation (task/project)
  strictObj({
    operation: z.literal('create'),
    target: z.enum(['task', 'project']),
    data: CreateDataSchema,
    minimalResponse: z.boolean().optional(), // Bug #21: Reduce response size
  }),
  // Create folder operation
  strictObj({
    operation: z.literal('create_folder'),
    data: FolderCreateDataSchema,
  }),
  // Update operation
  // OMN-75: create uses `data`, update uses `changes` — the model trips on
  // the asymmetry and sends `data` on update. Accept `data` as a non-breaking
  // alias for `changes` (mirrors the OMN-71 target_id precedent); the
  // WriteSchema superRefine enforces exactly-one-present. `target` defaults to
  // 'task' (the model frequently omits it on update/complete); non-breaking
  // since a missing target was previously a hard error.
  strictObj({
    operation: z.literal('update'),
    target: z.enum(['task', 'project']).default('task'),
    id: z.string(),
    changes: UpdateChangesSchema.optional(),
    data: UpdateChangesSchema.optional(),
    minimalResponse: z.boolean().optional(), // Bug #21: Reduce response size
  }),
  // Complete operation
  strictObj({
    operation: z.literal('complete'),
    target: z.enum(['task', 'project']).default('task'), // OMN-75: model often omits target
    id: z.string(),
    // Bug #20: allows a custom completion timestamp. OMN-85: the regex
    // matches the dueDate/deferDate validation elsewhere on the write path
    // (and the batch-complete sibling at L187) — without it NL input
    // ("tomorrow") slipped through Zod and surfaced as uncategorized
    // INTERNAL_ERROR downstream instead of a clean VALIDATION_ERROR.
    completionDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional(),
    minimalResponse: z.boolean().optional(), // Bug #21: Reduce response size
  }),
  // Delete operation
  // OMN-71: the model consistently sends `target_id` (pairs with `target`),
  // a more consistent shape than `id`. Accept it as a non-breaking alias.
  // Both are optional here; the WriteSchema superRefine enforces exactly-one-
  // present so an empty delete still fails with a clear, schema-level error.
  strictObj({
    operation: z.literal('delete'),
    target: z.enum(['task', 'project']),
    id: z.string().optional(),
    target_id: z.string().optional(),
  }),
  // Batch operation with options
  strictObj({
    operation: z.literal('batch'),
    target: z.enum(['task', 'project']).optional(),
    operations: z.array(BatchOperationSchema),
    createSequentially: coerceBoolean().optional().default(true),
    atomicOperation: coerceBoolean().optional().default(false),
    returnMapping: coerceBoolean().optional().default(true),
    stopOnError: coerceBoolean().optional().default(true),
    dryRun: coerceBoolean().optional().default(false), // Preview without executing
  }),
  // Bulk delete operation - for efficient batch deletion
  strictObj({
    operation: z.literal('bulk_delete'),
    target: z.enum(['task', 'project']),
    ids: z.array(z.string()).min(1).max(100), // Limit to 100 items for safety
    dryRun: coerceBoolean().optional().default(false), // Preview without executing
  }),
  // Tag management operation
  strictObj({
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
export const WriteSchema = z
  .object(
    {
      mutation: coerceObject(MutationSchema),
    },
    { errorMap: writeAliasErrorMap }, // OMN-97
  )
  .strict() // OMN-97: reject unknown keys at the top-level wrapper (sibling of `mutation`)
  // OMN-71: delete accepts `id` OR its alias `target_id`. The discriminated-
  // union member can't carry a refinement (zod requires ZodObject members),
  // so enforce "exactly one identifier present" at the boundary schema — this
  // preserves the clear schema-level error a bare `{operation:'delete'}` got
  // when `id` was required.
  .superRefine((val, ctx) => {
    const m = val.mutation;
    if (m.operation === 'delete' && m.id === undefined && m.target_id === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mutation', 'id'],
        message: "delete requires 'id' (or its alias 'target_id')",
      });
    }
    // OMN-75: update accepts `changes` OR its alias `data`. Discriminated-
    // union members can't carry a refinement, so enforce exactly-one-present
    // here — preserves the clear error a bare update got when `changes` was
    // required.
    if (m.operation === 'update' && m.changes === undefined && m.data === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mutation', 'changes'],
        message: "update requires 'changes' (or its alias 'data')",
      });
    }
  });

export type WriteInput = z.infer<typeof WriteSchema>;
