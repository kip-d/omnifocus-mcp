import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PERSPECTIVES_SCRIPT } from '../../omnifocus/scripts/perspectives/list-perspectives.js';
import { QUERY_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/perspectives/query-perspective.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2, StandardResponseV2 } from '../../utils/response-format-v2.js';
import { coerceBoolean, coerceNumber } from '../schemas/coercion-helpers.js';
import { isScriptSuccess, ListResultSchema } from '../../omnifocus/script-result-types.js';

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
  filterRules: Record<string, unknown>;
  aggregation: string;
}

type PerspectivesResponse = StandardResponseV2<{ perspectives: PerspectiveInfo[] } | QueryPerspectiveData>;

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
        return createErrorResponseV2(
          'perspectives',
          'INVALID_OPERATION',
          `Invalid operation: ${String(operation)}`,
          undefined,
          { operation },
          { executionTime: 0 },
        );
    }
  }

  private async listPerspectives(args: z.infer<typeof PerspectivesToolSchema>): Promise<StandardResponseV2<{ perspectives: PerspectiveInfo[] }>> {
    const timer = new OperationTimerV2();

    try {
      const script = this.omniAutomation.buildScript(LIST_PERSPECTIVES_SCRIPT, {});
      const result = await this.omniAutomation.executeJson(script, ListResultSchema);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'perspectives',
          'SCRIPT_ERROR',
          result.error,
          undefined,
          { rawResult: result.details },
          timer.toMetadata(),
        );
      }

      // Parse the result
      const parsedResult = result.data;

      const perspectives = (parsedResult as { perspectives?: PerspectiveInfo[]; items?: PerspectiveInfo[] }).perspectives || (parsedResult as { perspectives?: PerspectiveInfo[]; items?: PerspectiveInfo[] }).items || [];

      // Sort perspectives (default to 'name' if not specified)
      const sortBy = args.sortBy || 'name';
      if (sortBy === 'name') {
        (perspectives as PerspectiveInfo[]).sort((a: PerspectiveInfo, b: PerspectiveInfo) =>
          a.name.localeCompare(b.name),
        );
      }

      // Filter out filter rules if not requested
      if (!args.includeFilterRules) {
        perspectives.forEach((p: PerspectiveInfo) => {
          delete p.filterRules;
        });
      }

      return createSuccessResponseV2(
        'perspectives',
        { perspectives },
        undefined,
        { ...timer.toMetadata(), ...(parsedResult as { metadata?: Record<string, unknown> }).metadata, operation: 'list' },
      );
    } catch (error) {
      return createErrorResponseV2(
        'perspectives',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        { operation: 'list' },
        timer.toMetadata(),
      );
    }
  }

  private async queryPerspective(args: z.infer<typeof PerspectivesToolSchema>): Promise<StandardResponseV2<QueryPerspectiveData>> {
    const timer = new OperationTimerV2();

    try {
      const { perspectiveName, limit, includeDetails } = args;

      if (!perspectiveName) {
        return createErrorResponseV2(
          'perspectives',
          'MISSING_PARAMETER',
          'perspectiveName is required for query operation',
          undefined,
          { operation: 'query' },
          timer.toMetadata(),
        );
      }

      // Create cache key
      const cacheKey = `perspective:${perspectiveName}:${limit}:${includeDetails}`;

      // Check cache (30 second TTL for perspective queries)
      const cached = this.cache.get<StandardResponseV2<QueryPerspectiveData>>('tasks', cacheKey);
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
      // For query operation, legacy tests return a direct object with success flag
      let raw: unknown = await (this.omniAutomation as { execute: (script: string) => Promise<unknown> }).execute(script);
      if (typeof raw === 'string') { try { raw = JSON.parse(raw) as unknown; } catch { /* ignore */ } }

      if (!raw || (raw as { error?: boolean }).error === true) {
        return createErrorResponseV2(
          'perspectives',
          'SCRIPT_ERROR',
          (raw && (raw as { message?: string }).message) ? (raw as { message: string }).message : 'Script failed',
          undefined,
          { rawResult: raw },
          timer.toMetadata(),
        );
      }

      // Legacy success/false pattern
      if ((raw as { success?: boolean }).success === false) {
        return createErrorResponseV2(
          'perspectives',
          'PERSPECTIVE_NOT_FOUND',
          (raw as { error?: string }).error || `Perspective "${perspectiveName}" not found`,
          undefined,
          { perspectiveName },
          timer.toMetadata(),
        );
      }

      const response = createSuccessResponseV2(
        'perspectives',
        { perspectiveName: (raw as { perspectiveName: string }).perspectiveName, perspectiveType: (raw as { perspectiveType: 'builtin' | 'custom' }).perspectiveType, tasks: (raw as { tasks?: PerspectiveTask[] }).tasks || [], filterRules: (raw as { filterRules: Record<string, unknown> }).filterRules, aggregation: (raw as { aggregation: string }).aggregation },
        undefined,
        { ...timer.toMetadata(), operation: 'query', total_count: (raw as { count?: number }).count || 0, filter_rules_applied: !!(raw as { filterRules?: Record<string, unknown> }).filterRules },
      );

      // Cache the result
      this.cache.set('tasks', cacheKey, response);

      return response;

    } catch (error) {
      return createErrorResponseV2(
        'perspectives',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        { operation: 'query' },
        timer.toMetadata(),
      );
    }
  }
}
