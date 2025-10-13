/**
 * Centralized Error Codes for OmniFocus MCP Server
 *
 * This enum provides standardized error codes used across all tools for consistent
 * error handling and reporting.
 *
 * @example
 * ```typescript
 * import { ErrorCode } from '../utils/error-codes.js';
 *
 * return createErrorResponseV2(
 *   'tasks',
 *   ErrorCode.OMNIFOCUS_NOT_RUNNING,
 *   'OmniFocus is not running',
 *   'Start OmniFocus and ensure it is running',
 *   error,
 *   timer.toMetadata()
 * );
 * ```
 */
export enum ErrorCode {
  // ===================================================================
  // OmniFocus-Specific Errors
  // ===================================================================

  /**
   * OmniFocus application is not running or not accessible
   *
   * **Recovery**: Start OmniFocus and ensure it is running
   * **Common Causes**: App not launched, crashed, or unresponsive
   */
  OMNIFOCUS_NOT_RUNNING = 'OMNIFOCUS_NOT_RUNNING',

  /**
   * Automation permission denied (error 1743)
   *
   * **Recovery**: Enable automation access in System Settings > Privacy & Security > Automation
   * **Common Causes**: First-time automation access, permissions revoked
   */
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  /**
   * Script execution timed out
   *
   * **Recovery**: Reduce limit parameter, use more specific filters, or use skipAnalysis
   * **Common Causes**: Large datasets (2000+ tasks), complex queries, slow system
   */
  SCRIPT_TIMEOUT = 'SCRIPT_TIMEOUT',

  /**
   * Generic script execution error
   *
   * **Recovery**: Check error details and verify OmniFocus state
   * **Common Causes**: Malformed script, unexpected data, OmniFocus internal error
   */
  SCRIPT_ERROR = 'SCRIPT_ERROR',

  /**
   * Script execution failed with additional context
   *
   * **Recovery**: See error details for specific issue
   * **Common Causes**: Invalid parameters, data constraints, OmniFocus state issues
   */
  EXECUTION_ERROR = 'EXECUTION_ERROR',

  /**
   * Script returned null or empty result when data was expected
   *
   * **Recovery**: Verify the requested resource exists
   * **Common Causes**: Invalid ID, deleted item, wrong database
   */
  NULL_RESULT = 'NULL_RESULT',

  // ===================================================================
  // Validation Errors
  // ===================================================================

  /**
   * Invalid operation specified
   *
   * **Recovery**: Use one of the valid operations listed in error details
   * **Common Causes**: Typo in operation name, using deprecated operation
   */
  INVALID_OPERATION = 'INVALID_OPERATION',

  /**
   * Invalid or malformed parameters
   *
   * **Recovery**: Check parameter format and required fields
   * **Common Causes**: Wrong type, missing required field, invalid format
   */
  INVALID_PARAMS = 'INVALID_PARAMS',

  /**
   * Required parameter is missing
   *
   * **Recovery**: Provide the required parameter specified in error details
   * **Common Causes**: Incomplete request, missing required field
   */
  MISSING_PARAMETER = 'MISSING_PARAMETER',

  /**
   * Provided ID (task, project, folder, tag) not found
   *
   * **Recovery**: Verify ID exists using list operation
   * **Common Causes**: Item deleted, wrong database, typo in ID
   */
  INVALID_ID = 'INVALID_ID',

  // ===================================================================
  // Operation-Specific Errors
  // ===================================================================

  /**
   * Failed to create resource
   *
   * **Recovery**: Check required fields and constraints
   * **Common Causes**: Missing name, invalid parent, constraint violation
   */
  CREATE_FAILED = 'CREATE_FAILED',

  /**
   * Failed to update resource
   *
   * **Recovery**: Verify resource exists and update parameters are valid
   * **Common Causes**: Invalid ID, immutable field, constraint violation
   */
  UPDATE_FAILED = 'UPDATE_FAILED',

  /**
   * Failed to delete resource
   *
   * **Recovery**: Verify resource exists and can be deleted
   * **Common Causes**: Invalid ID, protected resource, cascading constraints
   */
  DELETE_FAILED = 'DELETE_FAILED',

  /**
   * Search or query operation failed
   *
   * **Recovery**: Simplify search criteria or use different mode
   * **Common Causes**: Too complex filter, timeout, invalid search term
   */
  SEARCH_ERROR = 'SEARCH_ERROR',

  // ===================================================================
  // Analytics-Specific Errors
  // ===================================================================

  /**
   * Analytics computation failed
   *
   * **Recovery**: Try with smaller date range or simpler query
   * **Common Causes**: Insufficient data, timeout, invalid date range
   */
  ANALYSIS_ERROR = 'ANALYSIS_ERROR',

  /**
   * Velocity calculation failed
   *
   * **Recovery**: Ensure sufficient historical data exists
   * **Common Causes**: No completed tasks, date range too small
   */
  VELOCITY_ERROR = 'VELOCITY_ERROR',

  // ===================================================================
  // Generic Errors
  // ===================================================================

  /**
   * Internal server error
   *
   * **Recovery**: Check server logs and report issue
   * **Common Causes**: Unexpected exception, programming error, system issue
   */
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  /**
   * Unknown or unclassified error
   *
   * **Recovery**: Check error details and report if persistent
   * **Common Causes**: Unexpected condition, new error type
   */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

