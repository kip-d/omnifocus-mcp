import { BaseTool } from '../base.js';
import { 
  GET_TASKS_IN_DATE_RANGE_SCRIPT,
  GET_OVERDUE_TASKS_OPTIMIZED_SCRIPT,
  GET_UPCOMING_TASKS_OPTIMIZED_SCRIPT
} from '../../omnifocus/scripts/date-range-queries.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class DateRangeQueryTool extends BaseTool {
  name = 'query_tasks_by_date';
  description = 'Query tasks by date range using optimized whose() filters. Supports due dates, defer dates, and completion dates.';

  inputSchema = {
    type: 'object' as const,
    properties: {
      queryType: {
        type: 'string',
        enum: ['date_range', 'overdue', 'upcoming'],
        description: 'Type of date query to perform',
        default: 'date_range',
      },
      startDate: {
        type: 'string',
        description: 'Start date (ISO format). Required for date_range query when endDate is not provided.',
      },
      endDate: {
        type: 'string',
        description: 'End date (ISO format). Required for date_range query when startDate is not provided.',
      },
      dateField: {
        type: 'string',
        enum: ['dueDate', 'deferDate', 'completionDate'],
        description: 'Which date field to query on (for date_range query)',
        default: 'dueDate',
      },
      includeNullDates: {
        type: 'boolean',
        description: 'Include tasks without the specified date field (for date_range query)',
        default: false,
      },
      days: {
        type: 'number',
        description: 'Number of days to look ahead (for upcoming query)',
        default: 7,
      },
      includeToday: {
        type: 'boolean',
        description: 'Include today in upcoming tasks (for upcoming query)',
        default: true,
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed tasks (for overdue query)',
        default: false,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return',
        default: 100,
      },
    },
  };

  async execute(args: any = {}): Promise<any> {
    const timer = new OperationTimer();

    try {
      const queryType = args.queryType || 'date_range';

      // Validate inputs based on query type
      if (queryType === 'date_range' && !args.startDate && !args.endDate) {
        return createErrorResponse(
          'query_tasks_by_date',
          'INVALID_INPUT',
          'At least one of startDate or endDate must be provided for date_range query',
          {},
          timer.toMetadata(),
        );
      }

      // Validate date formats
      if (args.startDate && !this.isValidDate(args.startDate)) {
        return createErrorResponse(
          'query_tasks_by_date',
          'INVALID_DATE',
          'Invalid startDate format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
          { provided: args.startDate },
          timer.toMetadata(),
        );
      }

      if (args.endDate && !this.isValidDate(args.endDate)) {
        return createErrorResponse(
          'query_tasks_by_date',
          'INVALID_DATE',
          'Invalid endDate format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
          { provided: args.endDate },
          timer.toMetadata(),
        );
      }

      let script: string;
      let scriptParams: any;
      let cacheKey: string;

      switch (queryType) {
        case 'date_range':
          scriptParams = {
            startDate: args.startDate,
            endDate: args.endDate,
            dateField: args.dateField || 'dueDate',
            includeNullDates: args.includeNullDates || false,
            limit: args.limit || 100,
          };
          script = this.omniAutomation.buildScript(GET_TASKS_IN_DATE_RANGE_SCRIPT, { params: scriptParams });
          cacheKey = `date_range_${scriptParams.dateField}_${scriptParams.startDate}_${scriptParams.endDate}_${scriptParams.includeNullDates}_${scriptParams.limit}`;
          break;

        case 'overdue':
          scriptParams = {
            limit: args.limit || 50,
            includeCompleted: args.includeCompleted || false,
          };
          script = this.omniAutomation.buildScript(GET_OVERDUE_TASKS_OPTIMIZED_SCRIPT, scriptParams);
          cacheKey = `overdue_${scriptParams.includeCompleted}_${scriptParams.limit}`;
          break;

        case 'upcoming':
          scriptParams = {
            days: args.days || 7,
            includeToday: args.includeToday !== false,
            limit: args.limit || 100,
          };
          script = this.omniAutomation.buildScript(GET_UPCOMING_TASKS_OPTIMIZED_SCRIPT, scriptParams);
          cacheKey = `upcoming_${scriptParams.days}_${scriptParams.includeToday}_${scriptParams.limit}`;
          break;

        default:
          return createErrorResponse(
            'query_tasks_by_date',
            'INVALID_QUERY_TYPE',
            `Invalid query type: ${queryType}`,
            { validTypes: ['date_range', 'overdue', 'upcoming'] },
            timer.toMetadata(),
          );
      }

      // Check cache
      const cached = this.cache.get<any>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached date range query results');
        return createListResponse(
          'query_tasks_by_date',
          cached.tasks,
          {
            ...timer.toMetadata(),
            from_cache: true,
            query_type: queryType,
            summary: cached.summary,
          },
        );
      }

      // Execute script
      const result = await this.omniAutomation.execute<any>(script);

      if (!result || result.error) {
        return createErrorResponse(
          'query_tasks_by_date',
          'SCRIPT_ERROR',
          result?.message || 'Failed to query tasks by date',
          { details: result?.details },
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

      // Cache results
      const cacheData = {
        tasks: parsedTasks,
        summary: result.summary,
      };
      this.cache.set('tasks', cacheKey, cacheData);

      return createListResponse(
        'query_tasks_by_date',
        parsedTasks,
        {
          ...timer.toMetadata(),
          from_cache: false,
          query_type: queryType,
          summary: result.summary,
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  private isValidDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime());
  }
}

export class OverdueTasksTool extends BaseTool {
  name = 'get_overdue_tasks';
  description = 'Get all overdue tasks using optimized whose() queries. Faster than using list_tasks with date filters.';

  inputSchema = {
    type: 'object' as const,
    properties: {
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed overdue tasks',
        default: false,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return',
        default: 50,
      },
    },
  };

  async execute(args: any = {}): Promise<any> {
    // Delegate to DateRangeQueryTool using shared cache
    const dateRangeTool = new DateRangeQueryTool(this.cache);
    
    return dateRangeTool.execute({
      queryType: 'overdue',
      includeCompleted: args.includeCompleted,
      limit: args.limit,
    });
  }
}

export class UpcomingTasksTool extends BaseTool {
  name = 'get_upcoming_tasks';
  description = 'Get upcoming tasks for the next N days using optimized whose() queries. Faster than using list_tasks with date filters.';

  inputSchema = {
    type: 'object' as const,
    properties: {
      days: {
        type: 'number',
        description: 'Number of days to look ahead',
        default: 7,
      },
      includeToday: {
        type: 'boolean',
        description: 'Include tasks due today',
        default: true,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return',
        default: 100,
      },
    },
  };

  async execute(args: any = {}): Promise<any> {
    // Delegate to DateRangeQueryTool using shared cache
    const dateRangeTool = new DateRangeQueryTool(this.cache);
    
    return dateRangeTool.execute({
      queryType: 'upcoming',
      days: args.days,
      includeToday: args.includeToday,
      limit: args.limit,
    });
  }
}