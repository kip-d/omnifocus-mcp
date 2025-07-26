import { z } from 'zod';
import { DateTimeSchema } from './shared-schemas.js';

/**
 * Analytics-related schema definitions
 */

// Productivity stats parameters
export const ProductivityStatsSchema = z.object({
  startDate: DateTimeSchema
    .optional()
    .describe('Start date for analysis (defaults to 30 days ago)'),
  
  endDate: DateTimeSchema
    .optional()
    .describe('End date for analysis (defaults to now)'),
  
  groupBy: z.enum(['day', 'week', 'month', 'project', 'tag'])
    .optional()
    .default('week')
    .describe('How to group the statistics'),
  
  includeProjects: z.array(z.string())
    .optional()
    .describe('Only include specific projects'),
  
  excludeProjects: z.array(z.string())
    .optional()
    .describe('Exclude specific projects')
});

// Task velocity parameters
export const TaskVelocitySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'quarter'])
    .default('week')
    .describe('Time period for velocity calculation'),
  
  lookback: z.number()
    .int()
    .positive()
    .max(365)
    .default(30)
    .describe('Number of days to look back'),
  
  includeWeekends: z.boolean()
    .default(true)
    .describe('Include weekends in calculations'),
  
  projectFilter: z.array(z.string())
    .optional()
    .describe('Filter by specific projects')
});

// Overdue analysis parameters
export const OverdueAnalysisSchema = z.object({
  groupBy: z.enum(['project', 'tag', 'age', 'priority'])
    .default('project')
    .describe('How to group overdue tasks'),
  
  includeCompleted: z.boolean()
    .default(false)
    .describe('Include completed overdue tasks'),
  
  maxAge: z.number()
    .int()
    .positive()
    .optional()
    .describe('Maximum overdue age in days to include')
});

// Analytics response schemas
export const ProductivityStatsResponseSchema = z.object({
  summary: z.object({
    totalCompleted: z.number(),
    totalCreated: z.number(),
    completionRate: z.number(),
    averageCompletionTime: z.number().optional()
  }),
  
  byPeriod: z.array(z.object({
    period: z.string(),
    completed: z.number(),
    created: z.number(),
    completionRate: z.number()
  })).optional(),
  
  byProject: z.array(z.object({
    project: z.string(),
    completed: z.number(),
    created: z.number(),
    completionRate: z.number()
  })).optional(),
  
  byTag: z.array(z.object({
    tag: z.string(),
    completed: z.number(),
    created: z.number()
  })).optional()
});

export const TaskVelocityResponseSchema = z.object({
  velocity: z.object({
    current: z.number(),
    average: z.number(),
    trend: z.enum(['increasing', 'stable', 'decreasing']),
    trendPercentage: z.number()
  }),
  
  periods: z.array(z.object({
    period: z.string(),
    completed: z.number(),
    velocity: z.number()
  })),
  
  forecast: z.object({
    nextPeriod: z.number(),
    confidence: z.number()
  }).optional()
});

export const OverdueAnalysisResponseSchema = z.object({
  summary: z.object({
    totalOverdue: z.number(),
    oldestOverdueDays: z.number(),
    averageOverdueDays: z.number()
  }),
  
  byGroup: z.array(z.object({
    group: z.string(),
    count: z.number(),
    percentage: z.number(),
    averageDaysOverdue: z.number()
  })),
  
  tasks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    daysOverdue: z.number(),
    project: z.string().optional(),
    tags: z.array(z.string())
  })).optional()
});