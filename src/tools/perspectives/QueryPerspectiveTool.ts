import { z } from 'zod';
import { BaseTool } from '../base.js';
import { QUERY_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/perspectives/query-perspective.js';
import { createSuccessResponse, createErrorResponse, OperationTimer, StandardResponse } from '../../utils/response-format.js';
import { coerceBoolean, coerceNumber } from '../schemas/coercion-helpers.js';

const QueryPerspectiveSchema = z.object({
  perspectiveName: z.string()
    .describe('Name of the perspective to query'),
  
  limit: coerceNumber()
    .default(50)
    .describe('Maximum number of tasks to return'),
  
  includeDetails: coerceBoolean()
    .default(false)
    .describe('Include task details like notes and subtasks'),
});

interface PerspectiveTask {
  id: string;
  name: string;
  flagged: boolean;
  dueDate: string | null;
  deferDate: string | null;
  completed: boolean;
  project: string | null;
  available: boolean;
  tags: string[];
}

interface QueryPerspectiveData {
  perspectiveName: string;
  perspectiveType: 'builtin' | 'custom';
  tasks: PerspectiveTask[];
  filterRules: any;
  aggregation: string;
}

export class QueryPerspectiveTool extends BaseTool<typeof QueryPerspectiveSchema> {
  name = 'query_perspective';
  description = 'Get tasks that would appear in a specific OmniFocus perspective, allowing LLM to see and analyze what the user sees';
  schema = QueryPerspectiveSchema;

  async executeValidated(args: z.infer<typeof QueryPerspectiveSchema>): Promise<StandardResponse<QueryPerspectiveData>> {
    const timer = new OperationTimer();

    try {
      const { perspectiveName, limit, includeDetails } = args;

      // Create cache key  
      const cacheKey = `perspective:${perspectiveName}:${limit}:${includeDetails}`;

      // Check cache (30 second TTL for perspective queries)
      const cached = this.cache.get<StandardResponse<QueryPerspectiveData>>('tasks', cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached tasks for perspective: ${perspectiveName}`);
        return cached;
      }

      // Build and execute script
      const script = this.omniAutomation.buildScript(QUERY_PERSPECTIVE_SCRIPT, {
        perspectiveName: JSON.stringify(perspectiveName),
        limit: limit,
        includeDetails: includeDetails,
      });

      this.logger.debug(`Querying perspective: ${perspectiveName}`);
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponse(
          'query_perspective',
          'SCRIPT_ERROR',
          result.message || result.error || 'Failed to query perspective',
          { rawResult: result },
          timer.toMetadata(),
        );
      }

      // Parse the result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        return createErrorResponse(
          'query_perspective',
          'PARSE_ERROR',
          'Failed to parse perspective query result',
          { rawResult: result },
          timer.toMetadata(),
        );
      }

      if (!parsedResult.success) {
        return createErrorResponse(
          'query_perspective',
          'PERSPECTIVE_NOT_FOUND',
          parsedResult.error || `Perspective "${perspectiveName}" not found`,
          { perspectiveName },
          timer.toMetadata(),
        );
      }

      const response = createSuccessResponse(
        'query_perspective',
        {
          perspectiveName: parsedResult.perspectiveName,
          perspectiveType: parsedResult.perspectiveType,
          tasks: parsedResult.tasks || [],
          filterRules: parsedResult.filterRules,
          aggregation: parsedResult.aggregation,
        },
        {
          ...timer.toMetadata(),
          total_count: parsedResult.count || 0,
          filter_rules_applied: !!parsedResult.filterRules,
        },
      );

      // Cache the result
      this.cache.set('tasks', cacheKey, response);

      return response;

    } catch (error) {
      return createErrorResponse(
        'query_perspective',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        {},
        timer.toMetadata(),
      );
    }
  }
}