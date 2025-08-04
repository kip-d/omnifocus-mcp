import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_TAGS_SCRIPT } from '../../omnifocus/scripts/tags.js';
import { LIST_TAGS_OPTIMIZED_SCRIPT } from '../../omnifocus/scripts/tags/list-tags-optimized.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListTagsSchema } from '../schemas/tag-schemas.js';

export class ListTagsTool extends BaseTool<typeof ListTagsSchema> {
  name = 'list_tags';
  description = 'List all tags/contexts in OmniFocus. Performance modes: namesOnly=true (fastest, ~130ms), fastMode=true (fast, ~270ms, no hierarchy), default (full, ~700ms). Set includeEmpty=false to exclude unused tags. For active tags only, use get_active_tags tool instead.';
  schema = ListTagsSchema;

  async executeValidated(args: z.infer<typeof ListTagsSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { 
        sortBy = 'name', 
        includeEmpty = true, 
        includeUsageStats = false,
        fastMode = false,
        namesOnly = false
      } = args;

      // Create cache key
      const cacheKey = `list_${sortBy}_${includeEmpty}_${includeUsageStats}_${fastMode}_${namesOnly}`;

      // Check cache
      const cached = this.cache.get<any>('tags', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached tags');
        return createListResponse(
          'list_tags',
          cached.tags,
          {
            ...timer.toMetadata(),
            from_cache: true,
            summary: cached.summary,
            sort_by: sortBy,
            include_empty: includeEmpty,
            performance_mode: namesOnly ? 'names_only' : fastMode ? 'fast' : 'full',
          },
        );
      }

      // Use optimized script if any performance mode is enabled
      const useOptimized = fastMode || namesOnly || !includeUsageStats;
      const scriptToUse = useOptimized ? LIST_TAGS_OPTIMIZED_SCRIPT : LIST_TAGS_SCRIPT;
      
      // Execute script
      const script = this.omniAutomation.buildScript(scriptToUse, {
        options: { sortBy, includeEmpty, includeUsageStats, fastMode, namesOnly },
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'list_tags',
          'SCRIPT_ERROR',
          result.message || 'Failed to list tags',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      const cacheData = {
        tags: result.tags,
        summary: result.summary,
      };

      // Cache results
      this.cache.set('tags', cacheKey, cacheData);

      return createListResponse(
        'list_tags',
        result.tags,
        {
          ...timer.toMetadata(),
          from_cache: false,
          summary: result.summary,
          sort_by: sortBy,
          include_empty: includeEmpty,
          query_time_ms: result.summary?.query_time_ms || timer.getElapsedMs(),
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
