import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListTasksResponse, OmniFocusTask } from '../response-types.js';
import { ListTasksScriptResult } from '../../omnifocus/jxa-types.js';
import { coerceBoolean, coerceNumber } from '../schemas/coercion-helpers.js';

const NextActionsSchema = z.object({
  projectId: z.string()
    .optional()
    .describe('Filter next actions for a specific project'),

  tags: z.array(z.string())
    .optional()
    .describe('Filter next actions by tags (tasks must have ALL specified tags)'),

  includeDetails: coerceBoolean()
    .default(true)
    .describe('Include task details like notes, project info, and tags'),

  limit: coerceNumber()
    .int()
    .positive()
    .max(200)
    .default(50)
    .describe('Maximum number of next actions to return'),
});

export class NextActionsTool extends BaseTool<typeof NextActionsSchema> {
  name = 'next_actions';
  description = 'Get all available next actions across projects. Next actions are tasks that are not blocked by other incomplete tasks and are ready to be worked on. Perfect for GTD (Getting Things Done) workflows.';
  schema = NextActionsSchema;

  async executeValidated(args: z.infer<typeof NextActionsSchema>): Promise<ListTasksResponse> {
    const timer = new OperationTimer();

    try {
      const { limit = 50, includeDetails = true, projectId, tags } = args;

      // Build filter for next actions
      const filter = {
        completed: false, // Only incomplete tasks
        next: true, // Only next actions
        available: true, // Must be available (not deferred)
        projectId,
        tags,
        limit,
        skipAnalysis: false, // Need full analysis for accurate next action detection
        includeDetails,
      };

      // Create cache key
      const cacheKey = JSON.stringify({ ...filter, tool: 'next_actions' });

      // Check cache
      const cached = this.cache.get<ListTasksResponse>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached next actions');
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
          'next_actions',
          'SCRIPT_ERROR',
          'message' in result ? String(result.message) : 'Failed to get next actions',
          'details' in result ? result.details : undefined,
          timer.toMetadata(),
        );
      }

      if (!result.tasks || !Array.isArray(result.tasks)) {
        return createErrorResponse(
          'next_actions',
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
        'next_actions',
        parsedTasks,
        {
          ...timer.toMetadata(),
          ...result.metadata,
          filters_applied: filter,
          limit_applied: limit,
          tool_type: 'next_actions',
          description: 'Available next actions across all projects',
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
