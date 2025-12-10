import { z } from 'zod';
import { BaseTool } from '../../base.js';
import { QueryTasksArgsV2, QueryTasksToolSchemaV2 } from '../QueryTasksTool.js';
import { TasksResponseV2 } from '../../response-types-v2.js';
import { OperationTimerV2 } from '../../../utils/response-format.js';
import { OmniFocusTask } from '../../../omnifocus/types.js';
import { ScriptResult, isScriptSuccess, isScriptError } from '../../../omnifocus/script-result-types.js';

/**
 * Base class for query mode handlers
 * Provides common functionality for all query modes
 */
export abstract class BaseQueryHandler {
  constructor(
    protected tool: BaseTool<typeof QueryTasksToolSchemaV2, TasksResponseV2>,
    protected timer: OperationTimerV2
  ) {}

  /**
   * Handle the specific query mode
   */
  abstract handle(args: QueryTasksArgsV2): Promise<TasksResponseV2>;

  /**
   * Common error handling for script execution
   */
  protected handleScriptError(
    result: ScriptResult<unknown>,
    operation: string,
    context?: unknown
  ): TasksResponseV2 {
    const specificError = this.getSpecificErrorResponse(result, operation, this.timer);
    if (specificError) {
      return specificError;
    }

    return this.tool.handleErrorV2(
      result.error || 'Script execution failed',
      result.details
    );
  }

  /**
   * Get specific error responses for common OmniFocus issues
   */
  protected getSpecificErrorResponse(
    error: unknown,
    operation: string,
    timer: OperationTimerV2
  ): TasksResponseV2 | null {
    const errorMessage = error && typeof error === 'object' && 'error' in error
      ? String(error.error)
      : String(error);

    // Check for permission errors
    if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
      return this.createErrorResponse(
        'PERMISSION_DENIED',
        'Permission denied: automation access required',
        'Enable automation access in System Settings > Privacy & Security > Automation',
        error,
        timer
      );
    }

    // Check for OmniFocus not running
    if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
      return this.createErrorResponse(
        'OMNIFOCUS_NOT_RUNNING',
        'OmniFocus is not running or not accessible',
        'Start OmniFocus and ensure it is running',
        error,
        timer
      );
    }

    // Check for timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return this.createErrorResponse(
        'SCRIPT_TIMEOUT',
        'Script execution timed out',
        'Try reducing the limit parameter or using a more specific mode',
        error,
        timer
      );
    }

    return null; // No specific error detected
  }

  /**
   * Create standardized error response
   */
  protected createErrorResponse(
    errorType: string,
    message: string,
    suggestion: string,
    details?: unknown,
    timer?: OperationTimerV2
  ): TasksResponseV2 {
    const metadata = timer ? timer.toMetadata() : {};
    return {
      success: false,
      error: errorType,
      message,
      suggestion,
      details,
      metadata,
    } as TasksResponseV2;
  }

  /**
   * Parse tasks from script result
   */
  protected parseTasks(tasks: unknown[]): OmniFocusTask[] {
    if (!tasks || !Array.isArray(tasks)) {
      return [];
    }
    return tasks.map(task => {
      const t = task as {
        dueDate?: string | Date;
        deferDate?: string | Date;
        completionDate?: string | Date;
        added?: string | Date;
        modified?: string | Date;
        dropDate?: string | Date;
        parentTaskId?: string;
        parentTaskName?: string;
        inInbox?: boolean;
        [key: string]: unknown;
      };
      return {
        ...t,
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
        deferDate: t.deferDate ? new Date(t.deferDate) : undefined,
        completionDate: t.completionDate ? new Date(t.completionDate) : undefined,
        added: t.added ? new Date(t.added) : undefined,
        modified: t.modified ? new Date(t.modified) : undefined,
        dropDate: t.dropDate ? new Date(t.dropDate) : undefined,
        parentTaskId: t.parentTaskId,
        parentTaskName: t.parentTaskName,
        inInbox: t.inInbox,
      } as unknown as OmniFocusTask;
    });
  }

  /**
   * Project task fields based on user selection
   */
  protected projectFields(tasks: OmniFocusTask[], selectedFields?: string[]): OmniFocusTask[] {
    if (!selectedFields || selectedFields.length === 0) {
      return tasks;
    }

    return tasks.map(task => {
      const projectedTask: Partial<OmniFocusTask> = {};

      // Always include id if not explicitly excluded
      if (selectedFields.includes('id') || !selectedFields.length) {
        projectedTask.id = task.id;
      }

      // Project only requested fields
      selectedFields.forEach(field => {
        if (field in task) {
          const typedField = field as keyof OmniFocusTask;
          (projectedTask as Record<string, unknown>)[field] = task[typedField];
        }
      });

      return projectedTask as OmniFocusTask;
    });
  }

  /**
   * Sort tasks based on provided sort options
   */
  protected sortTasks(tasks: OmniFocusTask[], sortOptions?: any[]): OmniFocusTask[] {
    if (!sortOptions || sortOptions.length === 0) {
      return tasks;
    }

    return [...tasks].sort((a, b) => {
      for (const option of sortOptions) {
        const aValue = (a as unknown as Record<string, unknown>)[option.field];
        const bValue = (b as unknown as Record<string, unknown>)[option.field];

        if (aValue === null || aValue === undefined) {
          if (bValue === null || bValue === undefined) continue;
          return 1;
        }
        if (bValue === null || bValue === undefined) {
          return -1;
        }

        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          comparison = aValue === bValue ? 0 : aValue ? -1 : 1;
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        } else {
          let aStr: string;
          let bStr: string;

          if (typeof aValue === 'object' && aValue !== null) {
            aStr = JSON.stringify(aValue);
          } else {
            aStr = String(aValue as string | number | boolean);
          }

          if (typeof bValue === 'object' && bValue !== null) {
            bStr = JSON.stringify(bValue);
          } else {
            bStr = String(bValue as string | number | boolean);
          }

          comparison = aStr.localeCompare(bStr);
        }

        if (comparison !== 0) {
          return option.direction === 'desc' ? -comparison : comparison;
        }
      }

      return 0;
    });
  }
}