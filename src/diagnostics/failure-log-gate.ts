// src/diagnostics/failure-log-gate.ts

export type SuppressionReason = 'disabled-flag' | 'node-env-test';

export interface FailureLogSuppression {
  suppressed: boolean;
  reason: SuppressionReason | null;
}

// The flag is ON unless its (trimmed, lowercased) value is one of these.
// Unset (undefined) is also OFF. Any other value (1, true, yes, ...) is ON.
const FLAG_OFF_VALUES = new Set(['', '0', 'false']);

/**
 * Pure, total decision for whether failure-log writes are suppressed.
 * Never throws, never does I/O. Takes env explicitly so unit tests do not
 * mutate process.env.
 *
 * Precedence: explicit disable flag, then NODE_ENV=test.
 */
export function failureLogSuppression(env: Record<string, string | undefined> = process.env): FailureLogSuppression {
  const flag = env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
  if (flag !== undefined && !FLAG_OFF_VALUES.has(flag.trim().toLowerCase())) {
    return { suppressed: true, reason: 'disabled-flag' };
  }
  if (env.NODE_ENV === 'test') {
    return { suppressed: true, reason: 'node-env-test' };
  }
  return { suppressed: false, reason: null };
}
