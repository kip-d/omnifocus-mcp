import { z } from 'zod';

/**
 * System and diagnostic-related schema definitions
 */

// Get version info parameters (no input needed)
export const GetVersionInfoSchema = z.object({});

// Run diagnostics parameters
export const RunDiagnosticsSchema = z.object({
  includePerformance: z.boolean()
    .default(true)
    .describe('Include performance metrics'),
  
  includeCacheStats: z.boolean()
    .default(true)
    .describe('Include cache statistics'),
  
  includeSystemInfo: z.boolean()
    .default(true)
    .describe('Include system information'),
  
  testOperations: z.array(z.enum([
    'list_tasks', 'list_projects', 'list_tags',
    'create_task', 'update_task', 'delete_task'
  ]))
    .optional()
    .describe('Specific operations to test')
});

// Recurring task analysis parameters
export const AnalyzeRecurringTasksSchema = z.object({
  includeCompleted: z.boolean()
    .default(false)
    .describe('Include completed recurring tasks'),
  
  projectFilter: z.array(z.string())
    .optional()
    .describe('Filter by specific projects'),
  
  maxResults: z.number()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe('Maximum recurring tasks to analyze')
});

// Get recurring patterns parameters
export const GetRecurringPatternsSchema = z.object({
  groupBy: z.enum(['frequency', 'project', 'nextDue'])
    .default('frequency')
    .describe('How to group recurring patterns'),
  
  includeStats: z.boolean()
    .default(true)
    .describe('Include statistics for each pattern')
});

// Response schemas
export const VersionInfoResponseSchema = z.object({
  server: z.object({
    version: z.string(),
    nodeVersion: z.string(),
    platform: z.string()
  }),
  omnifocus: z.object({
    version: z.string(),
    apiVersion: z.string().optional()
  }),
  mcp: z.object({
    sdkVersion: z.string()
  })
});

export const DiagnosticsResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  
  connectivity: z.object({
    omnifocus: z.boolean(),
    permissions: z.boolean(),
    lastError: z.string().optional()
  }),
  
  performance: z.object({
    averageResponseTime: z.number(),
    slowestOperation: z.string(),
    operations: z.record(z.object({
      averageMs: z.number(),
      calls: z.number()
    }))
  }).optional(),
  
  cache: z.object({
    hitRate: z.number(),
    size: z.number(),
    evictions: z.number()
  }).optional(),
  
  system: z.object({
    memoryUsage: z.number(),
    uptime: z.number()
  }).optional(),
  
  errors: z.array(z.object({
    timestamp: z.string(),
    operation: z.string(),
    error: z.string()
  }))
});