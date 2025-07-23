import { BaseTool } from '../base.js';
import { TaskFilter } from '../../omnifocus/types.js';
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListTasksResponse, OmniFocusTask } from '../response-types.js';
import { ListTasksScriptResult } from '../../omnifocus/jxa-types.js';

export class ListTasksTool extends BaseTool<TaskFilter & { limit?: number; skipAnalysis?: boolean }, ListTasksResponse> {
  name = 'list_tasks';
  description = 'List tasks from OmniFocus with advanced filtering options';

  inputSchema = {
    type: 'object' as const,
    properties: {
      completed: {
        type: 'boolean',
        description: 'Filter by completion status',
      },
      flagged: {
        type: 'boolean',
        description: 'Filter by flagged status',
      },
      projectId: {
        type: 'string',
        description: 'Filter by project ID',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (all specified tags must be present)',
      },
      dueBefore: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks due before this date',
      },
      dueAfter: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks due after this date',
      },
      deferBefore: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks deferred before this date',
      },
      deferAfter: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks deferred after this date',
      },
      search: {
        type: 'string',
        description: 'Search in task name and notes',
      },
      inInbox: {
        type: 'boolean',
        description: 'Filter tasks in inbox',
      },
      available: {
        type: 'boolean',
        description: 'Filter available tasks (not completed, not dropped, not blocked, not deferred)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return (1-1000, default: 100)',
        default: 100,
        minimum: 1,
        maximum: 1000,
      },
      skipAnalysis: {
        type: 'boolean',
        description: 'Skip recurring task analysis for better performance (default: false)',
        default: false,
      },
    },
  };

  async execute(args: TaskFilter & { limit?: number; skipAnalysis?: boolean }): Promise<ListTasksResponse> {
    const timer = new OperationTimer();

    try {
      const { limit = 100, skipAnalysis = false, ...filter } = args;

      // Create cache key from filter (excluding performance options)
      const cacheKey = JSON.stringify(filter);

      // Check cache only if not skipping analysis (to ensure consistent results)
      if (!skipAnalysis) {
        const cached = this.cache.get<ListTasksResponse>('tasks', cacheKey);
        if (cached) {
          this.logger.debug('Returning cached tasks');
          // Return cached response with updated from_cache flag
          return {
            ...cached,
            metadata: {
              ...cached.metadata,
              from_cache: true,
              ...timer.toMetadata(),
            },
          };
        }
      }

      // Execute script - pass filter with limit and skipAnalysis included
      const scriptParams = { ...filter, limit, skipAnalysis };
      this.logger.debug('Script params:', scriptParams);
      const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter: scriptParams });
      this.logger.debug('Generated script length:', script.length);
      const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

      if ('error' in result && result.error) {
        return createErrorResponse(
          'list_tasks',
          'SCRIPT_ERROR',
          'message' in result ? String(result.message) : 'Failed to list tasks',
          'details' in result ? result.details : undefined,
          timer.toMetadata(),
        );
      }

      // Ensure tasks array exists
      if (!result.tasks || !Array.isArray(result.tasks)) {
        return createErrorResponse(
          'list_tasks',
          'INVALID_RESPONSE',
          'Invalid response from OmniFocus: tasks array not found',
          'The script returned an unexpected format',
          timer.toMetadata(),
        );
      }

      // Parse dates in tasks with proper type conversion
      const parsedTasks = result.tasks.map((task): OmniFocusTask => ({
        ...task,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        deferDate: task.deferDate ? new Date(task.deferDate) : undefined,
        completionDate: task.completionDate ? new Date(task.completionDate) : undefined,
        added: task.added ? new Date(task.added) : undefined,
      }));

      // Create standardized response
      const standardResponse = createListResponse(
        'list_tasks',
        parsedTasks,
        {
          ...timer.toMetadata(),
          ...result.metadata,
          filters_applied: filter,
          limit_applied: limit,
        },
      );

      // Cache results (cache the standardized format)
      this.cache.set('tasks', cacheKey, standardResponse);

      return standardResponse;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
