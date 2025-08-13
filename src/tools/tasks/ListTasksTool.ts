import { z } from 'zod';
import { BaseTool } from '../base.js';
// REVERTED: Optimization made performance worse, using original script
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks/list-tasks.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListTasksResponse, OmniFocusTask } from '../response-types.js';
import { ListTasksScriptResult } from '../../omnifocus/jxa-types.js';
import { ListTasksSchema } from '../schemas/task-schemas.js';

export class ListTasksTool extends BaseTool<typeof ListTasksSchema> {
  name = 'list_tasks';
  description = 'List tasks from OmniFocus. Performance: Use skipAnalysis=true for 30% faster queries, limit=50 for quick results. Key filters: completed, flagged, projectId, tags, dueBefore/After, search. Returns cached results when available.';
  schema = ListTasksSchema;

  async executeValidated(args: z.infer<typeof ListTasksSchema>): Promise<ListTasksResponse> {
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

      // Execute original JXA script
      const scriptParams = { ...filter, limit, skipAnalysis };
      this.logger.debug('Script params:', scriptParams);
      const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter: scriptParams });
      this.logger.debug('Generated script length:', script.length);
      const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
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
        // Ensure recurringStatus has properly typed 'type' field
        recurringStatus: task.recurringStatus ? {
          ...task.recurringStatus,
          type: task.recurringStatus.type as 'non-recurring' | 'new-instance' | 'rescheduled' | 'manual-override' | 'analysis-skipped',
        } : undefined,
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
      return this.handleError(error) as any;
    }
  }
}
