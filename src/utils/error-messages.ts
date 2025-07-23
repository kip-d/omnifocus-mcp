/**
 * Utility functions for creating consistent, user-friendly error messages
 * across the OmniFocus MCP bridge
 */

/**
 * Generate a helpful "entity not found" error message
 */
export function entityNotFoundError(entityType: string, id: string, listToolName: string): string {
  return `${entityType} with ID '${id}' not found. Use '${listToolName}' tool to see available ${entityType.toLowerCase()}s.`;
}

/**
 * Generate a helpful "invalid parameter" error message with format example
 */
export function invalidParameterError(
  paramName: string,
  value: any,
  expectedFormat: string,
  example: string,
): string {
  return `Invalid ${paramName}: '${value}'. Expected format: ${expectedFormat}. Example: ${example}`;
}

/**
 * Generate a helpful "invalid date format" error message
 */
export function invalidDateError(fieldName: string, value: string): string {
  return `Invalid date format for ${fieldName}: '${value}'. Expected ISO 8601 format. Examples: '2024-01-20T15:30:00Z' (with time) or '2024-01-20' (date only).`;
}

/**
 * Generate script execution error with helpful context
 */
export function scriptExecutionError(operation: string, details: string, suggestion?: string): string {
  let message = `Failed to ${operation} in OmniFocus: ${details}`;
  if (suggestion) {
    message += `. ${suggestion}`;
  }
  return message;
}

/**
 * Generate parsing error with context about what was expected vs received
 */
export function parsingError(operation: string, received: string, expected: string): string {
  return `Failed to parse ${operation} response. Expected ${expected}, but received: ${received.substring(0, 200)}${received.length > 200 ? '...' : ''}`;
}

/**
 * Generate OmniFocus not running error with troubleshooting steps
 */
export function omniFocusNotRunningError(operation: string): string {
  return `Cannot ${operation} - OmniFocus may not be running or is showing a dialog. Please ensure OmniFocus is open and no dialogs are blocking automation.`;
}

/**
 * Generate permission error with specific troubleshooting
 */
export function permissionError(operation: string): string {
  return `Permission denied for ${operation}. Please check that OmniFocus automation permissions are enabled in System Preferences > Security & Privacy > Privacy > Automation.`;
}

/**
 * Common error messages for different scenarios
 */
export const ERROR_MESSAGES = {
  TASK_NOT_FOUND: (taskId: string) => entityNotFoundError('Task', taskId, 'list_tasks'),
  PROJECT_NOT_FOUND: (projectId: string) => entityNotFoundError('Project', projectId, 'list_projects'),
  TAG_NOT_FOUND: (tagName: string) => `Tag '${tagName}' not found. Use 'list_tags' tool to see available tags.`,
  INVALID_DATE: (fieldName: string, value: string) => invalidDateError(fieldName, value),
  ALREADY_COMPLETED: (entityType: string, name: string) => `${entityType} '${name}' is already completed.`,
  SCRIPT_TIMEOUT: (operation: string) => `${operation} operation timed out. This may indicate OmniFocus is processing a large amount of data or is unresponsive.`,
  JSON_PARSE_FAILED: (operation: string, content: string) => parsingError(operation, content, 'valid JSON'),
} as const;
