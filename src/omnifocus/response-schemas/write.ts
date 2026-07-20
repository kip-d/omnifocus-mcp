import { z } from 'zod';
import { isoDate, isoDateOrNull, warningsArray, reviewSuccessSchema } from './common.js';

// ---------------------------------------------------------------------------
// Review-family typed schemas (OMN-158 Task 3)
// ---------------------------------------------------------------------------

/**
 * Review-list project row — emitted by projects-for-review.ts OmniJS script.
 * Source: projectObj built per project: id, name, status, flagged, sequential, completedByChildren always set.
 * note, folder, dueDate, deferDate, lastReviewDate, nextReviewDate, reviewInterval, taskCounts optional (if blocks).
 */
const ReviewListProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    flagged: z.boolean(),
    sequential: z.boolean(),
    completedByChildren: z.boolean(),
    note: z.string().optional(),
    folder: z.string().optional(),
    dueDate: isoDate.optional(),
    deferDate: isoDate.optional(),
    lastReviewDate: isoDate.optional(),
    nextReviewDate: isoDate.optional(),
    reviewInterval: z.object({ unit: z.string(), steps: z.number() }).strict().optional(),
    taskCounts: z.object({ total: z.number(), available: z.number(), completed: z.number() }).strict().optional(),
  })
  .strict();

/**
 * Review-list metadata — emitted by projects-for-review.ts.
 * Source: metadata: {total_found, filter_applied (passthrough echo), generated_at, search_criteria (passthrough echo)}.
 * The metadata literal always emits all four keys on the success branch.
 * filter_applied echoes the raw filter param → z.unknown() (always-present echo, NOT optional).
 * search_criteria echoes derived criteria → z.unknown() (always-present echo, NOT optional).
 */
const ReviewListMetadataSchema = z
  .object({
    total_found: z.number(),
    // passthrough echoes of caller filter/criteria — value shape varies, but the key is always
    // present (both emitted as object literals: filter || {} and a 4-key criteria object).
    // z.record keeps the value open while enforcing key-presence — z.unknown() accepts absence.
    filter_applied: z.record(z.unknown()),
    generated_at: isoDate,
    search_criteria: z.record(z.unknown()),
  })
  .strict();

/** Module-scope reviews_list envelope (REVIEWS_LIST_SCHEMA). metadata always emitted on success. */
export const REVIEWS_LIST_TYPED_SCHEMA = reviewSuccessSchema({
  projects: z.array(ReviewListProjectSchema),
  metadata: ReviewListMetadataSchema,
});

/**
 * Mark-project-reviewed result — emitted by mark-project-reviewed.ts.
 * Source: success branch returns {success:true, project:{id, name, lastReviewDate, nextReviewDate, reviewInterval}, changes, message}.
 * reviewInterval is intervalInfo = interval ? {unit, steps} : null.
 */
const MarkReviewedProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    lastReviewDate: isoDateOrNull,
    nextReviewDate: isoDateOrNull,
    reviewInterval: z.object({ unit: z.string(), steps: z.number() }).strict().nullable(),
  })
  .strict();

/** Module-scope mark-project-reviewed envelope (MARK_REVIEWED_SCHEMA). changes/message always emitted on success. */
export const MARK_REVIEWED_TYPED_SCHEMA = reviewSuccessSchema({
  project: MarkReviewedProjectSchema,
  changes: z.array(z.string()),
  message: z.string(),
});

/**
 * Set-review-schedule successful entry — emitted by set-review-schedule.ts results.successful[].
 * Source: results.successful.push({projectId, projectName, changes, reviewInterval (read-back), nextReviewDate}).
 * reviewInterval read-back: ri ? {unit, steps} : null; nextReviewDate: ISO string or null.
 */
const SetScheduleSuccessEntrySchema = z
  .object({
    projectId: z.string(),
    projectName: z.string(),
    changes: z.array(z.string()),
    reviewInterval: z.object({ unit: z.string(), steps: z.number() }).strict().nullable(),
    nextReviewDate: isoDateOrNull,
  })
  .strict();

/**
 * Set-review-schedule failed entry — emitted by set-review-schedule.ts results.failed[].
 * Source: failed.push({projectId, error}) or failed.push({projectId, projectName, error}).
 * projectName is optional: early failures (project not found) omit it.
 */
const SetScheduleFailedEntrySchema = z
  .object({
    projectId: z.string(),
    projectName: z.string().optional(),
    error: z.string(),
  })
  .strict();

/**
 * Mark-projects-reviewed batch successful entry (OMN-256) — emitted by
 * applyMarkReviewedBatch's results.successful[] push.
 * Source: {projectId, projectName, changes, lastReviewDate, nextReviewDate}.
 */
const MarkReviewedBatchSuccessEntrySchema = z
  .object({
    projectId: z.string(),
    projectName: z.string(),
    changes: z.array(z.string()),
    lastReviewDate: isoDateOrNull,
    nextReviewDate: isoDateOrNull,
  })
  .strict();

/**
 * Mark-projects-reviewed batch failed entry (OMN-256) — emitted by
 * applyMarkReviewedBatch's results.failed[] push. Structurally identical to
 * SetScheduleFailedEntrySchema (same {projectId, projectName?, error}, same
 * .strict()); reuse it directly so the two batch-review failed-entry
 * validators can't silently drift.
 */
const MarkReviewedBatchFailedEntrySchema = SetScheduleFailedEntrySchema;

/** Module-scope batch mark-reviewed envelope (OMN-256). message always emitted on success. */
export const MARK_REVIEWED_BATCH_TYPED_SCHEMA = reviewSuccessSchema({
  results: z
    .object({
      successful: z.array(MarkReviewedBatchSuccessEntrySchema),
      failed: z.array(MarkReviewedBatchFailedEntrySchema),
      summary: z
        .object({
          total_requested: z.number(),
          successful_count: z.number(),
          failed_count: z.number(),
        })
        .strict(),
    })
    .strict(),
  message: z.string(),
});

/** Module-scope set-review-schedule envelope (SET_SCHEDULE_SCHEMA). message always emitted on success. */
export const SET_SCHEDULE_TYPED_SCHEMA = reviewSuccessSchema({
  results: z
    .object({
      successful: z.array(SetScheduleSuccessEntrySchema),
      failed: z.array(SetScheduleFailedEntrySchema),
      summary: z
        .object({
          total_requested: z.number(),
          successful_count: z.number(),
          failed_count: z.number(),
        })
        .strict(),
    })
    .strict(),
  message: z.string(),
});

/**
 * Write-tool task create/update result (NOT v3-wrapped — wrapInLauncher returns the OmniJS payload raw).
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts:
 *  - buildCreateTaskProgram envelope:
 *    {taskId, name, note, flagged, dueDate, deferDate, plannedDate, estimatedMinutes, tags,
 *     project, inInbox, warnings, created:true}
 *  - buildUpdateTaskProgram envelope:
 *    {taskId, name, flagged, updated:true, warnings} — exactly 5 keys, do NOT add note/dates/tags.
 *
 * OMN-158 rider 3: two strict variants (create/update) replacing single object + .refine().
 * .strict() before any .refine() — no .refine() survives.
 */
const TaskCreateResult = z
  .object({
    taskId: z.string(),
    name: z.string(),
    note: z.string(),
    flagged: z.boolean(),
    dueDate: isoDateOrNull,
    deferDate: isoDateOrNull,
    plannedDate: isoDateOrNull,
    estimatedMinutes: z.number().nullable(),
    tags: z.array(z.string()),
    project: z.string().nullable(),
    inInbox: z.boolean(),
    warnings: warningsArray,
    created: z.literal(true),
  })
  .strict();

const TaskUpdateResult = z
  .object({
    taskId: z.string(),
    name: z.string(),
    flagged: z.boolean(),
    updated: z.literal(true),
    warnings: warningsArray,
  })
  .strict();

export const TaskWriteResultSchema = z.union([TaskCreateResult, TaskUpdateResult]);

/**
 * Task-or-project entity result (OMN-205): a strict union where exactly one of
 * taskId/projectId identifies the entity, alongside a shared `name` and the
 * caller-supplied per-operation fields. Backs CompleteResultSchema and
 * DeleteResultSchema, which previously hand-rolled the same two-variant shape.
 *
 * Note: there is NO error branch — these are success-only payloads (the error
 * dialect lives in the tool layer, see BulkDeleteResultSchema), so this is a
 * task/project identity union, not a success+error envelope.
 */
const entityResult = <T extends z.ZodRawShape>(extra: T) =>
  z.union([
    z.object({ taskId: z.string(), name: z.string(), ...extra }).strict(),
    z.object({ projectId: z.string(), name: z.string(), ...extra }).strict(),
  ]);

/**
 * Complete result — task or project variant.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (lowerComplete):
 *  - task variant:    {taskId,    name, completed: true, completionDate}
 *  - project variant: {projectId, name, completed: true, completionDate}
 *
 * Union: one of taskId OR projectId required (each variant strict).
 */
export const CompleteResultSchema = entityResult({
  completed: z.literal(true),
  completionDate: isoDateOrNull,
});

/**
 * Delete result — task or project variant.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (lowerDelete):
 *  - task variant:    {taskId,    name, deleted: true}
 *  - project variant: {projectId, name, deleted: true}
 */
export const DeleteResultSchema = entityResult({
  deleted: z.literal(true),
});

/**
 * Bulk task delete result.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (buildBulkDeleteTasksProgram):
 *  {deleted: _deleted, errors: _errors, message}
 *
 * NUANCE (OMN-144): `errors` here is per-item partial-failure DATA (success contract);
 * it is NOT the top-level {error: true} error dialect. The script never emits
 * success:false — zero-deletion failure is detected in the TOOL LAYER (handleBulkDeleteTasks)
 * and expressed as a tool-level error envelope, not a script-level one. So
 * BulkDeleteResultSchema is success-only and includes the errors array.
 */
export const BulkDeleteResultSchema = z
  .object({
    deleted: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    errors: z.array(z.object({ taskId: z.string(), error: z.string() }).strict()),
    message: z.string(),
  })
  .strict();

/**
 * Project write result — create or update variant.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts:
 *  - buildCreateProjectProgram envelope:
 *    {projectId, name, note, flagged, sequential, dueDate, deferDate, plannedDate,
 *     folder, tags, warnings, created: true}
 *  - buildUpdateProjectProgram envelope:
 *    {projectId, name, flagged, status, updated: true, warnings}
 */
export const ProjectWriteResultSchema = z.union([
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      note: z.string(),
      flagged: z.boolean(),
      sequential: z.boolean(),
      dueDate: isoDateOrNull,
      deferDate: isoDateOrNull,
      plannedDate: isoDateOrNull,
      folder: z.string().nullable(),
      tags: z.array(z.string()),
      warnings: warningsArray,
      created: z.literal(true),
    })
    .strict(),
  z
    .object({
      projectId: z.string(),
      name: z.string(),
      flagged: z.boolean(),
      status: z.enum(['active', 'on_hold', 'completed', 'dropped']),
      updated: z.literal(true),
      warnings: warningsArray,
    })
    .strict(),
]);

/**
 * Folder create result.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (buildCreateFolderProgram):
 *  {folderId, name, parentFolder, warnings, created: true}
 */
export const FolderCreateResultSchema = z
  .object({
    folderId: z.string(),
    name: z.string(),
    parentFolder: z.string().nullable(),
    warnings: warningsArray,
    created: z.literal(true),
  })
  .strict();

/**
 * Batch create result.
 *
 * Source-verified against src/contracts/ast/mutation/emitter.ts (batchItem emitter):
 *  success: {tempId, taskId: task.id.primaryKey, success: true, warnings}
 *  failure: {tempId, taskId: null, success: false, error, warnings}
 *
 * Per-item taskId:null and success:literal(false) are SUCCESS-contract data (spec §5, plan note).
 */
const BatchItemSuccessResult = z
  .object({
    tempId: z.string(),
    taskId: z.string(),
    success: z.literal(true),
    warnings: warningsArray,
  })
  .strict();

const BatchItemFailureResult = z
  .object({
    tempId: z.string(),
    taskId: z.null(),
    success: z.literal(false),
    error: z.string(),
    warnings: warningsArray,
  })
  .strict();

export const BatchCreateResultSchema = z
  .object({
    results: z.array(z.union([BatchItemSuccessResult, BatchItemFailureResult])),
  })
  .strict();

/**
 * Tag mutation result — discriminated union over all tag action variants.
 *
 * Source-verified against src/contracts/ast/mutation/defs.ts (each tag program):
 *
 *  created (path):  {action: 'created', tagName, tagId, path, createdSegments, message}
 *                   — buildCreateTagProgram, path variant
 *  created (flat):  {action: 'created', tagName, tagId, parentTagName, parentTagId, message}
 *                   — buildCreateTagProgram, flat variant
 *                   NOTE: parentTagName/parentTagId are REQUIRED but may be null (json(null) when no parent)
 *  renamed:         {action: 'renamed', oldName, newName, message}
 *                   — buildRenameTagProgram
 *  deleted:         {action: 'deleted', tagName, message}
 *                   — buildDeleteTagProgram
 *  merged:          {action: 'merged', sourceTag, targetTag, tasksMerged, message}
 *                   — buildMergeTagsProgram (delete succeeded)
 *  merged_with_warning: {action: 'merged_with_warning', sourceTag, targetTag, tasksMerged, warning, message}
 *                   — buildMergeTagsProgram (best-effort delete failed; warning key appears via undefined-drop)
 *  nested:          {action: 'nested', tagName, parentTagName, parentTagId, message}
 *                   — buildNestTagProgram / lowerTagMove('nest')
 *  unparented:      {action: 'unparented', tagName, message}
 *                   — buildUnparentTagProgram / lowerTagMove('unparent')
 *  reparented (with-parent): {action: 'reparented', tagName, newParentTagName, newParentTagId, message}
 *                   — lowerTagMove('reparent') with parentTagName present
 *  reparented (to-root): {action: 'reparented', tagName, message}
 *                   — lowerTagMove('reparent') without parentTagName
 *                   NOTE: newParentTag* keys are STRUCTURALLY ABSENT (separate envelope literal at build time,
 *                   not JSON.stringify undefined-dropping). OMN-158 splits into two strict variants.
 */
export const TagMutationResultSchema = z.union([
  // created (path variant): has path + createdSegments keys, no parentTagName/parentTagId
  z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      path: z.string(),
      createdSegments: z.array(z.string()),
      message: z.string(),
    })
    .strict(),
  // created (flat variant): has parentTagName/parentTagId keys (required, may be null), no path/createdSegments
  z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      parentTagName: z.string().nullable(),
      parentTagId: z.string().nullable(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('renamed'),
      oldName: z.string(),
      newName: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('deleted'),
      tagName: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('merged'),
      sourceTag: z.string(),
      targetTag: z.string(),
      tasksMerged: z.number(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('merged_with_warning'),
      sourceTag: z.string(),
      targetTag: z.string(),
      tasksMerged: z.number(),
      // warning is always present on this branch (the action literal itself is the discriminator)
      warning: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('nested'),
      tagName: z.string(),
      parentTagName: z.string(),
      parentTagId: z.string(),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('unparented'),
      tagName: z.string(),
      message: z.string(),
    })
    .strict(),
  // reparented (with-parent): newParentTag* keys present — separate envelope literal from to-root
  z
    .object({
      action: z.literal('reparented'),
      tagName: z.string(),
      newParentTagName: z.string(),
      newParentTagId: z.string(),
      message: z.string(),
    })
    .strict(),
  // reparented (to-root): newParentTag* keys structurally absent — separate envelope literal at build time
  z
    .object({
      action: z.literal('reparented'),
      tagName: z.string(),
      message: z.string(),
    })
    .strict(),
]);
