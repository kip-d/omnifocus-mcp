import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PERSPECTIVES_SCRIPT } from '../../omnifocus/scripts/perspectives/list-perspectives.js';
import { QUERY_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/perspectives/query-perspective.js';
import { createSuccessResponse, createErrorResponse, OperationTimer, StandardResponse } from '../../utils/response-format.js';
import { coerceBoolean, coerceNumber } from '../schemas/coercion-helpers.js';

// Consolidated schema for all perspective operations
const PerspectivesToolSchema = z.object({
  operation: z.enum(['list', 'query'])
    .default('list')
    .describe('Operation to perform: list all perspectives or query a specific one'),

  // List operation parameters
  includeFilterRules: coerceBoolean()
    .default(false)
    .describe('Include filter rules for custom perspectives (list operation)'),
  
  sortBy: z.string()
    .default('name')
    .describe('Sort order for perspectives (list operation)'),

  // Query operation parameters
  perspectiveName: z.string()
    .optional()
    .describe('Name of the perspective to query (required for query operation)'),
  
  limit: coerceNumber()
    .default(50)
    .describe('Maximum number of tasks to return (query operation)'),
  
  includeDetails: coerceBoolean()
    .default(false)
    .describe('Include task details like notes and subtasks (query operation)'),
});

interface PerspectiveInfo {
  name: string;
  identifier?: string;
  isBuiltIn?: boolean;
  isActive?: boolean;
  filterRules?: {
    available?: boolean | null;
    flagged?: boolean | null;
    duration?: number | null;
    tags?: string[];
  };
}

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

type PerspectivesResponse = StandardResponse<{ perspectives: PerspectiveInfo[] } | QueryPerspectiveData>;

export class PerspectivesToolV2 extends BaseTool<typeof PerspectivesToolSchema> {
  name = 'perspectives';
  description = 'Manage OmniFocus perspectives: list all available perspectives or query tasks from a specific perspective. Use operation="list" to see all perspectives, operation="query" to get tasks from a perspective.';
  schema = PerspectivesToolSchema;

  async executeValidated(args: z.infer<typeof PerspectivesToolSchema>): Promise<PerspectivesResponse> {
    const { operation } = args;

    switch (operation) {
      case 'list':
        return this.listPerspectives(args);
      case 'query':
        return this.queryPerspective(args);
      default:
        return createErrorResponse(
          'perspectives',
          'INVALID_OPERATION',
          `Invalid operation: ${operation}`,
          { operation },
          { executionTime: 0 },
        );
    }
  }

  private async listPerspectives(args: z.infer<typeof PerspectivesToolSchema>): Promise<StandardResponse<{ perspectives: PerspectiveInfo[] }>> {
    const timer = new OperationTimer();

    try {
      const script = this.omniAutomation.buildScript(LIST_PERSPECTIVES_SCRIPT, {});
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponse(
          'perspectives',
          'SCRIPT_ERROR',
          result.message || 'Failed to list perspectives',
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
          'perspectives',
          'PARSE_ERROR',
          'Failed to parse perspective list',
          { rawResult: result },
          timer.toMetadata(),
        );
      }

      const perspectives = parsedResult.perspectives || [];
      
      // Sort perspectives
      if (args.sortBy === 'name') {
        perspectives.sort((a: PerspectiveInfo, b: PerspectiveInfo) => 
          a.name.localeCompare(b.name)
        );
      }

      // Filter out filter rules if not requested
      if (!args.includeFilterRules) {
        perspectives.forEach((p: PerspectiveInfo) => {
          delete p.filterRules;
        });
      }

      return createSuccessResponse(
        'perspectives',
        { perspectives },
        {
          ...timer.toMetadata(),
          ...parsedResult.metadata,
          operation: 'list',
        },
      );
    } catch (error) {
      return createErrorResponse(
        'perspectives',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        { operation: 'list' },
        timer.toMetadata(),
      );
    }
  }

  private async queryPerspective(args: z.infer<typeof PerspectivesToolSchema>): Promise<StandardResponse<QueryPerspectiveData>> {
    const timer = new OperationTimer();

    try {
      const { perspectiveName, limit, includeDetails } = args;

      if (!perspectiveName) {
        return createErrorResponse(
          'perspectives',
          'MISSING_PARAMETER',
          'perspectiveName is required for query operation',
          { operation: 'query' },
          timer.toMetadata(),
        );
      }

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
        perspectiveName: perspectiveName,
        limit: limit,
        includeDetails: includeDetails,
      });

      this.logger.debug(`Querying perspective: ${perspectiveName}`);
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponse(
          'perspectives',
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
          'perspectives',
          'PARSE_ERROR',
          'Failed to parse perspective query result',
          { rawResult: result },
          timer.toMetadata(),
        );
      }

      if (!parsedResult.success) {
        return createErrorResponse(
          'perspectives',
          'PERSPECTIVE_NOT_FOUND',
          parsedResult.error || `Perspective "${perspectiveName}" not found`,
          { perspectiveName },
          timer.toMetadata(),
        );
      }

      const response = createSuccessResponse(
        'perspectives',
        {
          perspectiveName: parsedResult.perspectiveName,
          perspectiveType: parsedResult.perspectiveType,
          tasks: parsedResult.tasks || [],
          filterRules: parsedResult.filterRules,
          aggregation: parsedResult.aggregation,
        },
        {
          ...timer.toMetadata(),
          operation: 'query',
          total_count: parsedResult.count || 0,
          filter_rules_applied: !!parsedResult.filterRules,
        },
      );

      // Cache the result
      this.cache.set('tasks', cacheKey, response);

      return response;

    } catch (error) {
      return createErrorResponse(
        'perspectives',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        { operation: 'query' },
        timer.toMetadata(),
      );
    }
  }
}