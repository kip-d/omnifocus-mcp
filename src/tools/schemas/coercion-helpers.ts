import { z } from 'zod';

/**
 * Coercion helpers for MCP Bridge Type Safety
 *
 * Claude Desktop converts ALL parameters to strings during MCP transport.
 * These helpers normalize both string and native types consistently.
 *
 * @see CLAUDE.md - Section: "Critical: MCP Bridge Type Coercion"
 */

/**
 * Coerce boolean values from MCP bridge (handles string conversion)
 *
 * @example
 * // Schema definition
 * flagged: coercedBoolean.optional()
 *
 * // Handles both:
 * { flagged: true }        // Direct call
 * { flagged: "true" }      // Claude Desktop (string)
 */
export const coercedBoolean = z.union([
  z.boolean(),
  z.string().transform(val => val === 'true' || val === '1'),
]);

/**
 * Coerce number values from MCP bridge with optional constraints
 *
 * @example
 * // Basic number
 * estimatedMinutes: coercedNumber().optional()
 *
 * // With constraints
 * limit: coercedNumber(1, 200).default(25)
 *
 * @param min - Minimum value (optional)
 * @param max - Maximum value (optional)
 */
export function coercedNumber(min?: number, max?: number) {
  let baseSchema = z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).pipe(z.number());

  if (min !== undefined && max !== undefined) {
    return baseSchema.pipe(z.number().min(min).max(max));
  }
  if (min !== undefined) {
    return baseSchema.pipe(z.number().min(min));
  }
  if (max !== undefined) {
    return baseSchema.pipe(z.number().max(max));
  }

  return baseSchema;
}

/**
 * Coerce string values (handles null/undefined/empty)
 *
 * @example
 * projectId: coercedString.nullable().optional()
 */
export const coercedString = z.union([
  z.string(),
  z.null(),
  z.undefined(),
]).transform(val => {
  if (val === null || val === undefined || val === 'null' || val === 'undefined' || val === '') {
    return null;
  }
  return String(val).trim();
});

/**
 * DEPRECATED: Old preprocessing approach
 * @deprecated Use coercedBoolean instead
 */
export const coerceBoolean = () => z.preprocess(
  (val) => {
    if (typeof val === 'boolean') return val;
    const strVal = String(val).toLowerCase().trim();
    if (strVal === 'true' || strVal === '1' || strVal === 'yes') return true;
    if (strVal === 'false' || strVal === '0' || strVal === 'no' || strVal === '') return false;
    return Boolean(strVal);
  },
  z.boolean(),
);

/**
 * DEPRECATED: Old coercion approach
 * @deprecated Use coercedNumber() instead
 */
export const coerceNumber = () => z.coerce.number();
