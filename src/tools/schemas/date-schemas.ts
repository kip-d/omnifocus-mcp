/**
 * Centralized date schema definitions for OmniFocus MCP
 * Used across task, project, and planned date handling
 */

import { z } from 'zod';

// Local date schema - handles both YYYY-MM-DD and YYYY-MM-DD HH:mm formats
export const LocalDateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm')
  .describe('Date in local time (e.g., 2024-01-15 or 2024-01-15 10:30). Will be converted to UTC.');

/**
 * Helper for creating optional date fields with custom descriptions
 * @param _fieldName - Name of the field (e.g., "dueDate")
 * @param description - Custom description for this field
 * @returns Zod schema for optional date field
 */
export function createDateField(_fieldName: string, description: string) {
  return LocalDateTimeSchema.optional().describe(description);
}

/**
 * Helper for creating clear date flags (set date to null)
 * @param fieldName - Name of the field being cleared (e.g., "dueDate")
 * @returns Zod schema for boolean clear flag
 */
export function createClearDateField(fieldName: string) {
  return z.boolean().optional().describe(`Clear the ${fieldName} (set to null)`);
}

/**
 * Export helpers as namespace for cleaner imports
 */
export const dateSchemaHelpers = {
  createDateField,
  createClearDateField,
  LocalDateTimeSchema,
};
