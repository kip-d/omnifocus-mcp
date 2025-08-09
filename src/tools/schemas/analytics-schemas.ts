import { z } from 'zod';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Analytics-related schema definitions
 */

// Productivity stats parameters
export const ProductivityStatsSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter', 'year'])
    .default('week')
    .describe('Time period for analysis. Must be exactly one of: "today", "week", "month", "quarter", "year". Note: "last_week", "this_week", "current_week" etc. are NOT valid - use "week" for current week data'),

  groupBy: z.enum(['project', 'tag', 'day', 'week', 'none'])
    .default('project')
    .describe('How to group the statistics (use "none" for overall stats only)'),

  includeCompleted: coerceBoolean()
    .default(true)
    .describe('Include completed tasks in analysis'),
});

// Task velocity parameters
export const TaskVelocitySchema = z.object({
  period: z.enum(['day', 'week', 'month'])
    .default('week')
    .describe('Time period for velocity calculation'),

  projectId: z.string()
    .optional()
    .describe('Filter by specific project (optional)'),

  tags: z.array(z.string())
    .optional()
    .describe('Filter by tags (optional)'),
});

// Overdue analysis parameters
export const OverdueAnalysisSchema = z.object({
  includeRecentlyCompleted: coerceBoolean()
    .default(true)
    .describe('Include tasks completed after their due date'),

  groupBy: z.enum(['project', 'tag', 'age', 'priority'])
    .default('project')
    .describe('How to group overdue analysis'),

  limit: coerceNumber()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe('Maximum number of overdue tasks to analyze'),
});

// Analytics response schemas
export const ProductivityStatsResponseSchema = z.object({
  summary: z.object({
    totalCompleted: z.number(),
    totalCreated: z.number(),
    completionRate: z.number(),
    averageCompletionTime: z.number().optional(),
  }),

  byPeriod: z.array(z.object({
    period: z.string(),
    completed: z.number(),
    created: z.number(),
    completionRate: z.number(),
  })).optional(),

  byProject: z.array(z.object({
    project: z.string(),
    completed: z.number(),
    created: z.number(),
    completionRate: z.number(),
  })).optional(),

  byTag: z.array(z.object({
    tag: z.string(),
    completed: z.number(),
    created: z.number(),
  })).optional(),
});

export const TaskVelocityResponseSchema = z.object({
  velocity: z.object({
    current: z.number(),
    average: z.number(),
    trend: z.enum(['increasing', 'stable', 'decreasing']),
    trendPercentage: z.number(),
  }),

  periods: z.array(z.object({
    period: z.string(),
    completed: z.number(),
    velocity: z.number(),
  })),

  forecast: z.object({
    nextPeriod: z.number(),
    confidence: z.number(),
  }).optional(),
});

export const OverdueAnalysisResponseSchema = z.object({
  summary: z.object({
    totalOverdue: z.number(),
    oldestOverdueDays: z.number(),
    averageOverdueDays: z.number(),
  }),

  byGroup: z.array(z.object({
    group: z.string(),
    count: z.number(),
    percentage: z.number(),
    averageDaysOverdue: z.number(),
  })),

  tasks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    daysOverdue: z.number(),
    project: z.string().optional(),
    tags: z.array(z.string()),
  })).optional(),
});
