import { z } from 'zod';
import { BaseTool } from '../../base.js';
import { LIST_TASKS_SCRIPT } from '../../../omnifocus/scripts/tasks.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../../utils/response-format.js';
import { ListTasksResponse, OmniFocusTask } from '../../response-types.js';
import { ListTasksScriptResult } from '../../../omnifocus/jxa-types.js';
import { coerceBoolean, coerceNumber } from '../../schemas/coercion-helpers.js';

const BlockedTasksSchema = z.object({
  projectId: z.string()
    .optional()
    .describe('Filter blocked tasks for a specific project'),

  tags: z.array(z.string())
    .optional()
    .describe('Filter blocked tasks by tags (tasks must have ALL specified tags)'),

  includeDetails: coerceBoolean()
    .default(true)
    .describe('Include task details like notes, project info, and tags'),

  showBlockingTasks: coerceBoolean()
    .default(true)
    .describe('Include information about what tasks are blocking each blocked task'),

  limit: coerceNumber()
    .int()
    .positive()
    .max(200)
    .default(50)
    .describe('Maximum number of blocked tasks to return'),
});

export class BlockedTasksTool extends BaseTool<typeof BlockedTasksSchema> {
  name = 'blocked_tasks';
  description = 'Get all tasks that are blocked by other incomplete tasks. Blocked tasks are waiting for prerequisite tasks to be completed in sequential projects or action groups. Useful for identifying workflow bottlenecks.';
  schema = BlockedTasksSchema;

  async executeValidated(args: z.infer<typeof BlockedTasksSchema>): Promise<ListTasksResponse> {
    const timer = new OperationTimer();

    try {
      const { limit = 50, includeDetails = true, showBlockingTasks = true, projectId, tags } = args;

      // Build filter for blocked tasks
      const filter = {
        completed: false, // Only incomplete tasks
        blocked: true, // Only blocked tasks
        projectId,
        tags,
        limit,
        skipAnalysis: false, // Need full analysis for accurate blocking detection
        includeDetails,
      };

      // Create cache key
      const cacheKey = JSON.stringify({ ...filter, tool: 'blocked_tasks', showBlockingTasks });

      // Check cache
      const cached = this.cache.get<ListTasksResponse>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached blocked tasks');
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            from_cache: true,
            ...timer.toMetadata(),
          },
        };
      }

      // Execute script
      const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
      const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponse(
          'blocked_tasks',
          'SCRIPT_ERROR',
          'message' in result ? String(result.message) : 'Failed to get blocked tasks',
          'details' in result ? result.details : undefined,
          timer.toMetadata(),
        );
      }

      if (!result.tasks || !Array.isArray(result.tasks)) {
        return createErrorResponse(
          'blocked_tasks',
          'INVALID_RESPONSE',
          'Invalid response from OmniFocus: tasks array not found',
          'The script returned an unexpected format',
          timer.toMetadata(),
        );
      }

      // Parse dates in tasks
      const parsedTasks = result.tasks.map((task): OmniFocusTask => ({
        ...task,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        deferDate: task.deferDate ? new Date(task.deferDate) : undefined,
        completionDate: task.completionDate ? new Date(task.completionDate) : undefined,
        added: task.added ? new Date(task.added) : undefined,
        recurringStatus: task.recurringStatus ? {
          ...task.recurringStatus,
          type: task.recurringStatus.type as 'non-recurring' | 'new-instance' | 'rescheduled' | 'manual-override' | 'analysis-skipped',
        } : undefined,
      }));

      // Create response with enhanced metadata
      const response = createListResponse(
        'blocked_tasks',
        parsedTasks,
        {
          ...timer.toMetadata(),
          ...result.metadata,
          filters_applied: filter,
          limit_applied: limit,
          tool_type: 'blocked_tasks',
          description: 'Tasks blocked by incomplete prerequisite tasks',
          show_blocking_tasks: showBlockingTasks,
          usage_tip: 'Focus on completing prerequisite tasks to unblock these items',
        },
      );

      // Cache results
      this.cache.set('tasks', cacheKey, response);

      return response;
    } catch (error) {
      return this.handleError(error) as any;
    }
  }
}
