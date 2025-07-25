import { BaseTool } from '../base.js';
import { ANALYZE_RECURRING_TASKS_SCRIPT } from '../../omnifocus/scripts/recurring.js';

export class AnalyzeRecurringTasksTool extends BaseTool {
  name = 'analyze_recurring_tasks';
  description = 'Analyze recurring tasks with frequency, due dates, and patterns';

  inputSchema = {
    type: 'object' as const,
    properties: {
      activeOnly: {
        type: 'boolean',
        description: 'Only include active (non-completed, non-dropped) recurring tasks',
        default: true,
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed recurring tasks (overrides activeOnly for completed)',
        default: false,
      },
      includeDropped: {
        type: 'boolean',
        description: 'Include dropped recurring tasks (overrides activeOnly for dropped)',
        default: false,
      },
      includeHistory: {
        type: 'boolean',
        description: 'Include completion history information',
        default: false,
      },
      sortBy: {
        type: 'string',
        enum: ['name', 'dueDate', 'frequency', 'project'],
        description: 'Sort order for results',
        default: 'dueDate',
      },
    },
  };

  async execute(args: {
    activeOnly?: boolean;
    includeCompleted?: boolean;
    includeDropped?: boolean;
    includeHistory?: boolean;
    sortBy?: string;
  }): Promise<any> {
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
