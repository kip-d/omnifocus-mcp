/**
 * Consolidated Error Handling Utilities for OmniFocus MCP Server
 *
 * This module provides a unified interface for error categorization, messages,
 * and recovery guidance. Import from this module instead of individual files.
 *
 * @example
 * ```typescript
 * import { categorizeError, getErrorMessage, isRecoverableError } from '../utils/errors';
 *
 * const categorizedError = categorizeError(error, 'task_creation');
 * const userMessage = getErrorMessage(categorizedError);
 * const canRecover = isRecoverableError(categorizedError.errorType);
 * ```
 */

// Re-export error taxonomy
export {
  ScriptErrorType,
  type CategorizedScriptError,
  createCategorizedError,
  categorizeError,
  getErrorMessage,
  isRecoverableError,
  getErrorSeverity,
} from '../error-taxonomy.js';

// Re-export error messages
export {
  type ErrorWithRecovery,
  invalidDateError,
  parsingError,
  formatErrorWithRecovery,
} from '../error-messages.js';

// Re-export error codes (if needed for MCP protocol)
export {
  ErrorCode,
  isErrorCode,
  getErrorMetadata,
} from '../error-codes.js';
