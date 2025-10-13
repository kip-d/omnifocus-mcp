import { z } from 'zod';

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

// Task/Project ID validation
export const IdSchema = z.string()
  .min(1)
  .describe('OmniFocus entity ID');

// Tag name validation
export const TagNameSchema = z.string()
  .min(1)
  .max(100)
  .describe('Tag name');

// Export format enum
export const ExportFormatSchema = z.enum(['json', 'csv', 'markdown'])
  .describe('Export format');
