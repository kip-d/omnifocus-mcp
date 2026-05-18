// src/diagnostics/normalize.ts

/** Extracted verbatim from scripts/analyze-tool-failures.ts:119-122 (the canonical normalization). */
export function normalizeErrorMessage(errorMessage: string): string {
  return errorMessage
    .replace(/[0-9a-f]{8,}/gi, 'ID')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .substring(0, 100);
}

/** Structural fingerprint of the input: sorted top-level key names only (never values — values are PII-redacted but still volatile). */
export function normalizeInputShape(inputArgs: unknown): string {
  if (inputArgs === null || typeof inputArgs !== 'object' || Array.isArray(inputArgs)) {
    return '<non-object>';
  }
  return Object.keys(inputArgs as Record<string, unknown>)
    .sort()
    .join(',');
}
