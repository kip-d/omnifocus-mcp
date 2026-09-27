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
 * Only recognized tokens are converted. Anything else (null, "null", "unflag",
 * 2, a missing required key) passes through unchanged so z.boolean() rejects
 * it — OMN-329: the old `Boolean(strVal)` fallback turned `flagged:null` and
 * `clearDueDate:null` into true.
 */
export const coerceBoolean = () =>
  z.preprocess((val) => {
    if (typeof val !== 'string' && typeof val !== 'number') return val;
    const strVal = String(val).toLowerCase().trim();
    if (strVal === 'true' || strVal === '1' || strVal === 'yes') return true;
    if (strVal === 'false' || strVal === '0' || strVal === 'no' || strVal === '') return false;
    return val;
  }, z.boolean());

/**
 * Coerce number values from MCP bridge
 *
 * Converts numeric strings only. null, blank strings and booleans pass through
 * unchanged so the inner schema rejects them (OMN-329: `z.coerce.number()`
 * turned null/"" into 0 and true into 1). Pass the bounded schema as `inner`,
 * e.g. `coerceNumber(z.number().min(1).max(500))`.
 */
export const coerceNumber = (inner: z.ZodNumber = z.number()) =>
  z.preprocess((val) => {
    if (typeof val !== 'string' || val.trim() === '') return val;
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }, inner);

/**
 * Coerce object values from MCP bridge (handles JSON string conversion)
 * Claude Desktop and some MCP clients stringify nested objects during transport.
 *
 * @param schema - The Zod schema to validate the parsed object against
 */
export const coerceObject = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => {
    // Already an object - return as-is
    if (typeof val === 'object' && val !== null) return val;

    // String - try to parse as JSON
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        // Return original value, let schema validation handle the error
        return val;
      }
    }

    // Other types - return as-is and let schema validation handle
    return val;
  }, schema);
