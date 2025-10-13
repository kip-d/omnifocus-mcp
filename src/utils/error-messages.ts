/**
 * Enhanced error messages with recovery suggestions for better UX
 * across the OmniFocus MCP bridge
 */

export interface ErrorWithRecovery {
  message: string;
  recovery?: string[];
}

/**
 * Generate a helpful "invalid date format" error message
 */
export function invalidDateError(fieldName: string, value: string): ErrorWithRecovery {
  return {
    message: `Invalid date format for ${fieldName}: '${value}'.`,
    recovery: [
      'Use format: YYYY-MM-DD or YYYY-MM-DD HH:mm',
      'Examples: "2025-03-31" or "2025-03-31 14:30"',
      'Relative dates work too: "tomorrow", "next Monday", "in 2 weeks"',
      'Avoid ISO 8601 with Z suffix (2025-03-31T14:30:00.000Z)',
    ],
  };
}

/**
 * Generate parsing error with context about what was expected
 */
export function parsingError(operation: string, _received: string, expected: string): ErrorWithRecovery {
  return {
    message: `Failed to parse ${operation} response.`,
    recovery: [
      `Expected ${expected}, but received unexpected format`,
      'This may indicate a version mismatch',
      'Try updating OmniFocus to the latest version',
      'Restart OmniFocus and try again',
    ],
  };
}

/**
 * Format error with recovery for user display
 */
export function formatErrorWithRecovery(error: ErrorWithRecovery): string {
  const parts = [error.message];

  if (error.recovery && error.recovery.length > 0) {
    parts.push('', 'How to fix:');
    parts.push(...error.recovery.map(step => `  • ${step}`));
  }

  return parts.join('\n');
}

