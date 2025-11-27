import { z } from 'zod';
import { coerceObject } from '../../schemas/coercion-helpers.js';

// Scope schema for filtering analysis (shared across most analysis types)
const AnalysisScopeSchema = z.object({
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  projects: z.array(z.string()).optional(),
  includeCompleted: z.boolean().optional(),
  includeDropped: z.boolean().optional(),
});

// Analysis schema - discriminated union by type
const AnalysisSchema = z.discriminatedUnion('type', [
  // Productivity stats
  z.object({
    type: z.literal('productivity_stats'),
    scope: AnalysisScopeSchema.optional(),
    params: z.object({
      groupBy: z.enum(['day', 'week', 'month']).optional(),
      metrics: z.array(z.string()).optional(),
    }).optional(),
  }),
  // Task velocity
  z.object({
    type: z.literal('task_velocity'),
    scope: AnalysisScopeSchema.optional(),
    params: z.object({
      groupBy: z.enum(['day', 'week', 'month']).optional(),
      metrics: z.array(z.string()).optional(),
    }).optional(),
  }),
  // Overdue analysis
  z.object({
    type: z.literal('overdue_analysis'),
    scope: AnalysisScopeSchema.optional(),
    params: z.object({}).optional(),
  }),
  // Pattern analysis
  z.object({
    type: z.literal('pattern_analysis'),
    scope: AnalysisScopeSchema.optional(),
    params: z.object({
      insights: z.array(z.string()).optional(),
    }).optional(),
  }),
  // Workflow analysis
  z.object({
    type: z.literal('workflow_analysis'),
    scope: AnalysisScopeSchema.optional(),
    params: z.object({}).optional(),
  }),
  // Recurring tasks
  z.object({
    type: z.literal('recurring_tasks'),
    scope: AnalysisScopeSchema.optional(),
    params: z.object({
      operation: z.enum(['analyze', 'patterns']).optional(),
      sortBy: z.enum(['nextDue', 'frequency', 'name']).optional(),
    }).optional(),
  }),
  // Parse meeting notes (text is required)
  z.object({
    type: z.literal('parse_meeting_notes'),
    params: z.object({
      text: z.string(),
      extractTasks: z.boolean().optional(),
      defaultProject: z.string().optional(),
      defaultTags: z.array(z.string()).optional(),
    }),
  }),
  // Manage reviews
  z.object({
    type: z.literal('manage_reviews'),
    params: z.object({
      operation: z.enum(['list_for_review', 'mark_reviewed', 'set_schedule', 'clear_schedule']).optional(),
      projectId: z.string().optional(),
      reviewDate: z.string().optional(),
    }).optional(),
  }),
]);

// Main analyze schema
// Note: coerceObject handles JSON string->object conversion from MCP bridge
export const AnalyzeSchema = z.object({
  analysis: coerceObject(AnalysisSchema),
});

export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
