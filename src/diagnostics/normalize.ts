// src/diagnostics/normalize.ts

/** Extracted verbatim from scripts/analyze-tool-failures.ts:119-122 (the canonical normalization). */
export function normalizeErrorMessage(errorMessage: string): string {
  return errorMessage
    .replace(/[0-9a-f]{8,}/gi, 'ID')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .substring(0, 100);
}

// Locale-independent code-point comparator. This sorts a PERSISTED fingerprint, so the
// ordering must NOT depend on locale (localeCompare would let the same key set fingerprint
// differently across locales, splitting dedup groups). Preserves the original bare-.sort()
// semantics while satisfying sonarjs/no-alphabetical-sort.
function byCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Structural fingerprint of the input: sorted top-level key names only (never values — values are PII-redacted but still volatile). */
export function normalizeInputShape(inputArgs: unknown): string {
  if (inputArgs === null || typeof inputArgs !== 'object' || Array.isArray(inputArgs)) {
    return '<non-object>';
  }
  return Object.keys(inputArgs as Record<string, unknown>).sort(byCodePoint).join(',');
}
