/**
 * Error Recovery Utilities for OmniFocus MCP Server
 *
 * Provides intelligent error classification that maps OmniFocus/JXA failures to
 * actionable recovery guidance. (Retry-with-backoff lives on BaseTool — see
 * `executeWithRetry` in src/tools/base.ts; the former standalone copy here was
 * dead and was removed.)
 */

/**
 * Enhanced error context for better debugging and user guidance
 */
export interface EnhancedErrorContext {
  /** Unique error identifier for tracking */
  error_id?: string;

  /** Suggested recovery actions */
  recovery_suggestions?: string[];

  /** Links to related documentation */
  related_documentation?: string[];

  /** Support contact information */
  support_contact?: string;

  /** Additional technical details */
  technical_details?: Record<string, unknown>;
}

/**
 * Generate a unique error ID for tracking
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Classify error and provide appropriate context
 */
export function classifyErrorWithContext(error: unknown, operation: string): EnhancedErrorContext {
  if (!(error instanceof Error)) {
    return {
      recovery_suggestions: ['An unknown error occurred', 'Please try again'],
    };
  }

  const errorMessage = error.message.toLowerCase();
  const context: EnhancedErrorContext = {
    error_id: generateErrorId(),
  };

  // Permission errors
  if (errorMessage.includes('permission') || errorMessage.includes('-1743')) {
    context.recovery_suggestions = [
      'Grant OmniFocus automation permissions in System Settings',
      'Restart OmniFocus after granting permissions',
    ];
    context.related_documentation = ['https://docs.omnifocus.com/automation-permissions'];
  }

  // Timeout errors
  else if (errorMessage.includes('timeout')) {
    context.recovery_suggestions = [
      'Reduce the scope of your query',
      'Try again with smaller data sets',
      'Check system performance and available resources',
    ];
    context.technical_details = {
      operation,
      timestamp: new Date().toISOString(),
    };
  }

  // Connection errors
  else if (errorMessage.includes('connection') || errorMessage.includes('not running')) {
    context.recovery_suggestions = [
      'Ensure OmniFocus is running and responsive',
      'Close any blocking dialogs in OmniFocus',
      'Restart OmniFocus if needed',
    ];
  }

  return context;
}
