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

// OMN-365: only a plain decimal integer/float string converts — optional
// leading `-`, digits, optional `.digits`. Deliberately excludes every form
// `Number(val)` would otherwise accept: hex ("0x10"), exponent ("1e3"),
// "Infinity"/"-Infinity", "NaN", a leading "+", and whitespace-only strings
// (tested against the TRIMMED value, below).
const DECIMAL_NUMBER_RE = /^-?\d+(\.\d+)?$/;

/**
 * Coerce number values from MCP bridge
 *
 * Converts numeric strings only, and only ones that look like a plain decimal
 * number (OMN-365: `Number(val)` silently accepted "0x10" → 16, "1e3" → 1000,
 * "Infinity" → Infinity, which then passed a bare `min()`-only bound like
 * `offset: coerceNumber(z.number().min(0))`). Anything else — hex, exponent,
 * Infinity/NaN spellings, non-numeric strings, null, blank strings, booleans —
 * passes through UNCHANGED so the inner schema rejects it (OMN-329: the old
 * `z.coerce.number()` turned null/"" into 0 and true into 1; this helper must
 * not reintroduce that class of silent acceptance for different inputs).
 *
 * The default inner schema is `.finite()` so a bare `coerceNumber()` call
 * can't accept Infinity/-Infinity even as a NATIVE (non-string) JS number —
 * the regex above only governs the STRING path. A passed-in `inner` is used
 * as-is (not auto-widened), so every call site chains its own `.finite()` for
 * the same native-number guarantee — see read-schema.ts's limit/offset/
 * daysAhead.
 */
export const coerceNumber = (inner: z.ZodNumber = z.number().finite()) =>
  z.preprocess((val) => {
    if (typeof val !== 'string') return val;
    const trimmed = val.trim();
    if (!DECIMAL_NUMBER_RE.test(trimmed)) return val;
    return Number(trimmed);
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
