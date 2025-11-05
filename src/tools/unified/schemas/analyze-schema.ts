import { z } from 'zod';

// Scope schema for filtering analysis
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

// Analysis-type-specific parameters
const AnalysisParamsSchema = z.object({
  // productivity_stats / task_velocity
  groupBy: z.enum(['day', 'week', 'month']).optional(),
  metrics: z.array(z.string()).optional(),

  // pattern_analysis
  insights: z.array(z.string()).optional(),

  // recurring_tasks
  operation: z.enum(['analyze', 'patterns']).optional(),
  sortBy: z.enum(['nextDue', 'frequency', 'name']).optional(),

  // parse_meeting_notes
  text: z.string().optional(),
  extractTasks: z.boolean().optional(),
  defaultProject: z.string().optional(),
  defaultTags: z.array(z.string()).optional(),

  // manage_reviews
  projectId: z.string().optional(),
  reviewDate: z.string().optional(),
}).passthrough();

// Main analyze schema
export const AnalyzeSchema = z.object({
  analysis: z.object({
    type: z.enum([
      'productivity_stats',
      'task_velocity',
      'overdue_analysis',
      'pattern_analysis',
      'workflow_analysis',
      'recurring_tasks',
      'parse_meeting_notes',
      'manage_reviews',
    ]),
    scope: AnalysisScopeSchema.optional(),
    params: AnalysisParamsSchema.optional(),
  }),
});

export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
