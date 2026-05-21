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
  // Parse meeting notes (text is required)
  z
    .object({
      type: z.literal('parse_meeting_notes'),
      params: z
        .object({
          text: z.string(),
          extractTasks: z.boolean().optional(),
          defaultProject: z.string().optional(),
          defaultTags: z.array(z.string()).optional(),
        })
        .strict(),
    })
    .strict(),
  // Manage reviews
  z
    .object({
      type: z.literal('manage_reviews'),
      params: z
        .object({
          operation: z.enum(['list_for_review', 'mark_reviewed', 'set_schedule', 'clear_schedule']).optional(),
          projectId: z.string().optional(),
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
  .strict();

export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
