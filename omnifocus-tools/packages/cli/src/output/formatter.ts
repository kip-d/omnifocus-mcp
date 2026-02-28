/**
 * Output formatting for OmniFocus CLI.
 *
 * Supports text (LLM-friendly), JSON, CSV, and Markdown table output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutputFormat = 'text' | 'json' | 'csv' | 'markdown';

export interface FormatOptions {
  /** Only include these fields in output */
  fields?: string[];
  /** Suppress headers (CSV header row, Markdown header) */
  quiet?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if value is a non-null object (not an array) */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Check if data is a count-only response (has `.count` property) */
function isCountOnly(data: unknown): data is { count: number } {
  return isRecord(data) && typeof (data as Record<string, unknown>).count === 'number';
}

/** Normalize data to an array of records for tabular formatting */
function toRecordArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }
  if (isRecord(data)) {
    return [data];
  }
  return [];
}

/** Get all unique keys across an array of records, preserving insertion order */
function collectKeys(records: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

/** Apply field selection: keep only specified fields, in the specified order */
function selectFields(keys: string[], fields?: string[]): string[] {
  if (!fields || fields.length === 0) return keys;
  return fields.filter((f) => keys.includes(f));
}

/** Format a single value for text output */
function formatTextValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(',');
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

/** Escape a CSV field: wrap in quotes if it contains comma, quote, or newline */
function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert a value to a string suitable for CSV/Markdown cells */
function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.join(', ');
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Format: JSON
// ---------------------------------------------------------------------------

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// Format: Text (LLM-friendly)
// ---------------------------------------------------------------------------

function formatText(data: unknown, options: FormatOptions): string {
  const records = toRecordArray(data);
  if (records.length === 0) return 'No results';

  const allKeys = collectKeys(records);
  const keys = selectFields(allKeys, options.fields);

  const lines: string[] = [];
  for (const rec of records) {
    const parts: string[] = [];
    for (const key of keys) {
      const val = rec[key];
      // Omit null/undefined/empty string/empty array
      if (val === null || val === undefined || val === '') continue;
      if (Array.isArray(val) && val.length === 0) continue;
      // Boolean: show key name only if true
      if (typeof val === 'boolean') {
        if (val) parts.push(key);
        continue;
      }
      parts.push(`${key}:${formatTextValue(val)}`);
    }
    lines.push(parts.join(' | '));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Format: Markdown table
// ---------------------------------------------------------------------------

function formatMarkdown(data: unknown, options: FormatOptions): string {
  const records = toRecordArray(data);
  if (records.length === 0) return 'No results';

  const allKeys = collectKeys(records);
  const keys = selectFields(allKeys, options.fields);

  const lines: string[] = [];

  if (!options.quiet) {
    // Header row
    lines.push('| ' + keys.join(' | ') + ' |');
    // Separator row
    lines.push('| ' + keys.map(() => '---').join(' | ') + ' |');
  }

  // Data rows
  for (const rec of records) {
    const cells = keys.map((k) => cellValue(rec[k]));
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Format: CSV
// ---------------------------------------------------------------------------

function formatCsv(data: unknown, options: FormatOptions): string {
  const records = toRecordArray(data);
  if (records.length === 0) return 'No results';

  const allKeys = collectKeys(records);
  const keys = selectFields(allKeys, options.fields);

  const lines: string[] = [];

  if (!options.quiet) {
    // Header row
    lines.push(keys.map(escapeCsv).join(','));
  }

  // Data rows
  for (const rec of records) {
    const cells = keys.map((k) => escapeCsv(cellValue(rec[k])));
    lines.push(cells.join(','));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format data for CLI output.
 *
 * @param data    - The data to format (array, object, or count-only)
 * @param format  - Output format: text, json, csv, or markdown
 * @param options - Field selection and quiet mode
 * @returns Formatted string ready for stdout
 */
export function formatOutput(data: unknown, format: OutputFormat, options?: FormatOptions): string {
  const opts: FormatOptions = options ?? {};

  // Count-only shortcut: return just the number regardless of format
  if (isCountOnly(data)) {
    return String((data as { count: number }).count);
  }

  // Empty array shortcut
  if (Array.isArray(data) && data.length === 0) {
    return 'No results';
  }

  switch (format) {
    case 'json':
      return formatJson(data);
    case 'text':
      return formatText(data, opts);
    case 'markdown':
      return formatMarkdown(data, opts);
    case 'csv':
      return formatCsv(data, opts);
    default:
      return formatJson(data);
  }
}
