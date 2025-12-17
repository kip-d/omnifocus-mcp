import { z } from 'zod';

/**
 * Shared schema definitions used across multiple tools
 */

// Flexible date input that accepts local time and converts to UTC
export const LocalDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/,
    'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm',
  )
  .describe('Date in local time (e.g., 2024-01-15 or 2024-01-15 10:30). Will be converted to UTC.');

// Task/Project ID validation
export const IdSchema = z.string().min(1).describe('OmniFocus entity ID');

// Tag name validation
export const TagNameSchema = z.string().min(1).max(100).describe('Tag name');
