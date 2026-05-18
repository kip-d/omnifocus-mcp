// src/diagnostics/failure-log.ts
export interface FailureCategorization {
  errorType: string;
  severity?: string;
  recoverable?: boolean;
  actionable?: string;
  context?: Record<string, unknown>;
}

export interface FailureRecord {
  timestamp: string;
  tool: string;
  // Usually 'VALIDATION_ERROR' | 'EXECUTION_ERROR', but base.ts:303/639 can also write a raw
  // ScriptErrorType string. Keep it `string`; classification keys off `categorization.errorType`.
  errorType: string;
  errorMessage: string;
  validationErrors?: Array<{ path?: (string | number)[]; message?: string }>;
  inputArgs: unknown; // already redacted upstream by redactArgs()
  schemaDescription: string;
  categorization?: FailureCategorization;
}

/** Tolerant line-delimited-JSON parse. Never throws; skips malformed/blank lines. */
export function parseFailureLog(jsonl: string): FailureRecord[] {
  const out: FailureRecord[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.tool === 'string' && typeof parsed.errorMessage === 'string') {
        out.push(parsed as FailureRecord);
      }
    } catch {
      // skip malformed line by design
    }
  }
  return out;
}
