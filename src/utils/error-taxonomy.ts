/**
 * Enhanced Error Categorization System for OmniFocus MCP Server
 *
 * Provides comprehensive error taxonomy with actionable recovery guidance
 * Based on Phase 1 roadmap requirements and existing error patterns
 */

import { ErrorWithRecovery } from './error-messages.js';

/**
 * Comprehensive error type taxonomy for OmniFocus MCP operations
 */
export enum ScriptErrorType {
  // Connection & Permission Errors
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  OMNIFOCUS_NOT_RUNNING = 'OMNIFOCUS_NOT_RUNNING',

  // Script Execution Errors
  SCRIPT_TIMEOUT = 'SCRIPT_TIMEOUT',
  SCRIPT_TOO_LARGE = 'SCRIPT_TOO_LARGE',
  BRIDGE_FAILURE = 'BRIDGE_FAILURE',

  // Data & Validation Errors
  INVALID_ID = 'INVALID_ID',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NULL_RESULT = 'NULL_RESULT',

  // System Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  OMNIFOCUS_ERROR = 'OMNIFOCUS_ERROR',
}

/**
 * Enhanced error interface with categorization and actionable guidance
 */
export interface CategorizedScriptError extends ErrorWithRecovery {
  errorType: ScriptErrorType;
  actionable?: string;
  originalError?: unknown;
  context?: Record<string, unknown>;
  error_id?: string;
  recovery_suggestions?: string[];
  related_documentation?: string[];
  support_contact?: string;
  technical_details?: Record<string, unknown>;
}

/**
 * Create a categorized error with enhanced context and recovery guidance
 */
export function createCategorizedError(
  errorType: ScriptErrorType,
  message: string,
  recovery: string[],
  actionable?: string,
  context?: Record<string, unknown>,
  originalError?: unknown,
  error_id?: string,
  recovery_suggestions?: string[],
  related_documentation?: string[],
  support_contact?: string,
  technical_details?: Record<string, unknown>,
): CategorizedScriptError {
  return {
    errorType,
    message,
    recovery,
    actionable,
    context,
    originalError,
    error_id,
    recovery_suggestions,
    related_documentation,
    support_contact,
    technical_details,
  };
}

/**
 * Categorize an error based on its characteristics and return enhanced error information
 */
export function categorizeError(
  error: unknown,
  operation: string,
  context?: Record<string, unknown>,
): CategorizedScriptError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();

  // Permission denied errors
  if (errorString.includes('-1743') ||
      errorString.includes('not allowed') ||
      errorString.includes('authorization') ||
      errorString.includes('permission denied')) {
    return createCategorizedError(
      ScriptErrorType.PERMISSION_DENIED,
      `Permission denied for ${operation}`,
      [
        'You may see a permission dialog - click "OK" to grant access',
        'Or manually grant permissions:',
        '  • Open System Settings → Privacy & Security → Automation',
        '  • Find the app using this MCP server (Claude Desktop, Terminal, etc.)',
        '  • Enable the checkbox next to OmniFocus',
        'After granting permissions, try your request again',
      ],
      'Grant automation permissions in System Settings',
      context,
      error,
    );
  }

  // OmniFocus not running errors
  if (errorString.includes('not running') ||
      errorString.includes("can't find process") ||
      errorString.includes('application isn\'t running')) {
    return createCategorizedError(
      ScriptErrorType.OMNIFOCUS_NOT_RUNNING,
      `Cannot ${operation} - OmniFocus is not running`,
      [
        'Open OmniFocus from your Applications folder or Dock',
        'Wait for OmniFocus to fully load',
        'Close any blocking dialogs or modal windows',
        'Try your request again',
      ],
      'Launch OmniFocus and ensure it\'s fully loaded',
      context,
      error,
    );
  }

  // Connection timeout errors (must come before script timeout to avoid misclassification)
  if (errorString.includes('connection timeout') ||
      errorString.includes('connection test failed') ||
      (context?.consecutiveFailures && Number(context.consecutiveFailures) >= 3)) {
    return createCategorizedError(
      ScriptErrorType.CONNECTION_TIMEOUT,
      `Connection timeout during ${operation}`,
      [
        'OmniFocus connection has become unresponsive',
        'Restart OmniFocus and try again',
        'Check system performance and available memory',
        'Close other applications to free up resources',
        'Wait a few moments before retrying',
      ],
      'Restart OmniFocus to restore connection',
      context,
      error,
    );
  }

  // Script timeout errors
  if (errorString.includes('timeout') ||
      errorString.includes('timed out') ||
      errorString.includes('execution took too long')) {
    return createCategorizedError(
      ScriptErrorType.SCRIPT_TIMEOUT,
      `${operation} operation timed out`,
      [
        'Try reducing the amount of data requested (use limit parameter)',
        'If querying tasks, try using skipAnalysis=true for faster results',
        'Close other OmniFocus windows or dialogs that may be blocking',
        'Consider breaking large operations into smaller chunks',
        'Ensure OmniFocus is not syncing or performing maintenance',
      ],
      'Reduce query scope or enable skipAnalysis for better performance',
      context,
      error,
    );
  }

  // Script too large errors
  if (errorString.includes('script too large') ||
      errorString.includes('argument list too long') ||
      errorString.includes('script size')) {
    return createCategorizedError(
      ScriptErrorType.SCRIPT_TOO_LARGE,
      `Script size exceeded limits for ${operation}`,
      [
        'This operation requires a smaller dataset',
        'Try using limit parameter to reduce results',
        'Consider using field selection to reduce payload size',
        'Break the operation into smaller chunks',
      ],
      'Reduce script size by limiting data or using field selection',
      context,
      error,
    );
  }

  // Bridge failure errors (evaluateJavascript issues)
  if (errorString.includes('evaluatejavascript') ||
      errorString.includes('bridge') ||
      errorString.includes('omniJs') ||
      (context?.helper === 'bridge' && errorString.includes('failed'))) {
    return createCategorizedError(
      ScriptErrorType.BRIDGE_FAILURE,
      `JavaScript bridge failure during ${operation}`,
      [
        'This operation uses the OmniJS bridge for complex functionality',
        'Ensure OmniFocus 4.6+ is installed',
        'Try the operation again (bridge can be intermittent)',
        'Fallback to simpler operations if possible',
        'Check OmniFocus console for additional error details',
      ],
      'Retry operation or use simpler alternatives',
      context,
      error,
    );
  }

  // Invalid ID errors
  if (errorString.includes('invalid id') ||
      errorString.includes('not found') ||
      errorString.includes('no such') ||
      (errorString.includes('null') && errorString.includes('id'))) {
    return createCategorizedError(
      ScriptErrorType.INVALID_ID,
      `Invalid or missing ID for ${operation}`,
      [
        'Verify the ID is correct and still exists',
        'Use list tools to see available items',
        'The item may have been deleted or completed',
        'If recently created, wait a moment for sync to complete',
      ],
      'Check ID validity using appropriate list tool',
      context,
      error,
    );
  }

  // Null result errors
  if (errorString.includes('null_result') ||
      errorString.includes('returned null') ||
      errorString.includes('undefined result')) {
    return createCategorizedError(
      ScriptErrorType.NULL_RESULT,
      `No data returned from ${operation}`,
      [
        'The operation completed but returned no results',
        'Check if the requested data exists',
        'Verify your query parameters',
        'Try a broader search or different filters',
      ],
      'Verify query parameters and data existence',
      context,
      error,
    );
  }

  // OmniAutomation specific errors
  if (error instanceof Error && error.name === 'OmniAutomationError') {
    return createCategorizedError(
      ScriptErrorType.OMNIFOCUS_ERROR,
      `OmniFocus automation error: ${error.message}`,
      [
        'Check that OmniFocus is not showing any dialogs',
        'Ensure OmniFocus is responsive and not busy',
        'Try bringing OmniFocus to the foreground',
        'Close any modal windows or alerts in OmniFocus',
      ],
      'Clear OmniFocus dialogs and ensure app is responsive',
      context,
      error,
    );
  }

  // Validation errors (from Zod or parameter validation) - be more specific
  if (errorString.includes('validation failed') ||
      errorString.includes('invalid parameter') ||
      errorString.includes('required field') ||
      errorString.includes('parameter validation') ||
      (errorString.includes('expected') && (errorString.includes('but got') || errorString.includes('received')))) {
    return createCategorizedError(
      ScriptErrorType.VALIDATION_ERROR,
      `Parameter validation failed for ${operation}`,
      [
        'Check that all required parameters are provided',
        'Verify parameter types and formats',
        'Review the tool documentation for correct usage',
        'Ensure dates are in YYYY-MM-DD or YYYY-MM-DD HH:mm format',
      ],
      'Review and correct parameter values',
      context,
      error,
    );
  }

  // Generic internal error
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  return createCategorizedError(
    ScriptErrorType.INTERNAL_ERROR,
    `Internal error during ${operation}: ${errorMessage}`,
    [
      'Try the operation again',
      'Check that OmniFocus is running and responsive',
      'Verify your parameters are correct',
      'If the issue persists, restart OmniFocus',
    ],
    'Retry operation and verify system state',
    context,
    error,
    errorId,
    [
      'Try the operation again',
      'Check that OmniFocus is running and responsive',
      'Verify your parameters are correct',
      'If the issue persists, restart OmniFocus',
    ],
    [
      'https://docs.omnifocus.com/troubleshooting',
    ],
    'support@omnifocus.com',
    {
      operation,
      timestamp: new Date().toISOString(),
      errorType: 'INTERNAL_ERROR',
    },
  );
}

/**
 * Get user-friendly error message with recovery guidance
 */
export function getErrorMessage(categorizedError: CategorizedScriptError): string {
  const parts = [categorizedError.message];

  if (categorizedError.actionable) {
    parts.push('', `Quick fix: ${categorizedError.actionable}`);
  }

  if (categorizedError.recovery && categorizedError.recovery.length > 0) {
    parts.push('', 'How to resolve:');
    parts.push(...categorizedError.recovery.map(step => `  • ${step}`));
  }

  return parts.join('\n');
}

/**
 * Check if an error is recoverable (user can take action to fix it)
 */
export function isRecoverableError(errorType: ScriptErrorType): boolean {
  switch (errorType) {
    case ScriptErrorType.PERMISSION_DENIED:
    case ScriptErrorType.OMNIFOCUS_NOT_RUNNING:
    case ScriptErrorType.SCRIPT_TIMEOUT:
    case ScriptErrorType.SCRIPT_TOO_LARGE:
    case ScriptErrorType.INVALID_ID:
    case ScriptErrorType.VALIDATION_ERROR:
    case ScriptErrorType.CONNECTION_TIMEOUT:
    case ScriptErrorType.OMNIFOCUS_ERROR:
      return true;

    case ScriptErrorType.BRIDGE_FAILURE:
    case ScriptErrorType.NULL_RESULT:
    case ScriptErrorType.INTERNAL_ERROR:
      return false; // May require code changes or investigation

    default:
      return false;
  }
}

/**
 * Get severity level for an error type
 */
export function getErrorSeverity(errorType: ScriptErrorType): 'low' | 'medium' | 'high' | 'critical' {
  switch (errorType) {
    case ScriptErrorType.NULL_RESULT:
    case ScriptErrorType.INVALID_ID:
    case ScriptErrorType.VALIDATION_ERROR:
      return 'low';

    case ScriptErrorType.SCRIPT_TIMEOUT:
    case ScriptErrorType.SCRIPT_TOO_LARGE:
    case ScriptErrorType.BRIDGE_FAILURE:
      return 'medium';

    case ScriptErrorType.OMNIFOCUS_ERROR:
    case ScriptErrorType.CONNECTION_TIMEOUT:
    case ScriptErrorType.INTERNAL_ERROR:
      return 'high';

    case ScriptErrorType.PERMISSION_DENIED:
    case ScriptErrorType.OMNIFOCUS_NOT_RUNNING:
      return 'critical';

    default:
      return 'medium';
  }
}
