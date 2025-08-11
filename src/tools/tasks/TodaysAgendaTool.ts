import { z } from 'zod';
import { BaseTool } from '../base.js';
import { TODAYS_AGENDA_OPTIMIZED_SCRIPT } from '../../omnifocus/scripts/tasks/todays-agenda-optimized.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { TodaysAgendaSchema } from '../schemas/task-schemas.js';

export class TodaysAgendaTool extends BaseTool<typeof TodaysAgendaSchema> {
  name = 'todays_agenda';
  description = 'Get today\'s agenda with tasks due today, overdue, and optionally flagged. Default limit=50 for performance. Set includeDetails=false (default) for faster response. Options: includeFlagged=true, includeOverdue=true, includeAvailable=true control what\'s included.';
  schema = TodaysAgendaSchema;

  async executeValidated(args: z.infer<typeof TodaysAgendaSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      // Log incoming args for debugging
      this.logger.debug('TodaysAgendaTool.execute called with args:', args);

      // Ensure args is an object
      const safeArgs = args || {};

      const {
        includeFlagged = true,
        includeOverdue = true,
        includeAvailable = true,
        includeDetails = false,  // Default to false for better performance
        limit = 50,  // Reduced default limit to prevent timeouts
      } = safeArgs;

      this.logger.debug('Using parameters:', { includeFlagged, includeOverdue, includeAvailable, includeDetails, limit });

      // Create cache key
      const cacheKey = `agenda_${includeFlagged}_${includeOverdue}_${includeAvailable}_${includeDetails}_${limit}`;

      // Check cache
      const cached = this.cache.get<any>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached agenda');
        return createListResponse(
          'todays_agenda',
          cached.tasks,
          {
            ...timer.toMetadata(),
            from_cache: true,
            date: cached.date,
            summary: cached.summary,
            filters_applied: {
              include_flagged: includeFlagged,
              include_overdue: includeOverdue,
              include_available: includeAvailable,
              include_details: includeDetails,
              limit: limit,
            },
          },
        );
      }

      // Execute script
      const script = this.omniAutomation.buildScript(TODAYS_AGENDA_OPTIMIZED_SCRIPT, {
        options: { includeFlagged, includeOverdue, includeAvailable, includeDetails, limit },
      });
      const result = await this.omniAutomation.execute<any>(script);

      // Check for null result or error
      if (!result) {
        return createErrorResponse(
          'todays_agenda',
          'SCRIPT_ERROR',
          'Script returned null result',
          { details: 'The script execution did not return any data' },
          timer.toMetadata(),
        );
      }

      if (result.error) {
        return createErrorResponse(
          'todays_agenda',
          'SCRIPT_ERROR',
          result.message || 'Failed to get today\'s agenda',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Ensure tasks array exists
      if (!result.tasks || !Array.isArray(result.tasks)) {
        return createErrorResponse(
          'todays_agenda',
          'INVALID_RESPONSE',
          'Invalid response from OmniFocus: tasks array not found',
          { received: result },
          timer.toMetadata(),
        );
      }

      // Parse dates in tasks
      const parsedTasks = result.tasks.map((task: any) => ({
        ...task,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        deferDate: task.deferDate ? new Date(task.deferDate) : undefined,
        completionDate: task.completionDate ? new Date(task.completionDate) : undefined,
      }));

      const cacheData = {
        date: new Date().toISOString().split('T')[0],
        tasks: parsedTasks,
        summary: result.summary,
      };

      // Cache for shorter time (5 minutes for agenda)
      this.cache.set('tasks', cacheKey, cacheData);

      return createListResponse(
        'todays_agenda',
        parsedTasks,
        {
          ...timer.toMetadata(),
          from_cache: false,
          date: cacheData.date,
          summary: result.summary,
          filters_applied: {
            include_flagged: includeFlagged,
            include_overdue: includeOverdue,
            include_available: includeAvailable,
            include_details: includeDetails,
            limit: limit,
          },
          query_time_ms: result.summary?.query_time_ms || timer.getElapsedMs(),
          performance_metrics: result.performance_metrics,
        },
      );
    } catch (error) {
      return this.handleError(error) as any;
    }
  }
}
