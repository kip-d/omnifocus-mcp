import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ANALYZE_RECURRING_TASKS_SCRIPT, GET_RECURRING_PATTERNS_SCRIPT } from '../../omnifocus/scripts/recurring.js';
import { createErrorResponseV2, createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { RecurringTasksResponseV2, RecurringTasksDataV2, RecurringTaskV2 } from '../response-types-v2.js';

// Consolidated recurring tasks schema
const RecurringTasksSchema = z.object({
  operation: z.enum(['analyze', 'patterns'])
    .describe('Operation to perform: analyze (detailed task analysis) or patterns (frequency statistics)'),

  // Common parameters
  activeOnly: coerceBoolean()
    .default(true)
    .describe('Only include active (non-completed, non-dropped) recurring tasks'),

  includeCompleted: coerceBoolean()
    .default(false)
    .describe('Include completed recurring tasks'),

  includeDropped: coerceBoolean()
    .default(false)
    .describe('Include dropped recurring tasks'),

  // Analyze-specific parameters
  includeHistory: coerceBoolean()
    .optional()
    .describe('Include completion history information (analyze operation)'),

  sortBy: z.enum(['nextDue', 'frequency', 'name'])
    .optional()
    .describe('Sort order for results (analyze operation)'),
});

type RecurringTasksInput = z.infer<typeof RecurringTasksSchema>;

/**
 * Consolidated tool for recurring task analysis
 * Combines detailed analysis and pattern recognition into a single tool
 */
export class RecurringTasksTool extends BaseTool<typeof RecurringTasksSchema, RecurringTasksResponseV2> {
  name = 'recurring_tasks';
  description = 'Analyze recurring tasks and patterns. Use operation="analyze" for detailed task-by-task analysis with next due dates, or operation="patterns" for frequency statistics and common recurrence patterns.';
  schema = RecurringTasksSchema;

  constructor(cache: CacheManager) {
    super(cache);
  }

  async executeValidated(args: RecurringTasksInput): Promise<RecurringTasksResponseV2> {
    const timer = new OperationTimerV2();
    const { operation, ...params } = args;

    try {
      switch (operation) {
        case 'analyze': {
          // Direct implementation of recurring task analysis
          const analyzeOptions = {
            activeOnly: params.activeOnly ?? true,
            includeCompleted: params.includeCompleted ?? false,
            includeDropped: params.includeDropped ?? false,
            includeHistory: params.includeHistory ?? false,
            sortBy: params.sortBy || 'dueDate',
          };

          // Try to use cache for recurring task analysis
          const analyzeCacheKey = `recurring_${JSON.stringify(analyzeOptions)}`;
          const cachedAnalysis = this.cache.get('analytics', analyzeCacheKey);
          if (cachedAnalysis) {
            return cachedAnalysis as RecurringTasksResponseV2;
          }

          // Execute analysis script
          const analyzeScript = this.omniAutomation.buildScript(ANALYZE_RECURRING_TASKS_SCRIPT, {
            options: analyzeOptions,
          });
          const analyzeResult = await this.omniAutomation.execute(analyzeScript) as {
            tasks: unknown[];
            summary: Record<string, unknown>;
            error?: boolean;
            message?: string;
          };

          if (analyzeResult.error) {
            return createErrorResponseV2(
              'recurring_tasks',
              'SCRIPT_ERROR',
              analyzeResult.message || 'Analysis failed',
              undefined,
              {},
              timer.toMetadata(),
            );
          }

          // Add metadata
          const analyzeResponse = createSuccessResponseV2(
            'recurring_tasks',
            {
              recurringTasks: analyzeResult.tasks as RecurringTaskV2[],
              summary: analyzeResult.summary as { totalRecurring: number; byFrequency?: Record<string, number> },
            },
            undefined,
            {
              ...timer.toMetadata(),
              operation: 'analyze',
              filters_applied: analyzeOptions,
              total_analyzed: analyzeResult.tasks?.length || 0,
            },
          );

          // Cache for 1 hour (recurring tasks change infrequently)
          this.cache.set('analytics', analyzeCacheKey, analyzeResponse);

          return analyzeResponse;
        }

        case 'patterns': {
          // Direct implementation of recurring pattern analysis
          const patternsOptions = {
            activeOnly: params.activeOnly ?? true,
            includeCompleted: params.includeCompleted ?? false,
            includeDropped: params.includeDropped ?? false,
          };

          // Try to use cache
          const patternsCacheKey = `recurring_patterns_${JSON.stringify(patternsOptions)}`;
          const cachedPatterns = this.cache.get('analytics', patternsCacheKey);
          if (cachedPatterns) {
            return cachedPatterns as RecurringTasksResponseV2;
          }

          // Execute pattern analysis script
          const patternsScript = this.omniAutomation.buildScript(GET_RECURRING_PATTERNS_SCRIPT, { options: patternsOptions });
          const patternsResult = await this.omniAutomation.execute(patternsScript) as {
            totalRecurring: number;
            patterns: unknown[];
            byProject: unknown[];
            mostCommon: Record<string, unknown>;
            error?: boolean;
            message?: string;
          };

          if (patternsResult.error) {
            return createErrorResponseV2(
              'recurring_tasks',
              'SCRIPT_ERROR',
              patternsResult.message || 'Pattern analysis failed',
              undefined,
              {},
              timer.toMetadata(),
            );
          }

          // Add insights
          const insights: string[] = [];

          if (patternsResult.totalRecurring === 0) {
            insights.push('No recurring tasks found in your OmniFocus database');
          } else {
            if (patternsResult.mostCommon) {
              insights.push(`Most common recurrence pattern: ${(patternsResult.mostCommon as { pattern?: string }).pattern} (${(patternsResult.mostCommon as { count?: number }).count} tasks)`);
            }

            if (patternsResult.patterns && patternsResult.patterns.length > 0) {
              insights.push(`Found ${patternsResult.patterns.length} different recurrence patterns`);

              // Add specific pattern insights
              const weeklyCount = patternsResult.patterns.filter((p: unknown) => (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('week')).length;
              const dailyCount = patternsResult.patterns.filter((p: unknown) => (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('day')).length;
              const monthlyCount = patternsResult.patterns.filter((p: unknown) => (p as { pattern?: string }).pattern && (p as { pattern?: string }).pattern?.includes('month')).length;

              if (weeklyCount > 0) insights.push(`${weeklyCount} weekly patterns found`);
              if (dailyCount > 0) insights.push(`${dailyCount} daily patterns found`);
              if (monthlyCount > 0) insights.push(`${monthlyCount} monthly patterns found`);
            }

            if (patternsResult.byProject && patternsResult.byProject.length > 0) {
              const projectWithMostRecurring = patternsResult.byProject[0];
              insights.push(`Project "${(projectWithMostRecurring as { project?: string }).project}" has the most recurring tasks (${(projectWithMostRecurring as { count?: number }).count})`);
            }
          }

          const patternsResponse = createSuccessResponseV2(
            'recurring_tasks',
            {
              recurringTasks: [] as RecurringTaskV2[],
              summary: {
                totalRecurring: patternsResult.totalRecurring,
                byFrequency: {} as Record<string, number>,
              },
              patterns: {} as Record<string, RecurringTaskV2[]>,
              byProject: patternsResult.byProject || [],
              mostCommon: patternsResult.mostCommon,
              insights,
            },
            undefined,
            {
              ...timer.toMetadata(),
              operation: 'patterns',
              filters_applied: patternsOptions,
              patterns_found: patternsResult.patterns?.length || 0,
            },
          );

          // Cache for 1 hour
          this.cache.set('analytics', patternsCacheKey, patternsResponse);

          return patternsResponse;
        }

        default:
          return createErrorResponseV2(
            'recurring_tasks',
            'INVALID_OPERATION',
            `Invalid operation: ${String(operation)}`,
            undefined,
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleErrorV2<RecurringTasksDataV2>(error);
    }
  }
}
