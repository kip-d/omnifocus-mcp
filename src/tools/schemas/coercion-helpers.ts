import { z } from 'zod';

/**
 * Custom boolean coercion that properly handles MCP string values
 * - "true", "1", "yes" -> true
 * - "false", "0", "no", "" -> false
 * - Actual booleans pass through
 */
export const coerceBoolean = () => z.preprocess(
  (val) => {
    // If already a boolean, return as-is
    if (typeof val === 'boolean') return val;

    // Convert to string and lowercase for comparison
    const strVal = String(val).toLowerCase().trim();

    // True values
    if (strVal === 'true' || strVal === '1' || strVal === 'yes') return true;

    // False values
    if (strVal === 'false' || strVal === '0' || strVal === 'no' || strVal === '') return false;

    // For any other non-empty string, default to true (Zod's default behavior)
    return Boolean(strVal);
  },
  z.boolean(),
);

/**
 * Custom number coercion that handles MCP string values
 * Same as z.coerce.number() but more explicit
 */
export const coerceNumber = () => z.coerce.number();
