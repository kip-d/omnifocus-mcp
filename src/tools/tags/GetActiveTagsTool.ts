import { z } from 'zod';
import { BaseTool } from '../base.js';
import { GET_ACTIVE_TAGS_SCRIPT } from '../../omnifocus/scripts/tags.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

const GetActiveTagsSchema = z.object({});

export class GetActiveTagsTool extends BaseTool<typeof GetActiveTagsSchema> {
  name = 'get_active_tags';
  description = 'Get only tags with incomplete tasks (typically <50 tags). Much faster than list_tags when you only need actionable tags. Returns simple array of tag names. Use this for GTD workflows, task filtering, or when empty tags are irrelevant.';
  schema = GetActiveTagsSchema;

  async executeValidated(_args: z.infer<typeof GetActiveTagsSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      // Check cache
      const cacheKey = 'active_tags';
      const cached = this.cache.get<any>('tags', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached active tags');
        return createListResponse(
          'get_active_tags',
          cached.tags,
          {
            ...timer.toMetadata(),
            from_cache: true,
            summary: cached.summary,
          },
        );
      }

      // Execute script
      const script = this.omniAutomation.buildScript(GET_ACTIVE_TAGS_SCRIPT, {});
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'get_active_tags',
          'SCRIPT_ERROR',
          result.message || 'Failed to get active tags',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      const cacheData = {
        tags: result.tags,
        summary: result.summary,
      };

      // Cache results with shorter TTL since active tags change more frequently
      this.cache.set('tags', cacheKey, cacheData); // Uses default TTL

      return createListResponse(
        'get_active_tags',
        result.tags,
        {
          ...timer.toMetadata(),
          from_cache: false,
          summary: result.summary,
          query_time_ms: result.summary?.query_time_ms || timer.getElapsedMs(),
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
