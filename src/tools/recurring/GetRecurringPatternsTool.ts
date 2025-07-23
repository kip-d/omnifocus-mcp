import { BaseTool } from '../base.js';
import { GET_RECURRING_PATTERNS_SCRIPT } from '../../omnifocus/scripts/recurring.js';

export class GetRecurringPatternsTool extends BaseTool {
  name = 'get_recurring_patterns';
  description = 'Get patterns and statistics about recurring task frequencies';

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
    },
  };

  async execute(args: {
    activeOnly?: boolean;
    includeCompleted?: boolean;
    includeDropped?: boolean;
  }): Promise<any> {
    try {
      const options = {
        activeOnly: args.activeOnly ?? true,
        includeCompleted: args.includeCompleted ?? false,
        includeDropped: args.includeDropped ?? false,
      };

      // Try to use cache
      const cacheKey = `recurring_patterns_${JSON.stringify(options)}`;
      const cached = this.cache.get('analytics', cacheKey);
      if (cached) {
        return cached;
      }

      // Execute pattern analysis script
      const script = this.omniAutomation.buildScript(GET_RECURRING_PATTERNS_SCRIPT, { options });
      const result = await this.omniAutomation.execute<{
        totalRecurring: number;
        patterns: any[];
        byProject: any[];
        mostCommon: any;
        error?: boolean;
        message?: string;
      }>(script);

      if (result.error) {
        return {
          error: true,
          message: result.message,
        };
      }

      // Add insights
      const insights: string[] = [];

      if (result.totalRecurring === 0) {
        insights.push('No recurring tasks found in your OmniFocus database');
      } else {
        if (result.mostCommon) {
          const freq = result.mostCommon.unit === 'days' && result.mostCommon.steps === 1 ? 'Daily' :
                      result.mostCommon.unit === 'weeks' && result.mostCommon.steps === 1 ? 'Weekly' :
                      result.mostCommon.unit === 'months' && result.mostCommon.steps === 1 ? 'Monthly' :
                      `Every ${result.mostCommon.steps} ${result.mostCommon.unit}`;
          insights.push(`Most common frequency: ${freq} (${result.mostCommon.count} tasks, ${result.mostCommon.percentage}%)`);
        }

        // Check for daily tasks
        const dailyPattern = result.patterns.find(p => p.unit === 'days' && p.steps === 1);
        if (dailyPattern) {
          insights.push(`You have ${dailyPattern.count} daily recurring tasks`);
        }

        // Check for weekly tasks
        const weeklyPattern = result.patterns.find(p => p.unit === 'weeks' && p.steps === 1);
        if (weeklyPattern) {
          insights.push(`You have ${weeklyPattern.count} weekly recurring tasks`);
        }

        // Projects with most recurring tasks
        if (result.byProject.length > 0) {
          insights.push(`Project with most recurring tasks: ${result.byProject[0].project} (${result.byProject[0].recurringCount} tasks)`);
        }
      }

      // Build response
      const response = {
        totalRecurring: result.totalRecurring,
        patterns: result.patterns,
        byProject: result.byProject,
        insights,
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
