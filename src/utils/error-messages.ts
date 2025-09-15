/**
 * Enhanced error messages with recovery suggestions for better UX
 * across the OmniFocus MCP bridge
 */

export interface ErrorWithRecovery {
  message: string;
  recovery?: string[];
}

/**
 * Generate a helpful "entity not found" error message with recovery steps
 */
export function entityNotFoundError(entityType: string, id: string, listToolName: string): ErrorWithRecovery {
  return {
    message: `${entityType} with ID '${id}' not found.`,
    recovery: [
      `Use '${listToolName}' tool to see available ${entityType.toLowerCase()}s`,
      'The item may have been deleted or completed',
      'If recently created, wait a moment for sync to complete',
      'Verify the ID is correct and still exists',
    ],
  };
}

/**
 * Generate a helpful "invalid parameter" error message with format example
 */
export function invalidParameterError(
  paramName: string,
  value: unknown,
  expectedFormat: string,
  example: string,
): ErrorWithRecovery {
  return {
    message: `Invalid ${paramName}: '${String(value)}'.`,
    recovery: [
      `Expected format: ${expectedFormat}`,
      `Example: ${example}`,
      'Check parameter names and types',
      'Ensure required parameters are provided',
    ],
  };
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
 * Generate script execution error with helpful context
 */
export function scriptExecutionError(operation: string, details: string, suggestion?: string): ErrorWithRecovery {
  const recovery = [
    'Ensure OmniFocus is running and not blocked by dialogs',
    'Check that no modal windows are open in OmniFocus',
    'Try bringing OmniFocus to the foreground',
  ];

  if (suggestion) {
    recovery.unshift(suggestion);
  }

  return {
    message: `Failed to ${operation} in OmniFocus: ${details}`,
    recovery,
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
 * Generate OmniFocus not running error with troubleshooting steps
 */
export function omniFocusNotRunningError(operation: string): ErrorWithRecovery {
  return {
    message: `Cannot ${operation} - OmniFocus is not running.`,
    recovery: [
      'Open OmniFocus from your Applications folder or Dock',
      'Wait for OmniFocus to fully load',
      'Close any blocking dialogs or modal windows',
      'Try your request again',
    ],
  };
}

/**
 * Generate permission error with specific troubleshooting
 */
export function permissionError(operation: string): ErrorWithRecovery {
  return {
    message: `Permission denied for ${operation}.`,
    recovery: [
      'You may see a permission dialog - click "OK" to grant access',
      'Or manually grant permissions:',
      '  • Open System Settings → Privacy & Security → Automation',
      '  • Find the app using this MCP server (Claude Desktop, Terminal, etc.)',
      '  • Enable the checkbox next to OmniFocus',
      'After granting permissions, try your request again',
    ],
  };
}

/**
 * Tag creation limitation error
 */
export function tagCreationLimitationError(): ErrorWithRecovery {
  return {
    message: 'Cannot assign tags during task creation.',
    recovery: [
      'Create the task first without tags',
      'Then use update_task to add tags',
      'This is a known JXA limitation',
      'Example: create_task({name: "Task"}), then update_task({taskId, tags: ["tag1"]})',
    ],
  };
}

/**
 * Parent task limitation error
 */
export function parentTaskLimitationError(): ErrorWithRecovery {
  return {
    message: 'Cannot move existing task to a parent.',
    recovery: [
      'Tasks must be created with parentTaskId initially',
      'Create a new task as a subtask instead',
      'Or manually move the task in OmniFocus UI',
      'This is a JXA API limitation',
    ],
  };
}

/**
 * Script timeout error with performance suggestions
 */
export function scriptTimeoutError(operation: string): ErrorWithRecovery {
  return {
    message: `${operation} operation timed out.`,
    recovery: [
      'Try reducing the amount of data requested (use limit parameter)',
      'If querying tasks, try using skipAnalysis=true for faster results',
      'Close other OmniFocus windows or dialogs that may be blocking',
      'Consider breaking large operations into smaller chunks',
      'Ensure OmniFocus is not syncing or performing maintenance',
    ],
  };
}

/**
 * Perspective error with suggestions
 */
export function perspectiveError(perspectiveName: string, notFound: boolean = true): ErrorWithRecovery {
  if (notFound) {
    return {
      message: `Perspective '${perspectiveName}' not found.`,
      recovery: [
        'Use list_perspectives to see available perspectives',
        'Perspective names are case-sensitive',
        'Custom perspectives must be created in OmniFocus first',
        'Built-in perspectives: Inbox, Projects, Tags, Forecast, Flagged, Review',
      ],
    };
  }

  return {
    message: `Cannot access perspective '${perspectiveName}'.`,
    recovery: [
      'Ensure OmniFocus 4.6+ is installed',
      'Some custom perspectives may have restricted access',
      'Try accessing a built-in perspective first',
      'Restart OmniFocus if perspectives were recently modified',
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
