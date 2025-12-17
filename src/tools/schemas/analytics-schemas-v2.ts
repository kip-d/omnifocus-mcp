import { z } from 'zod';

/**
 * V2 Analytics schemas with proper parameters for each tool
 */

// Productivity stats parameters for V2
export const ProductivityStatsSchemaV2 = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter', 'year']).default('week').describe('Time period for analysis'),

  includeProjectStats: z
    .union([z.boolean(), z.string().transform((val) => val === 'true' || val === '1')])
    .default(true)
    .describe('Include project-level statistics'),

  includeTagStats: z
    .union([z.boolean(), z.string().transform((val) => val === 'true' || val === '1')])
    .default(true)
    .describe('Include tag-level statistics'),
});

// Task velocity parameters for V2
export const TaskVelocitySchemaV2 = z.object({
  days: z
    .union([z.number(), z.string().transform((val) => parseInt(val, 10))])
    .pipe(z.number().min(1).max(365))
    .default(7)
    .describe('Number of days to analyze'),

  groupBy: z.enum(['day', 'week', 'project']).default('day').describe('How to group velocity data'),

  includeWeekends: z
    .union([z.boolean(), z.string().transform((val) => val === 'true' || val === '1')])
    .default(true)
    .describe('Include weekend days in analysis'),
});

// Overdue analysis parameters for V2 (same as V1)
export const OverdueAnalysisSchemaV2 = z.object({
  includeRecentlyCompleted: z
    .union([z.boolean(), z.string().transform((val) => val === 'true' || val === '1')])
    .default(true)
    .describe('Include tasks completed after their due date'),

  groupBy: z.enum(['project', 'tag', 'age', 'priority']).default('project').describe('How to group overdue analysis'),

  limit: z
    .union([z.number(), z.string().transform((val) => parseInt(val, 10))])
    .pipe(z.number().min(1).max(500))
    .default(100)
    .describe('Maximum number of overdue tasks to analyze'),
});
