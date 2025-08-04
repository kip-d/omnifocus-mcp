import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ANALYZE_RECURRING_TASKS_SCRIPT } from '../../omnifocus/scripts/recurring.js';
import { AnalyzeRecurringTasksSchema } from '../schemas/system-schemas.js';

export class AnalyzeRecurringTasksTool extends BaseTool<typeof AnalyzeRecurringTasksSchema> {
  name = 'analyze_recurring_tasks';
  description = 'Analyze recurring tasks for patterns. Default activeOnly=true (exclude completed/dropped). Override with includeCompleted or includeDropped. Set includeHistory=true for completion patterns. Sort by: nextDue|frequency|name.';
  schema = AnalyzeRecurringTasksSchema;

  async executeValidated(args: z.infer<typeof AnalyzeRecurringTasksSchema>): Promise<any> {
    try {
      const options = {
        activeOnly: args.activeOnly ?? true,
        includeCompleted: args.includeCompleted ?? false,
        includeDropped: args.includeDropped ?? false,
        includeHistory: args.includeHistory ?? false,
        sortBy: args.sortBy || 'dueDate',
      };

      // Try to use cache for recurring task analysis
      const cacheKey = `recurring_${JSON.stringify(options)}`;
      const cached = this.cache.get('analytics', cacheKey);
      if (cached) {
        return cached;
      }

      // Execute analysis script
      const script = this.omniAutomation.buildScript(ANALYZE_RECURRING_TASKS_SCRIPT, {
        options,
      });
      const result = await this.omniAutomation.execute<{
        tasks: any[];
        summary: any;
        error?: boolean;
        message?: string;
      }>(script);

      if (result.error) {
        return {
          error: true,
          message: result.message,
        };
      }

      // Add metadata
      const response = {
        tasks: result.tasks,
        summary: result.summary,
        metadata: {
          timestamp: new Date().toISOString(),
          options,
        },
      };

      // Cache the result
      this.cache.set('analytics', cacheKey, response);

      return response;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
