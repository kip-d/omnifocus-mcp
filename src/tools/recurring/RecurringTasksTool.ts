import { z } from 'zod';
import { BaseTool } from '../base.js';
import { AnalyzeRecurringTasksTool } from './AnalyzeRecurringTasksTool.js';
import { GetRecurringPatternsTool } from './GetRecurringPatternsTool.js';
import { createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';

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
export class RecurringTasksTool extends BaseTool<typeof RecurringTasksSchema> {
  name = 'recurring_tasks';
  description = 'Analyze recurring tasks and patterns. Use operation="analyze" for detailed task-by-task analysis with next due dates, or operation="patterns" for frequency statistics and common recurrence patterns.';
  schema = RecurringTasksSchema;

  private analyzeTool: AnalyzeRecurringTasksTool;
  private patternsTool: GetRecurringPatternsTool;

  constructor(cache: any) {
    super(cache);
    // Initialize the individual tools
    this.analyzeTool = new AnalyzeRecurringTasksTool(cache);
    this.patternsTool = new GetRecurringPatternsTool(cache);
  }

  async executeValidated(args: RecurringTasksInput): Promise<any> {
    const timer = new OperationTimer();
    const { operation, ...params } = args;

    try {
      switch (operation) {
        case 'analyze':
          // Detailed recurring task analysis
          return await this.analyzeTool.execute({
            activeOnly: params.activeOnly,
            includeCompleted: params.includeCompleted,
            includeDropped: params.includeDropped,
            includeHistory: params.includeHistory,
            sortBy: params.sortBy,
          });

        case 'patterns':
          // Frequency pattern analysis
          return await this.patternsTool.execute({
            activeOnly: params.activeOnly,
            includeCompleted: params.includeCompleted,
            includeDropped: params.includeDropped,
          });

        default:
          return createErrorResponse(
            'recurring_tasks',
            'INVALID_OPERATION',
            `Invalid operation: ${operation}`,
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }
}
