import { z } from 'zod';
import { BaseTool } from '../base.js';
import { QUERY_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/perspectives.js';
import { createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { StandardResponse } from '../../utils/response-format.js';
import { OmniFocusTask } from '../response-types.js';

// Input schema
const QueryPerspectiveSchema = z.object({
  perspectiveName: z.string()
    .describe('Name of the perspective to query'),
  limit: z.string()
    .optional()
    .default('100')
    .describe('Maximum number of tasks to return'),
  includeDetails: z.string()
    .optional()
    .default('false')
    .describe('Include task details like notes and subtasks'),
});

interface QueryPerspectiveData {
  tasks: OmniFocusTask[];
  perspective: {
    name: string;
    type: 'builtin' | 'custom' | 'unknown';
    filterRules: any;
    filterRulesApplied: boolean;
  };
}

interface QueryPerspectiveResponse extends StandardResponse<QueryPerspectiveData> {
  perspectiveName: string;
  perspectiveType?: 'builtin' | 'custom' | 'unknown';
  filterRules?: any;
  simulatedQuery?: boolean;
}

export class QueryPerspectiveTool extends BaseTool<typeof QueryPerspectiveSchema> {
  name = 'query_perspective';
  description = 'Get tasks that would appear in a specific OmniFocus perspective, allowing LLM to see and analyze what the user sees';
  schema = QueryPerspectiveSchema;

  async executeValidated(args: z.infer<typeof QueryPerspectiveSchema>): Promise<QueryPerspectiveResponse> {
    const timer = new OperationTimer();

    try {
      const { perspectiveName, limit: limitStr, includeDetails: includeDetailsStr } = args;
      const limit = parseInt(limitStr, 10);
      const includeDetails = includeDetailsStr === 'true';

      // Create cache key
      const cacheKey = `perspective:${perspectiveName}:${limit}:${includeDetails}`;

      // Check cache (30 second TTL for perspective queries)
      const cached = this.cache.get<QueryPerspectiveResponse>('tasks', cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached tasks for perspective: ${perspectiveName}`);
        return cached;
      }

      // Build and execute script
      const script = QUERY_PERSPECTIVE_SCRIPT.jxaWrapper(
        this.omniAutomation,
        perspectiveName,
        limit,
      );

      this.logger.debug(`Querying perspective: ${perspectiveName}`);
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        // If perspective not found, try simulation
        if (result.error.includes('not found')) {
          return this.simulatePerspective(perspectiveName, limit, includeDetails, timer);
        }

        const errorResponse = createErrorResponse(
          'query_perspective',
          'SCRIPT_ERROR',
          result.error,
        ) as QueryPerspectiveResponse;
        errorResponse.perspectiveName = perspectiveName;
        return errorResponse;
      }

      // Determine perspective type
      let perspectiveType: 'builtin' | 'custom' | 'unknown' = 'unknown';
      if (['Inbox', 'Projects', 'Tags', 'Forecast', 'Flagged', 'Nearby', 'Review'].includes(perspectiveName)) {
        perspectiveType = 'builtin';
      } else if (result.filterRules) {
        perspectiveType = 'custom';
      }

      // Create response with tasks field instead of items
      const tasks = result.tasks || [];
      const response = {
        success: true,
        data: {
          tasks: tasks,
          perspective: {
            name: perspectiveName,
            type: perspectiveType,
            filterRules: result.filterRules,
            filterRulesApplied: !!result.filterRules,
          },
        },
        metadata: {
          operation: 'query_perspective',
          timestamp: new Date().toISOString(),
          from_cache: false,
          total_count: tasks.length,
          returned_count: tasks.length,
          query_time_ms: timer.toMetadata().query_time_ms || 0,
        },
      } as QueryPerspectiveResponse;

      // Add top-level perspective properties for backward compatibility
      response.perspectiveName = perspectiveName;
      response.perspectiveType = perspectiveType;
      response.filterRules = result.filterRules;
      response.simulatedQuery = false;

      // Cache the result
      this.cache.set('tasks', cacheKey, response); // Uses default TTL

      return response;

    } catch (error) {
      return createErrorResponse(
        'query_perspective',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
      ) as QueryPerspectiveResponse;
    }
  }

  private async simulatePerspective(
    perspectiveName: string,
    limit: number,
    includeDetails: boolean,
    timer: OperationTimer,
  ): Promise<QueryPerspectiveResponse> {
    this.logger.info(`Simulating perspective: ${perspectiveName}`);

    // Map common perspective names to query parameters
    const perspectiveQueries: Record<string, any> = {
      'Flagged': { flagged: true, completed: false },
      'Inbox': { inInbox: true, completed: false },
      'Today': {
        completed: false,
        // Can't easily do OR in our current filter, so just use flagged for now
        flagged: true,
      },
      'Available': { available: true, completed: false },
      'Forecast': {
        // Tasks with due dates
        completed: false,
      },
    };

    const queryParams = perspectiveQueries[perspectiveName];

    if (!queryParams) {
      // Unknown perspective, return empty result
      const response = {
        success: true,
        data: {
          tasks: [],
          perspective: {
            name: perspectiveName,
            type: 'unknown' as const,
            filterRules: null,
            filterRulesApplied: false,
          },
        },
        metadata: {
          operation: 'query_perspective',
          timestamp: new Date().toISOString(),
          from_cache: false,
          total_count: 0,
          returned_count: 0,
          query_time_ms: timer.toMetadata().query_time_ms || 0,
        },
        perspectiveName: perspectiveName,
        perspectiveType: 'unknown' as const,
        simulatedQuery: true,
      } as QueryPerspectiveResponse;

      return response;
    }

    // Use ListTasksTool to simulate
    const { ListTasksTool } = await import('../tasks/ListTasksTool.js');
    const listTasksTool = new ListTasksTool(this.cache);

    const tasksResult = await listTasksTool.executeValidated({
      ...queryParams,
      limit: limit.toString(),
      includeDetails: includeDetails.toString(),
      skipAnalysis: 'true',
    });

    const tasks = tasksResult.data?.items || [];
    const perspectiveType = ['Flagged', 'Inbox', 'Forecast'].includes(perspectiveName) ? 'builtin' : 'custom';

    const response: QueryPerspectiveResponse = {
      success: true,
      data: {
        tasks: tasks,
        perspective: {
          name: perspectiveName,
          type: perspectiveType,
          filterRules: queryParams,
          filterRulesApplied: true,
        },
      },
      metadata: {
        operation: 'query_perspective',
        timestamp: new Date().toISOString(),
        from_cache: false,
        total_count: tasks.length,
        returned_count: tasks.length,
        query_time_ms: timer.toMetadata().query_time_ms || 0,
      },
      perspectiveName: perspectiveName,
      perspectiveType: perspectiveType,
      filterRules: queryParams,
      simulatedQuery: true,
    };

    return response;
  }
}
