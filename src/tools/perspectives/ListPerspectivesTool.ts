import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PERSPECTIVES_SCRIPT } from '../../omnifocus/scripts/perspectives.js';
import { createListResponse, createErrorResponse, OperationTimer, StandardResponse } from '../../utils/response-format.js';
import { OmniAutomation } from '../../omnifocus/OmniAutomation.js';

// Input schema
const ListPerspectivesSchema = z.object({
  includeFilterRules: z.string()
    .optional()
    .default('true')
    .describe('Include filter rules for custom perspectives'),
  sortBy: z.enum(['name', 'type'])
    .optional()
    .default('name')
    .describe('Sort order for perspectives')
});

// Perspective type
interface OmniFocusPerspective {
  name: string;
  type: 'builtin' | 'custom';
  identifier: string | null;
  filterRules: any | null;
  filterAggregation?: string;
}

type ListPerspectivesResponse = StandardResponse<{
  items: OmniFocusPerspective[];
  builtInCount?: number;
  customCount?: number;
}>;

export class ListPerspectivesTool extends BaseTool<typeof ListPerspectivesSchema> {
  name = 'list_perspectives';
  description = 'List all available OmniFocus perspectives (built-in and custom) with their filter rules for understanding user workflows';
  schema = ListPerspectivesSchema;

  async executeValidated(args: z.infer<typeof ListPerspectivesSchema>): Promise<ListPerspectivesResponse> {
    const timer = new OperationTimer();

    try {
      const includeFilterRules = args.includeFilterRules === 'true';
      const sortBy = args.sortBy || 'name';

      // Create cache key
      const cacheKey = `perspectives:${includeFilterRules}:${sortBy}`;

      // Check cache (5 minute TTL for perspectives)
      const cached = this.cache.get<ListPerspectivesResponse>('projects', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached perspectives');
        return cached;
      }

      // Execute script using the jxaWrapper
      const builder = new OmniAutomation();
      const script = LIST_PERSPECTIVES_SCRIPT.jxaWrapper(builder);
      this.logger.debug('Fetching perspectives from OmniFocus');
      const result = await this.omniAutomation.execute<any>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return createErrorResponse(
          'list_perspectives',
          'SCRIPT_ERROR',
          result.error,
          timer
        );
      }

      // Process perspectives
      let perspectives: OmniFocusPerspective[] = result.perspectives || [];

      // Filter out rules if not requested
      if (!includeFilterRules) {
        perspectives = perspectives.map(p => ({
          ...p,
          filterRules: null,
          filterAggregation: undefined
        }));
      }

      // Sort perspectives
      if (sortBy === 'type') {
        perspectives.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'builtin' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      } else {
        perspectives.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Count by type
      const builtInCount = perspectives.filter(p => p.type === 'builtin').length;
      const customCount = perspectives.filter(p => p.type === 'custom').length;

      const response = createListResponse(
        'list_perspectives',
        perspectives,
        timer.toMetadata()
      ) as ListPerspectivesResponse;

      // Add extra properties to data
      if (response.data) {
        response.data.builtInCount = builtInCount;
        response.data.customCount = customCount;
      }

      // Cache the result
      this.cache.set('projects', cacheKey, response); // Uses default TTL

      return response;

    } catch (error) {
      return createErrorResponse(
        'list_perspectives',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      ) as ListPerspectivesResponse;
    }
  }
}