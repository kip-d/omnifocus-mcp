import { z } from 'zod';
import { coerceObject } from '../../schemas/coercion-helpers.js';

// OMN-90: every nested object literal carries `.strict()`. Zod's
// `discriminatedUnion` does NOT propagate strictness to its members, and
// `.strict()` is a per-object property, not a property of the schema tree —
// so the wrapper, every union member, every `params` object, every `scope`
// object, and any nested object inside params all need it independently.
// Without this, unknown keys vanish silently (`success:true`), the diagnose-
// failures pipeline never records the LLM↔schema mismatch, and the same
// blind spot OMN-76 closed for create/update would persist for analyze.

// Scope schema for filtering analysis (shared across most analysis types)
const AnalysisScopeSchema = z
  .object({
    dateRange: z
      .object({
        start: z.string(),
        end: z.string(),
      })
      .strict()
      .optional(),
    tags: z.array(z.string()).optional(),
    projects: z.array(z.string()).optional(),
    includeCompleted: z.boolean().optional(),
    includeDropped: z.boolean().optional(),
  })
  .strict();

// OMN-124: one already-extracted action item passed by the caller (the LLM).
// Mirrors the write tool's CreateData (name/note/project/tags/dates/flagged/
// estimatedMinutes) so the preview can emit a batch payload that round-trips
// into omnifocus_write { batch } unchanged. Dates are validated loosely here
// ('YYYY-MM-DD[ HH:mm]', no Z) — the write boundary is the strict enforcement
// point. `.strict()` so unknown keys are rejected, not silently dropped.
// Mirror of write-schema's DATE_REGEX (not exported there). Validating dates
// here keeps the "ready to send" promise honest — a bad date is rejected at this
// boundary instead of silently riding into a batchPayload the write tool rejects.
const ITEM_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;
const ITEM_DATE_MSG = 'Date format: YYYY-MM-DD or YYYY-MM-DD HH:mm';

const ParsedItemSchema = z
  .object({
    name: z.string().min(1),
    project: z.string().nullable().optional(), // existing/new name, or null = inbox
    tags: z.array(z.string()).optional(),
    dueDate: z.string().regex(ITEM_DATE_REGEX, ITEM_DATE_MSG).optional(),
    deferDate: z.string().regex(ITEM_DATE_REGEX, ITEM_DATE_MSG).optional(),
    estimatedMinutes: z.number().int().positive().optional(),
    flagged: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict();

// Analysis schema - discriminated union by type
const AnalysisSchema = z.discriminatedUnion('type', [
  // Productivity stats
  z
    .object({
      type: z.literal('productivity_stats'),
      scope: AnalysisScopeSchema.optional(),
      params: z
        .object({
          groupBy: z.enum(['day', 'week', 'month']).optional(),
          metrics: z.array(z.string()).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  // Task velocity
  z
    .object({
      type: z.literal('task_velocity'),
      scope: AnalysisScopeSchema.optional(),
      params: z
        .object({
          groupBy: z.enum(['day', 'week', 'month']).optional(),
          metrics: z.array(z.string()).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  // Overdue analysis
  z
    .object({
      type: z.literal('overdue_analysis'),
      scope: AnalysisScopeSchema.optional(),
      params: z.object({}).strict().optional(),
    })
    .strict(),
  // Pattern analysis
  z
    .object({
      type: z.literal('pattern_analysis'),
      scope: AnalysisScopeSchema.optional(),
      params: z
        .object({
          insights: z.array(z.string()).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  // Workflow analysis
  z
    .object({
      type: z.literal('workflow_analysis'),
      scope: AnalysisScopeSchema.optional(),
      params: z.object({}).strict().optional(),
    })
    .strict(),
  // Recurring tasks
  z
    .object({
      type: z.literal('recurring_tasks'),
      scope: AnalysisScopeSchema.optional(),
      params: z
        .object({
          operation: z.enum(['analyze', 'patterns']).optional(),
          sortBy: z.enum(['nextDue', 'frequency', 'name']).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  // Parse meeting notes — exactly one of `items` (OMN-124, preferred) or `text`
  // (OMN-123 heuristic fallback).
  z
    .object({
      type: z.literal('parse_meeting_notes'),
      params: z
        .object({
          // OMN-124: caller (the LLM) passes already-extracted action items. The
          // tool does the read-only pre-flight (resolve/dedupe/classify) and emits
          // a ready omnifocus_write { batch } payload — it does NOT extract here.
          items: z.array(ParsedItemSchema).optional(),
          // OMN-123 fallback: raw prose; the trustworthy heuristic extractor runs.
          text: z.string().optional(),
          extractTasks: z.boolean().optional(), // text-mode only
          defaultProject: z.string().nullable().optional(),
          defaultTags: z.array(z.string()).optional(),
          // Read the live database to resolve project names, dedupe against
          // existing tasks, and classify tags existing-vs-new. Default true.
          validateAgainstExisting: z.boolean().optional().default(true),
        })
        .strict()
        // OMN-124: exactly one input mode. `.strict()` precedes `.refine` so the
        // unknown-key check still runs (refine returns ZodEffects).
        .refine((p) => Boolean(p.text) !== Boolean(p.items && p.items.length > 0), {
          message: 'parse_meeting_notes requires exactly one of params.items (structured) or params.text (prose)',
        }),
    })
    .strict(),
  // Manage reviews
  z
    .object({
      type: z.literal('manage_reviews'),
      params: z
        .object({
          // OMN-273: clear_schedule removed — OmniFocus has no "not scheduled
          // for review" state (reviewInterval is non-nullable; nulling
          // nextReviewDate just recomputes it), so the op can never take effect.
          // Failure-mode change is deliberate (Kip, 2026-07-17): stale callers
          // now get a thrown McpError(InvalidParams) naming the valid ops, not
          // the old UNSUPPORTED envelope. Acceptable break: the op returned
          // only errors since OMN-106, so no caller ever got value from it.
          operation: z.enum(['list_for_review', 'mark_reviewed', 'set_schedule']).optional(),
          projectId: z.string().optional(),
          // OMN-256: batch sibling of projectId — mark_reviewed/set_schedule
          // accept ONE of projectId/projectIds (enforced by AnalyzeSchema's
          // superRefine below; discriminated-union members can't carry a
          // refinement directly). Cap mirrors bulk_delete's ids cap.
          projectIds: z.array(z.string()).min(1).max(100).optional(),
          reviewDate: z.string().optional(),
          // OMN-60: review interval for set_schedule. Object shape — passed
          // through to buildSetReviewScheduleScript(), which expects { unit, steps }.
          reviewInterval: z
            .object({
              unit: z.enum(['day', 'week', 'month', 'year']),
              steps: z.number().int().positive(),
            })
            .strict()
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);

// Main analyze schema
// Note: coerceObject handles JSON string->object conversion from MCP bridge
export const AnalyzeSchema = z
  .object({
    analysis: coerceObject(AnalysisSchema),
  })
  .strict()
  // OMN-256: manage_reviews's projectId/projectIds exactly-one-of + the
  // list_for_review reject-loud rule. The discriminated-union member can't
  // carry a refinement (zod requires ZodObject members), so this lives at
  // the wrapper boundary — mirrors WriteSchema's id/target_id precedent.
  .superRefine((val, ctx) => {
    const analysis = val.analysis as {
      type?: string;
      params?: { operation?: string; projectId?: string; projectIds?: string[] };
    };
    if (analysis.type !== 'manage_reviews') return;
    const params = analysis.params;
    const operation = params?.operation ?? 'list_for_review';
    const hasSingle = params?.projectId !== undefined;
    const hasPlural = params?.projectIds !== undefined;

    if (operation === 'list_for_review' && hasPlural) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['analysis', 'params', 'projectIds'],
        message:
          'list_for_review does not accept projectIds — batch project selection only applies to mark_reviewed/set_schedule',
      });
    }
    if ((operation === 'mark_reviewed' || operation === 'set_schedule') && hasSingle && hasPlural) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['analysis', 'params', 'projectIds'],
        message: `${operation} requires exactly one of 'projectId' or 'projectIds', not both`,
      });
    }
  });

export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
