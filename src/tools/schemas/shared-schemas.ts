import { z } from 'zod';

/**
 * Shared schema definitions used across multiple tools
 */

// ISO 8601 datetime string validation
export const DateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/, 'Invalid ISO 8601 date format')
  .describe('ISO 8601 formatted date string (e.g., 2024-01-15T10:30:00Z)');

// Optional datetime that can also be null
export const OptionalDateTimeSchema = z.union([DateTimeSchema, z.null()]).optional();

// Project status enum
export const ProjectStatusSchema = z.enum(['active', 'onHold', 'completed', 'dropped'])
  .describe('Project status');

// Task/Project ID validation
export const IdSchema = z.string()
  .min(1)
  .describe('OmniFocus entity ID');

// Tag name validation
export const TagNameSchema = z.string()
  .min(1)
  .max(100)
  .describe('Tag name');

// Common pagination parameters
export const PaginationSchema = z.object({
  limit: z.number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum number of results to return'),
  offset: z.number()
    .int()
    .nonnegative()
    .default(0)
    .describe('Number of results to skip')
});

// Search text validation
export const SearchTextSchema = z.string()
  .min(1)
  .max(500)
  .describe('Search text');

// Export format enum
export const ExportFormatSchema = z.enum(['json', 'csv', 'markdown'])
  .describe('Export format');

// Performance options
export const PerformanceOptionsSchema = z.object({
  skipAnalysis: z.boolean()
    .optional()
    .describe('Skip expensive analysis for better performance'),
  includeDetails: z.boolean()
    .optional()
    .describe('Include detailed information (may impact performance)')
});

// Common error response
export const ErrorResponseSchema = z.object({
  error: z.boolean(),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.any()).optional()
});

// Success response wrapper
export function createSuccessResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    metadata: z.object({
      cached: z.boolean().optional(),
      queryTime: z.number().optional(),
      totalCount: z.number().optional()
    }).optional()
  });
}