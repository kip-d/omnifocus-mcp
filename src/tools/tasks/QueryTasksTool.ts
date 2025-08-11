import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks.js';
// Import hybrid scripts directly - they provide better performance
import {
  GET_OVERDUE_TASKS_HYBRID_SCRIPT,
  GET_UPCOMING_TASKS_HYBRID_SCRIPT
} from '../../omnifocus/scripts/date-range-queries-hybrid.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListTasksResponse, OmniFocusTask } from '../response-types.js';
import { ListTasksScriptResult } from '../../omnifocus/jxa-types.js';
import { QueryTasksToolSchema } from '../schemas/task-schemas.js';

export class QueryTasksTool extends BaseTool<typeof QueryTasksToolSchema> {
  name = 'query_tasks';
  description = 'Unified task query tool. Use queryType to specify: list (general filtering), search (text search), next_actions (GTD next actions), blocked (tasks waiting on others), available (all workable tasks), overdue (past due), upcoming (next N days). Consolidates 7 separate task query tools for better LLM usage.';
  schema = QueryTasksToolSchema;

  async executeValidated(args: z.infer<typeof QueryTasksToolSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { queryType, searchTerm } = args;

      // Validate query type specific requirements
      if (queryType === 'search' && !searchTerm) {
        return createErrorResponse(
          'query_tasks',
          'MISSING_PARAMETER',
          'searchTerm is required for search query type',
          { queryType, providedParams: Object.keys(args) },
          timer.toMetadata(),
        );
      }

      // Handle different query types
      switch (queryType) {
        case 'overdue':
          return this.handleOverdueTasks(args, timer);
          
        case 'upcoming':
          return this.handleUpcomingTasks(args, timer);
          
        case 'list':
        case 'search':
        case 'next_actions':
        case 'blocked':
        case 'available':
          return this.handleListBasedQuery(queryType, args, timer);
          
        default:
          return createErrorResponse(
            'query_tasks',
            'INVALID_QUERY_TYPE',
            `Invalid query type: ${queryType}`,
            { 
              validTypes: ['list', 'search', 'next_actions', 'blocked', 'available', 'overdue', 'upcoming'],
              provided: queryType 
            },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error) as any;
    }
  }


  private async handleOverdueTasks(args: z.infer<typeof QueryTasksToolSchema>, timer: OperationTimer): Promise<any> {
    const { limit = 50, includeCompleted = false } = args;
    
    const scriptParams = {
      limit,
      includeCompleted,
    };
    
    const cacheKey = `query_tasks_overdue_${scriptParams.includeCompleted}_${scriptParams.limit}`;
    
    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      this.logger.debug('Returning cached overdue tasks');
      return createListResponse(
        'query_tasks',
        cached.tasks,
        {
          ...timer.toMetadata(),
          from_cache: true,
          query_type: 'overdue',
          summary: cached.summary,
        },
      );
    }

    // Use hybrid script for better performance
    const script = this.omniAutomation.buildScript(GET_OVERDUE_TASKS_HYBRID_SCRIPT, scriptParams);
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponse(
        'query_tasks',
        'SCRIPT_ERROR',
        result?.message || 'Failed to query overdue tasks',
        { details: result?.details },
        timer.toMetadata(),
      );
    }

    // Parse dates in tasks
    const parsedTasks = result.tasks.map((task: any) => this.parseTaskDates(task));

    // Cache results
    const cacheData = {
      tasks: parsedTasks,
      summary: result.summary,
    };
    this.cache.set('tasks', cacheKey, cacheData);

    return createListResponse(
      'query_tasks',
      parsedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        query_type: 'overdue',
        summary: result.summary,
        description: 'Tasks past their due date'
      },
    );
  }

  private async handleUpcomingTasks(args: z.infer<typeof QueryTasksToolSchema>, timer: OperationTimer): Promise<any> {
    const { daysAhead = 7, includeToday = true, limit = 50 } = args;
    
    const scriptParams = {
      days: daysAhead,
      includeToday,
      limit,
    };
    
    const cacheKey = `query_tasks_upcoming_${scriptParams.days}_${scriptParams.includeToday}_${scriptParams.limit}`;
    
    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      this.logger.debug('Returning cached upcoming tasks');
      return createListResponse(
        'query_tasks',
        cached.tasks,
        {
          ...timer.toMetadata(),
          from_cache: true,
          query_type: 'upcoming',
          summary: cached.summary,
        },
      );
    }

    // Use hybrid script for better performance
    const script = this.omniAutomation.buildScript(GET_UPCOMING_TASKS_HYBRID_SCRIPT, scriptParams);
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponse(
        'query_tasks',
        'SCRIPT_ERROR',
        result?.message || 'Failed to query upcoming tasks',
        { details: result?.details },
        timer.toMetadata(),
      );
    }

    // Parse dates in tasks
    const parsedTasks = result.tasks.map((task: any) => this.parseTaskDates(task));

    // Cache results
    const cacheData = {
      tasks: parsedTasks,
      summary: result.summary,
    };
    this.cache.set('tasks', cacheKey, cacheData);

    return createListResponse(
      'query_tasks',
      parsedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        query_type: 'upcoming',
        summary: result.summary,
        description: `Tasks due in next ${daysAhead} days`
      },
    );
  }

  private async handleListBasedQuery(
    queryType: 'list' | 'search' | 'next_actions' | 'blocked' | 'available',
    args: z.infer<typeof QueryTasksToolSchema>, 
    timer: OperationTimer
  ): Promise<ListTasksResponse> {
    const {
      searchTerm,
      completed,
      flagged,
      projectId,
      tags,
      dueBefore,
      dueAfter,
      deferBefore,
      deferAfter,
      available,
      inInbox,
      includeDetails = true,
      sortBy,
      sortOrder = 'asc',
      limit = 100,
      skipAnalysis = false,
      // Query-type specific params
      showBlockingTasks = true,
      includeFlagged = true
    } = args;

    // Build filter based on query type
    let filter: any = {
      completed,
      flagged,
      projectId,
      tags,
      dueBefore,
      dueAfter,
      deferBefore,
      deferAfter,
      available,
      inInbox,
      limit,
      skipAnalysis,
      includeDetails,
      sortBy,
      sortOrder
    };

    // Apply query-type specific logic
    switch (queryType) {
      case 'search':
        filter.search = searchTerm;
        break;
        
      case 'next_actions':
        filter.completed = false;
        filter.next = true;
        filter.available = true;
        filter.skipAnalysis = false; // Need full analysis for accurate next action detection
        break;
        
      case 'blocked':
        filter.completed = false;
        filter.blocked = true;
        filter.skipAnalysis = false; // Need full analysis for accurate blocking detection
        break;
        
      case 'available':
        filter.completed = false;
        filter.available = true;
        filter.skipAnalysis = false; // Need full analysis for accurate availability detection
        break;
        
      case 'list':
        // Use filters as provided
        break;
    }

    // Clean up undefined values
    filter = Object.fromEntries(
      Object.entries(filter).filter(([_, value]) => value !== undefined)
    );

    // Create cache key
    const cacheKey = JSON.stringify({ ...filter, tool: `query_tasks_${queryType}`, showBlockingTasks, includeFlagged });

    // Check cache only if not skipping analysis (for consistent results)
    if (!skipAnalysis) {
      const cached = this.cache.get<ListTasksResponse>('tasks', cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached ${queryType} tasks`);
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            from_cache: true,
            query_type: queryType,
            ...timer.toMetadata(),
          },
        };
      }
    }

    // Execute script
    const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
    const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

    if (result && typeof result === 'object' && 'error' in result && result.error) {
      return createErrorResponse(
        'query_tasks',
        'SCRIPT_ERROR',
        'message' in result ? String(result.message) : `Failed to query ${queryType} tasks`,
        'details' in result ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    if (!result.tasks || !Array.isArray(result.tasks)) {
      return createErrorResponse(
        'query_tasks',
        'INVALID_RESPONSE',
        'Invalid response from OmniFocus: tasks array not found',
        'The script returned an unexpected format',
        timer.toMetadata(),
      );
    }

    // Parse dates in tasks
    let parsedTasks = result.tasks.map((task): OmniFocusTask => this.parseTaskDates(task));

    // Apply post-processing filters for available tasks
    if (queryType === 'available' && !includeFlagged) {
      parsedTasks = parsedTasks.filter(task => !task.flagged);
    }

    // Create response with enhanced metadata
    const response = createListResponse(
      'query_tasks',
      parsedTasks,
      {
        ...timer.toMetadata(),
        ...result.metadata,
        filters_applied: filter,
        limit_applied: limit,
        query_type: queryType,
        description: this.getQueryDescription(queryType, args),
        ...(queryType === 'blocked' && { show_blocking_tasks: showBlockingTasks }),
        ...(queryType === 'available' && { includes_flagged: includeFlagged }),
      },
    );

    // Cache results
    this.cache.set('tasks', cacheKey, response);
    return response;
  }

  private parseTaskDates(task: any): OmniFocusTask {
    return {
      ...task,
      dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      deferDate: task.deferDate ? new Date(task.deferDate) : undefined,
      completionDate: task.completionDate ? new Date(task.completionDate) : undefined,
      added: task.added ? new Date(task.added) : undefined,
      recurringStatus: task.recurringStatus ? {
        ...task.recurringStatus,
        type: task.recurringStatus.type as 'non-recurring' | 'new-instance' | 'rescheduled' | 'manual-override' | 'analysis-skipped'
      } : undefined,
    };
  }

  private getQueryDescription(queryType: string, args: z.infer<typeof QueryTasksToolSchema>): string {
    switch (queryType) {
      case 'list':
        return 'General task list with applied filters';
      case 'search':
        return `Tasks matching search term: "${args.searchTerm}"`;
      case 'next_actions':
        return 'Available next actions across all projects';
      case 'blocked':
        return 'Tasks blocked by incomplete prerequisite tasks';
      case 'available':
        return 'All tasks currently available to work on';
      case 'overdue':
        return 'Tasks past their due date';
      case 'upcoming':
        return `Tasks due in next ${args.daysAhead || 7} days`;
      default:
        return 'Task query results';
    }
  }
}