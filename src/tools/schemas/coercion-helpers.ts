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
 * Coerce number values from MCP bridge
 */
export const coerceNumber = () => z.coerce.number();
