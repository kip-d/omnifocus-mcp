import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PERSPECTIVES_SCRIPT } from '../../omnifocus/scripts/perspectives/list-perspectives.js';
import { QUERY_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/perspectives/query-perspective.js';
import {
  createSuccessResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
  normalizeBooleanInput,
  normalizeStringInput,
} from '../../utils/response-format-v2.js';
import {
  PerspectivesListResponseV2,
  PerspectiveQueryResponseV2,
  PerspectiveInfoV2,
} from '../response-types-v2.js';

const PerspectivesToolSchemaV2 = z.object({
  operation: z.enum(['list', 'query']).default('list')
    .describe('Operation to perform: "list" perspectives or "query" a specific perspective'),

  // Parameters for list operation
  includeFilterRules: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional().describe('For list: include filter rules for custom perspectives'),
  sortBy: z.string().optional().default('name').describe('For list: sort order'),

  // Parameters for query operation
  perspectiveName: z.string().optional().describe('For query: name of the perspective to query'),
  limit: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10))
  ]).optional().default(50).describe('For query: maximum tasks to return'),
  includeDetails: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional().default(false).describe('For query: include task details'),
});

export type PerspectivesArgsV2 = z.infer<typeof PerspectivesToolSchemaV2>;

export class PerspectivesToolV2 extends BaseTool<typeof PerspectivesToolSchemaV2, PerspectivesListResponseV2 | PerspectiveQueryResponseV2> {
  name = 'perspectives';
  description = 'Work with OmniFocus perspectives. Operations: list available perspectives or query tasks from a specific perspective.';
  schema = PerspectivesToolSchemaV2;

  async executeValidated(args: PerspectivesArgsV2): Promise<PerspectivesListResponseV2 | PerspectiveQueryResponseV2> {
    const timer = new OperationTimerV2();
    const normalized = this.normalizeInputs(args);

    switch (normalized.operation) {
      case 'query':
        return this.handleQuery(normalized, timer);
      case 'list':
      default:
        return this.handleList(normalized, timer);
    }
  }

  private normalizeInputs(args: PerspectivesArgsV2): PerspectivesArgsV2 {
    return {
      ...args,
      includeFilterRules: normalizeBooleanInput(args.includeFilterRules) ?? undefined,
      includeDetails: normalizeBooleanInput(args.includeDetails) ?? false,
      perspectiveName: normalizeStringInput(args.perspectiveName) ?? undefined,
      sortBy: normalizeStringInput(args.sortBy) ?? 'name',
      limit: args.limit !== undefined ? Number(args.limit) : 50,
    };
  }

  private async handleList(args: PerspectivesArgsV2, timer: OperationTimerV2): Promise<PerspectivesListResponseV2> {
    const cacheKey = `perspectives_list_${args.includeFilterRules}_${args.sortBy}`;
    const cached = this.cache.get<{ perspectives: PerspectiveInfoV2[] }>('tasks', cacheKey);
    if (cached) {
      return createSuccessResponseV2(
        'perspectives',
        { perspectives: cached.perspectives },
        undefined,
        { ...timer.toMetadata(), operation: 'list', from_cache: true, total_count: cached.perspectives.length, returned_count: cached.perspectives.length }
      );
    }

    try {
      const script = this.omniAutomation.buildScript(LIST_PERSPECTIVES_SCRIPT, {});
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponseV2(
          'perspectives',
          'SCRIPT_ERROR',
          result.message || 'Failed to list perspectives',
          'Ensure OmniFocus is running and accessible',
          result,
          { ...timer.toMetadata(), operation: 'list' }
        );
      }

      let parsed: any;
      try {
        parsed = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (e) {
        return createErrorResponseV2(
          'perspectives',
          'PARSE_ERROR',
          'Failed to parse perspective list',
          undefined,
          { raw: result },
          { ...timer.toMetadata(), operation: 'list' }
        );
      }

      let perspectives: PerspectiveInfoV2[] = parsed.perspectives || [];

      if (args.sortBy === 'name') {
        perspectives.sort((a, b) => a.name.localeCompare(b.name));
      }

      if (!args.includeFilterRules) {
        perspectives = perspectives.map(p => {
          const { filterRules, ...rest } = p as any;
          return rest;
        });
      }

      this.cache.set('tasks', cacheKey, { perspectives });

      return createSuccessResponseV2(
        'perspectives',
        { perspectives },
        undefined,
        { ...timer.toMetadata(), operation: 'list', from_cache: false, total_count: perspectives.length, returned_count: perspectives.length }
      );
    } catch (error) {
      return createErrorResponseV2(
        'perspectives',
        'EXECUTION_ERROR',
        error instanceof Error ? error.message : String(error),
        'Verify OmniFocus is installed',
        undefined,
        { ...timer.toMetadata(), operation: 'list' }
      );
    }
  }

  private async handleQuery(args: PerspectivesArgsV2, timer: OperationTimerV2): Promise<PerspectiveQueryResponseV2> {
    if (!args.perspectiveName) {
      return createErrorResponseV2(
        'perspectives',
        'MISSING_PARAM',
        'perspectiveName is required for query operation',
        'Provide a valid perspectiveName',
        undefined,
        { ...timer.toMetadata(), operation: 'query' }
      );
    }

    const cacheKey = `perspective_query_${args.perspectiveName}_${args.limit}_${args.includeDetails}`;
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createSuccessResponseV2(
        'perspectives',
        cached,
        undefined,
        { ...timer.toMetadata(), operation: 'query', from_cache: true }
      );
    }

    try {
      const script = this.omniAutomation.buildScript(QUERY_PERSPECTIVE_SCRIPT, {
        perspectiveName: args.perspectiveName,
        limit: args.limit,
        includeDetails: args.includeDetails,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponseV2(
          'perspectives',
          'SCRIPT_ERROR',
          result.message || result.error || 'Failed to query perspective',
          'Ensure the perspective exists',
          result,
          { ...timer.toMetadata(), operation: 'query' }
        );
      }

      let parsed: any;
      try {
        parsed = typeof result === 'string' ? JSON.parse(result) : result;
      } catch {
        return createErrorResponseV2(
          'perspectives',
          'PARSE_ERROR',
          'Failed to parse perspective query result',
          undefined,
          { raw: result },
          { ...timer.toMetadata(), operation: 'query' }
        );
      }

      if (!parsed.success) {
        return createErrorResponseV2(
          'perspectives',
          'PERSPECTIVE_NOT_FOUND',
          parsed.error || `Perspective "${args.perspectiveName}" not found`,
          'Check the perspective name',
          { perspectiveName: args.perspectiveName },
          { ...timer.toMetadata(), operation: 'query' }
        );
      }

      const data = {
        perspectiveName: parsed.perspectiveName,
        perspectiveType: parsed.perspectiveType,
        tasks: parsed.tasks || [],
        filterRules: parsed.filterRules,
        aggregation: parsed.aggregation,
      };

      this.cache.set('tasks', cacheKey, data);

      return createSuccessResponseV2(
        'perspectives',
        data,
        undefined,
        { ...timer.toMetadata(), operation: 'query', from_cache: false, total_count: data.tasks.length, returned_count: data.tasks.length }
      );
    } catch (error) {
      return createErrorResponseV2(
        'perspectives',
        'EXECUTION_ERROR',
        error instanceof Error ? error.message : String(error),
        'Verify the perspective exists',
        undefined,
        { ...timer.toMetadata(), operation: 'query' }
      );
    }
  }
}

