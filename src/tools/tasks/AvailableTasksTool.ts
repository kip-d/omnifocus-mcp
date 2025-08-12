import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListTasksResponse, OmniFocusTask } from '../response-types.js';
import { ListTasksScriptResult } from '../../omnifocus/jxa-types.js';
import { coerceBoolean, coerceNumber } from '../schemas/coercion-helpers.js';

const AvailableTasksSchema = z.object({
  projectId: z.string()
    .optional()
    .describe('Filter available tasks for a specific project'),

  tags: z.array(z.string())
    .optional()
    .describe('Filter available tasks by tags (tasks must have ALL specified tags)'),

  includeDetails: coerceBoolean()
    .default(true)
    .describe('Include task details like notes, project info, and tags'),

  includeFlagged: coerceBoolean()
    .default(true)
    .describe('Include flagged tasks in the results'),

  sortBy: z.enum(['dueDate', 'project', 'flagged', 'name'])
    .optional()
    .default('dueDate')
    .describe('Sort results by field'),

  limit: coerceNumber()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe('Maximum number of available tasks to return'),
});

export class AvailableTasksTool extends BaseTool<typeof AvailableTasksSchema> {
  name = 'available_tasks';
  description = 'Get all tasks that are currently available to work on. Available tasks are not completed, not blocked, not deferred (or defer date has passed), and in active projects. This is broader than next actions and includes all workable tasks.';
  schema = AvailableTasksSchema;

  async executeValidated(args: z.infer<typeof AvailableTasksSchema>): Promise<ListTasksResponse> {
    const timer = new OperationTimer();

    try {
      const { limit = 100, includeDetails = true, includeFlagged = true, sortBy = 'dueDate', projectId, tags } = args;

      // Build filter for available tasks
      const filter = {
        completed: false, // Only incomplete tasks
        available: true, // Only available tasks (not deferred, project active, not blocked)
        projectId,
        tags,
        limit,
        skipAnalysis: false, // Need full analysis for accurate availability detection
        includeDetails,
        sortBy,
      };

      // Create cache key
      const cacheKey = JSON.stringify({ ...filter, tool: 'available_tasks', includeFlagged });

      // Check cache
      const cached = this.cache.get<ListTasksResponse>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached available tasks');
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
          'available_tasks',
          'SCRIPT_ERROR',
          'message' in result ? String(result.message) : 'Failed to get available tasks',
          'details' in result ? result.details : undefined,
          timer.toMetadata(),
        );
      }

      if (!result.tasks || !Array.isArray(result.tasks)) {
        return createErrorResponse(
          'available_tasks',
          'INVALID_RESPONSE',
          'Invalid response from OmniFocus: tasks array not found',
          'The script returned an unexpected format',
          timer.toMetadata(),
        );
      }

      // Parse dates in tasks
      let parsedTasks = result.tasks.map((task): OmniFocusTask => ({
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

      // Filter flagged tasks if requested
      if (!includeFlagged) {
        parsedTasks = parsedTasks.filter(task => !task.flagged);
      }

      // Create response with enhanced metadata
      const response = createListResponse(
        'available_tasks',
        parsedTasks,
        {
          ...timer.toMetadata(),
          ...result.metadata,
          filters_applied: filter,
          limit_applied: limit,
          tool_type: 'available_tasks',
          description: 'All tasks currently available to work on',
          includes_flagged: includeFlagged,
          sorted_by: sortBy,
          usage_tip: 'These tasks can all be worked on immediately without waiting for other tasks',
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
