/**
 * Enhanced error messages with recovery suggestions for better UX
 * across the OmniFocus MCP bridge
 */

export interface ErrorWithRecovery {
  message: string;
  recovery?: string[];
  error_id?: string;
  recovery_suggestions?: string[];
  related_documentation?: string[];
  support_contact?: string;
  technical_details?: Record<string, unknown>;
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

  // Add error ID if present
  if (error.error_id) {
    parts.push(`Error ID: ${error.error_id}`);
  }

  // Add recovery suggestions (prioritize recovery_suggestions over recovery)
  const suggestions = error.recovery_suggestions || error.recovery;
  if (suggestions && suggestions.length > 0) {
    parts.push('', 'How to fix:');
    parts.push(...suggestions.map((step) => `  • ${step}`));
  }

  // Add related documentation
  if (error.related_documentation && error.related_documentation.length > 0) {
    parts.push('', 'Related documentation:');
    parts.push(...error.related_documentation.map((doc) => `  • ${doc}`));
  }

  // Add support contact
  if (error.support_contact) {
    parts.push('', `Support: ${error.support_contact}`);
  }

  // Add technical details (for debugging)
  if (error.technical_details && Object.keys(error.technical_details).length > 0) {
    parts.push('', 'Technical details:');
    parts.push(JSON.stringify(error.technical_details, null, 2));
  }

  return parts.join('\n');
}
