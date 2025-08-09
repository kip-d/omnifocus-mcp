import { z } from 'zod';
import { coerceBoolean } from './coercion-helpers.js';

/**
 * System and diagnostic-related schema definitions
 */

// Get version info parameters (no input needed)
export const GetVersionInfoSchema = z.object({});

// Run diagnostics parameters
export const RunDiagnosticsSchema = z.object({
  testScript: z.string()
    .default('list_tasks')
    .describe('Optional custom script to test (defaults to basic list_tasks)'),
});

// Recurring task analysis parameters
export const AnalyzeRecurringTasksSchema = z.object({
  activeOnly: coerceBoolean()
    .default(true)
    .describe('Only include active (non-completed, non-dropped) recurring tasks'),

  includeCompleted: coerceBoolean()
    .default(false)
    .describe('Include completed recurring tasks (overrides activeOnly for completed)'),

  includeDropped: coerceBoolean()
    .default(false)
    .describe('Include dropped recurring tasks (overrides activeOnly for dropped)'),

  includeHistory: coerceBoolean()
    .default(false)
    .describe('Include completion history information'),

  sortBy: z.enum(['name', 'dueDate', 'frequency', 'project'])
    .default('dueDate')
    .describe('Sort order for results'),
});

// Get recurring patterns parameters
export const GetRecurringPatternsSchema = z.object({
  activeOnly: coerceBoolean()
    .default(true)
    .describe('Only include active (non-completed, non-dropped) recurring tasks'),

  includeCompleted: coerceBoolean()
    .default(false)
    .describe('Include completed recurring tasks (overrides activeOnly for completed)'),

  includeDropped: coerceBoolean()
    .default(false)
    .describe('Include dropped recurring tasks (overrides activeOnly for dropped)'),
});

// Response schemas
export const VersionInfoResponseSchema = z.object({
  server: z.object({
    version: z.string(),
    nodeVersion: z.string(),
    platform: z.string(),
  }),
  omnifocus: z.object({
    version: z.string(),
    apiVersion: z.string().optional(),
  }),
  mcp: z.object({
    sdkVersion: z.string(),
  }),
});

export const DiagnosticsResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),

  connectivity: z.object({
    omnifocus: z.boolean(),
    permissions: z.boolean(),
    lastError: z.string().optional(),
  }),

  performance: z.object({
    averageResponseTime: z.number(),
    slowestOperation: z.string(),
    operations: z.record(z.object({
      averageMs: z.number(),
      calls: z.number(),
    })),
  }).optional(),

  cache: z.object({
    hitRate: z.number(),
    size: z.number(),
    evictions: z.number(),
  }).optional(),

  system: z.object({
    memoryUsage: z.number(),
    uptime: z.number(),
  }).optional(),

  errors: z.array(z.object({
    timestamp: z.string(),
    operation: z.string(),
    error: z.string(),
  })),
});
