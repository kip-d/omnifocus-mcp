import { z } from 'zod';
import { coerceBoolean, coerceNumber } from './coercion-helpers.js';

/**
 * Shared schema definitions used across multiple tools
 */

// ISO 8601 datetime string validation (for API responses)
export const DateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/, 'Invalid ISO 8601 date format')
  .describe('ISO 8601 formatted date string (e.g., 2024-01-15T10:30:00Z)');

// Flexible date input that accepts local time and converts to UTC
export const LocalDateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm')
  .describe('Date in local time (e.g., 2024-01-15 or 2024-01-15 10:30). Will be converted to UTC.');

// Optional datetime that can also be null
export const OptionalDateTimeSchema = z.union([DateTimeSchema, z.null()]).optional();

// Project status enum
export const ProjectStatusSchema = z.enum(['active', 'onHold', 'done', 'dropped'])
  .describe('Project status (active, onHold, done, dropped)');

// Task/Project ID validation
export const IdSchema = z.string()
  .min(1)
  .describe('OmniFocus entity ID');

// Tag name validation
export const TagNameSchema = z.string()
  .min(1)
  .max(100)
  .describe('Tag name');

// Common pagination parameters - with coercion for MCP string inputs
export const PaginationSchema = z.object({
  limit: coerceNumber()
    .int()
    .positive()
    .max(1000)
    .default(25)  // Daily-first: reduced from 100 for quicker response
    .describe('Maximum number of results to return (default: 25 for daily use, increase for reviews)'),
  offset: coerceNumber()
    .int()
    .nonnegative()
    .default(0)
    .describe('Number of results to skip'),
});

// Search text validation
export const SearchTextSchema = z.string()
  .min(1)
  .max(500)
  .describe('Search text');

// Export format enum
export const ExportFormatSchema = z.enum(['json', 'csv', 'markdown'])
  .describe('Export format');

// Performance options - with coercion for MCP string inputs
export const PerformanceOptionsSchema = z.object({
  skipAnalysis: coerceBoolean()
    .optional()
    .default(true)  // Daily-first: skip expensive recurring analysis by default
    .describe('Skip expensive recurring task analysis (default: true for daily use, set false for weekly reviews)'),
  includeDetails: coerceBoolean()
    .optional()
    .default(false)  // Daily-first: minimal details for quick scanning
    .describe('Include detailed information like notes and subtasks (default: false for daily use)'),
});

// Common error response
export const ErrorResponseSchema = z.object({
  error: z.boolean(),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.any()).optional(),
});

// Success response wrapper
export function createSuccessResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    metadata: z.object({
      cached: z.boolean().optional(),
      queryTime: z.number().optional(),
      totalCount: z.number().optional(),
    }).optional(),
  });
}
