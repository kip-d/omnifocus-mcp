import { z } from 'zod';
import { coerceBoolean, coerceObject } from '../../schemas/coercion-helpers.js';
import type { RepetitionRule } from '../../../contracts/mutations.js';
import { isPlainObject } from '../../normalization/normalize-input.js';

// ── Schema ↔ contract sync guards ────────────────────────────────────
// Two complementary compile-time checks prevent schema/contract drift:
//   1. `satisfies z.ZodType<T>` on the schema — catches type mismatches and missing required fields
//   2. `SameKeys<A, B>` after the schema — catches missing optional fields (which `satisfies` allows)
// Together they guarantee the schema output is structurally identical to the contract.

/** Compile-time key-set equality. Resolves to `true` if A and B have identical keys, `never` otherwise. */
type SameKeys<A, B> =
  Exclude<keyof A, keyof B> extends never ? (Exclude<keyof B, keyof A> extends never ? true : never) : never;

// Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm (never ISO-8601 with Z suffix)
// Siblings — keep in step: ITEM_DATE_REGEX (analyze-schema.ts) mirrors this; the
// read-filter validator LOCAL_DATE_RE (utils/timezone.ts, OMN-332) is stricter.
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;
const DATE_FORMAT_MSG = 'Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm';

// OMN-343 (F8): repetitionRule.endDate is spliced raw into an RRULE UNTIL
// (mutation/repetition.ts: `rule.endDate.replace(/-/g, '')`), which only
// strips dashes — a time component would survive into the UNTIL value as a
// stray space/colon and produce a malformed RRULE. Date-only, no HH:mm.
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_FORMAT_MSG = 'Date format: YYYY-MM-DD (date only — RRULE UNTIL has no time component)';

// OMN-343 (slice 2, residual F1/F2/F8): DATE_REGEX/DATE_ONLY_REGEX only check
// FORMAT — they accept calendar-invalid values like "2026-13-01" (month 13),
// "2026-10-21 25:00" (hour 25), and "2026-02-30" (day-of-month overflow).
// Downstream, `localToUTC`'s `new Date(...)` either throws (month/hour/minute
// out of JS's parseable range) or silently ROLLS OVER ("2026-02-30" becomes
// 2026-03-02). On a task update, sanitizeDateField's catch then DROPPED the
// field (silent no-op success) while handleProjectUpdateDirect's bare
// localToUTC call threw — the exact F1/F2 target disagreement slice 1 closed
// for non-conforming FORMATS survives for conforming-but-invalid ones. Fixed
// at the schema, not the sanitizer, so every route (single, batch, create,
// update, complete, repetitionRule.endDate) rejects identically before any
// script runs.
const DAYS_IN_MONTH_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** True if `year` is a leap year (Gregorian rule), without going through `Date`. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH_TABLE = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

// OMN-343 (slice 2, gate finding B): the previous implementation computed this
// via `new Date(Date.UTC(year, month, 0)).getUTCDate()` — `Date.UTC` maps a
// 2-digit-range year (0-99) to 1900+year per the ECMAScript spec, so year 0
// silently read back as 1900 (not leap) instead of staying year 0 (leap, by
// `% 400 === 0`). Pure arithmetic sidesteps the Date year-remap behavior
// entirely so this is correct for every year, not just those outside 0-99.
/** Last day of `month` (1-12) in `year`, leap-year aware. */
function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH_TABLE[month - 1];
}

/**
 * True if `value` (already known to match DATE_REGEX or DATE_ONLY_REGEX — the
 * `.regex()` check runs first in the schemas below) is also a real calendar
 * date/time: month 1-12, day 1..daysInMonth(year, month), and — when a time
 * component is present — hour 0-23, minute/second 0-59.
 */
function isCalendarValidDate(value: string): boolean {
  const m = DAYS_IN_MONTH_RE.exec(value);
  if (!m) return false; // defensive — the .regex() check already guarantees this matches
  // `exec`'s static array type doesn't model that the time-component groups
  // are OPTIONAL (unmatched groups are `undefined` at runtime even though
  // TS's RegExpExecArray types every element as `string`) — cast narrows to
  // the true runtime shape so the undefined-checks below aren't flagged as
  // statically-always-true.
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = m as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
    string | undefined,
    string | undefined,
  ];
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hourStr !== undefined) {
    if (Number(hourStr) > 23) return false;
    if (Number(minuteStr) > 59) return false;
    if (secondStr !== undefined && Number(secondStr) > 59) return false;
  }
  return true;
}

const calendarInvalidMessage = (formatMsg: string) => (value: string) => ({
  message: `Invalid calendar date: "${value}". ${formatMsg}`,
});

/** Shared date-or-datetime string schema (DATE_REGEX + calendar-validity). One
 * definition so every date field (create/update dueDate/deferDate/plannedDate,
 * complete's completionDate, single and batch) rejects the same inputs the
 * same way. */
const dateTimeStringSchema = () =>
  z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).refine(isCalendarValidDate, calendarInvalidMessage(DATE_FORMAT_MSG));

/** Shared date-only string schema (DATE_ONLY_REGEX + calendar-validity) — repetitionRule.endDate. */
const dateOnlyStringSchema = () =>
  z
    .string()
    .regex(DATE_ONLY_REGEX, DATE_ONLY_FORMAT_MSG)
    .refine(isCalendarValidDate, calendarInvalidMessage(DATE_ONLY_FORMAT_MSG));

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
    endDate: dateOnlyStringSchema().optional(),
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

// OMN-343 (F10, D3): closed, case-insensitive enum of UNIT_TO_DAYS keys. An
// unknown unit (e.g. 'quarter', 'fortnight') previously fell through `?? 1`
// to a silent DAILY interval — success response, wrong schedule, no signal.
// Validate against the lowercased key set and reject loudly; the error lists
// every accepted form so the caller can self-correct.
const VALID_REVIEW_UNITS = Object.keys(UNIT_TO_DAYS);
const REVIEW_UNIT_MSG = `unit must be one of: ${VALID_REVIEW_UNITS.join(', ')} (case-insensitive)`;

const ReviewIntervalObjectSchema = z
  .object({
    steps: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]).pipe(z.number().min(1)),
    // An own-key check, not `in`: `in` also matches Object.prototype keys
    // (`constructor`, `__proto__`), which then failed later with a generic error.
    unit: z.string().refine((v) => VALID_REVIEW_UNITS.includes(v.toLowerCase()), { message: REVIEW_UNIT_MSG }),
  })
  // OMN-99: .strict() rejects unknown keys (e.g. a typo'd `bogu`) instead of
  // silently stripping them — same data-loss class as OMN-76/97/98. Must chain
  // BEFORE .transform(): .strict() is a ZodObject method; .transform() returns
  // ZodEffects, which has none. This was the last non-strict object on the
  // write mutation tree.
  .strict()
  .transform((obj) => {
    const multiplier = UNIT_TO_DAYS[obj.unit.toLowerCase()];
    return obj.steps * multiplier;
  });

const ReviewIntervalNumericSchema = z
  .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
  .pipe(z.number().min(1));

// OMN-343 (slice 2, live-found gap from slice 1): a plain z.union([number,
// string, object]) collapses ALL branch failures into a single top-level
// `invalid_union` issue with a generic "Invalid input" message — the nested
// REVIEW_UNIT_MSG (e.g. for `{steps:1, unit:'quarter'}`) is buried inside
// `unionErrors` and never reaches the client (base.ts's VALIDATION_ERROR text
// only reads the TOP-LEVEL issue's `.message`). Dispatch on the input SHAPE
// instead of unioning: an object goes through ReviewIntervalObjectSchema
// directly, so ITS issues (unit enum, strict, steps) surface at their own
// path with their own message, not wrapped in a union. Number/string go
// through the numeric branch the same way. `ctx.addIssue` re-homes each
// sub-schema issue under the current path (zod concatenates), so e.g.
// `changes.reviewInterval` + the object schema's `unit` issue path →
// `changes.reviewInterval.unit`.
const ReviewIntervalSchema = z.unknown().transform((val, ctx) => {
  if (isPlainObject(val)) {
    const result = ReviewIntervalObjectSchema.safeParse(val);
    if (result.success) return result.data;
    for (const issue of result.error.issues) ctx.addIssue(issue);
    return z.NEVER;
  }
  const result = ReviewIntervalNumericSchema.safeParse(val);
  if (result.success) return result.data;
  for (const issue of result.error.issues) ctx.addIssue(issue);
  return z.NEVER;
});

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
    const envelopeAbsent = isPlainObject(rootData) && !('mutation' in rootData);
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
      dueDate: dateTimeStringSchema().optional(),
      deferDate: dateTimeStringSchema().optional(),
      plannedDate: dateTimeStringSchema().optional(),
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
      // OMN-343 (F1/F2): DATE_REGEX parity with create. Previously a bare
      // z.string() let NL input ("next friday") through Zod; sanitizeDateField
      // caught the downstream localToUTC throw and silently dropped the field
      // (task update: success, change ignored) while handleProjectUpdateDirect's
      // bare localToUTC call threw (project update: error) — the same input
      // disagreed by target. null still validates (clears the field).
      dueDate: z.union([dateTimeStringSchema(), z.null()]).optional(),
      deferDate: z.union([dateTimeStringSchema(), z.null()]).optional(),
      plannedDate: z.union([dateTimeStringSchema(), z.null()]).optional(),
      clearDueDate: coerceBoolean().optional(),
      clearDeferDate: coerceBoolean().optional(),
      clearPlannedDate: coerceBoolean().optional(),
      flagged: coerceBoolean().optional(),
      // Tasks: completed | dropped | active (reopen); projects: all 4.
      // OMN-377: on_hold on a task is rejected by the WriteSchema superRefine.
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
    completionDate: dateTimeStringSchema().optional(),
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
    completionDate: dateTimeStringSchema().optional(),
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
    // OMN-346 (D2): the advertised contract is 1–100 operations (inputSchema
    // minItems/maxItems match). Large batches risk the script-size and timeout
    // limits, so an oversized one is rejected with a split hint, not run.
    operations: z
      .array(BatchOperationSchema)
      .min(1, 'A batch needs at least 1 operation')
      .max(100, 'A batch allows at most 100 operations; split larger work into batches of 100 or fewer'),
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

// OMN-377: one predicate + message for the single-update and batch-item checks
// below, so the two routes can't drift apart.
const isTaskOnHold = (target: string, changes: { status?: string } | undefined): boolean =>
  target === 'task' && changes?.status === 'on_hold';
const TASK_ON_HOLD_MESSAGE =
  'status "on_hold" is project-only — tasks accept completed, dropped, or active (reopen). ' +
  'To postpone a task set deferDate; to pause it with its project, put the project on_hold.';

// ── OMN-343 (slice 2, D1(b)): target-mismatch field table ────────────────────
// A field settable on one target but not the other previously validated for
// BOTH (one CreateDataSchema/UpdateChangesSchema serves task and project) and
// was then silently dropped by the handler that doesn't read it (spec F3-F7).
// These sets are verified against the actual consuming code, not just the
// TaskCreateData/ProjectCreateData/TaskUpdateData/ProjectUpdateData contract
// interfaces: every lowering in src/contracts/ast/mutation/defs.ts carries a
// compile-time exhaustiveness guard (`_exhaustive: Record<keyof T, true>`)
// enumerating exactly the fields it consumes — that guard is the ground
// truth these lists were read off, not the schema's own comments (which had
// drifted: `sequential`/`status` were commented "Project-specific" above
// `folder` in CreateDataSchema despite being legal on tasks too).
//
// Fields NOT listed either way (name, note, tags, addTags, removeTags,
// dueDate/deferDate/plannedDate + their clear flags, flagged, sequential) are
// genuinely common to both targets — confirmed by both exhaustiveness guards
// consuming them. `status` is also common on UPDATE (task: completed|dropped
// |active; project: all four, on_hold handled above) so it is deliberately
// absent from the UPDATE tables; CREATE has no task-side status support at
// all (TaskCreateData has no `status` field — handleTaskCreate never reads
// compiled.data.status), so CREATE's PROJECT_ONLY table includes it.
// Exported (not just module-local) so tests/unit/tools/unified/schemas/
// write-schema-target-mismatch-contract-sync.test.ts can assert, at compile
// time, that these tuples' element unions equal keyof TaskCreateData/
// ProjectCreateData/TaskUpdateData/ProjectUpdateData set-differences — the
// sync guard these lists had none of before (see the comment above).
export const CREATE_TASK_ONLY_FIELDS = ['parentTaskId', 'estimatedMinutes', 'repetitionRule', 'project'] as const;
export const CREATE_PROJECT_ONLY_FIELDS = ['folder', 'status', 'reviewInterval'] as const;
export const UPDATE_TASK_ONLY_FIELDS = [
  'parentTaskId',
  'estimatedMinutes',
  'clearEstimatedMinutes',
  'repetitionRule',
  'project',
] as const;
export const UPDATE_PROJECT_ONLY_FIELDS = ['folder', 'reviewInterval'] as const;

// One message per field: names the field AND the owning target, with brief
// steering toward the right alternative (mirrors TASK_ON_HOLD_MESSAGE's style).
const TARGET_MISMATCH_MESSAGES: Record<string, string> = {
  parentTaskId:
    '"parentTaskId" is task-only — projects cannot be nested under a task. Omit it, or use "folder" to place the project.',
  estimatedMinutes:
    '"estimatedMinutes" is task-only — projects have no time estimate. Set it on the project\'s tasks instead.',
  clearEstimatedMinutes: '"clearEstimatedMinutes" is task-only — projects have no time estimate to clear.',
  repetitionRule:
    '"repetitionRule" is task-only — projects do not repeat. Set repetitionRule on the project\'s tasks instead.',
  project:
    '"project" is task-only — a project cannot be filed inside another project. Use "folder" to organize projects into folders.',
  folder:
    '"folder" is project-only — tasks don\'t have a folder. Set the task\'s "project" to file it, or "parentTaskId" for a subtask.',
  status:
    '"status" is project-only on create — tasks have no status at creation. Create the task, then update it with changes.status (completed|dropped|active).',
  reviewInterval:
    '"reviewInterval" is project-only — tasks don\'t have reviews. Set reviewInterval on the project instead.',
};

function targetMismatchMessage(field: string, target: 'task' | 'project'): string {
  return (
    TARGET_MISMATCH_MESSAGES[field] ?? `"${field}" is not supported on ${target === 'project' ? 'projects' : 'tasks'}.`
  );
}

/**
 * Add a VALIDATION_ERROR issue for every field present in `obj` that the
 * given `target` doesn't support, per the create/update field tables above.
 * Shared by the single-item, `data`-alias, and batch-item checks below so
 * the three routes can't drift apart (same discipline as isTaskOnHold).
 */
function addTargetMismatchIssues(
  ctx: z.RefinementCtx,
  basePath: Array<string | number>,
  target: 'task' | 'project',
  obj: Record<string, unknown> | undefined,
  taskOnlyFields: readonly string[],
  projectOnlyFields: readonly string[],
): void {
  if (!obj) return;
  const forbidden = target === 'project' ? taskOnlyFields : projectOnlyFields;
  for (const field of forbidden) {
    if (obj[field] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...basePath, field],
        message: targetMismatchMessage(field, target),
      });
    }
  }
}

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
    // OMN-377: tasks have no on-hold state (OmniFocus models it on the
    // project). The sanitizer used to strip it, returning success with
    // "No valid updates provided" — reject it here on every task-update route.
    const onHold = (path: Array<string | number>) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: TASK_ON_HOLD_MESSAGE });
    if (m.operation === 'update') {
      // Check both aliases, not just the one `changes ?? data` picks — keeps
      // this rejection independent of the compiler's precedence.
      if (isTaskOnHold(m.target, m.changes)) onHold(['mutation', 'changes', 'status']);
      if (isTaskOnHold(m.target, m.data)) onHold(['mutation', 'data', 'status']);
    }
    if (m.operation === 'batch') {
      m.operations.forEach((op, i) => {
        if (op.operation === 'update' && isTaskOnHold(op.target, op.changes)) {
          onHold(['mutation', 'operations', i, 'changes', 'status']);
        }
      });
    }

    // OMN-343 (slice 2): target-mismatched fields (F3-F7) — a field settable
    // on one target but not the other must reject, not silently vanish. Fires
    // for single create, single update (both the `changes` and `data`
    // aliases), and per batch item (create and update sub-ops).
    if (m.operation === 'create') {
      addTargetMismatchIssues(
        ctx,
        ['mutation', 'data'],
        m.target,
        m.data as Record<string, unknown> | undefined,
        CREATE_TASK_ONLY_FIELDS,
        CREATE_PROJECT_ONLY_FIELDS,
      );
    }
    if (m.operation === 'update') {
      addTargetMismatchIssues(
        ctx,
        ['mutation', 'changes'],
        m.target,
        m.changes as Record<string, unknown> | undefined,
        UPDATE_TASK_ONLY_FIELDS,
        UPDATE_PROJECT_ONLY_FIELDS,
      );
      addTargetMismatchIssues(
        ctx,
        ['mutation', 'data'],
        m.target,
        m.data as Record<string, unknown> | undefined,
        UPDATE_TASK_ONLY_FIELDS,
        UPDATE_PROJECT_ONLY_FIELDS,
      );
    }
    if (m.operation === 'batch') {
      m.operations.forEach((op, i) => {
        if (op.operation === 'create') {
          addTargetMismatchIssues(
            ctx,
            ['mutation', 'operations', i, 'data'],
            op.target,
            op.data as Record<string, unknown> | undefined,
            CREATE_TASK_ONLY_FIELDS,
            CREATE_PROJECT_ONLY_FIELDS,
          );
        }
        if (op.operation === 'update') {
          addTargetMismatchIssues(
            ctx,
            ['mutation', 'operations', i, 'changes'],
            op.target,
            op.changes as Record<string, unknown> | undefined,
            UPDATE_TASK_ONLY_FIELDS,
            UPDATE_PROJECT_ONLY_FIELDS,
          );
        }
      });
    }
  });

export type WriteInput = z.infer<typeof WriteSchema>;
