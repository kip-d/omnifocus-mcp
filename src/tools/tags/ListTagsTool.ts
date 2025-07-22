import { BaseTool } from '../base.js';
import { LIST_TAGS_SCRIPT } from '../../omnifocus/scripts/tags.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class ListTagsTool extends BaseTool {
  name = 'list_tags';
  description = 'List all tags/contexts in OmniFocus with usage statistics';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      sortBy: {
        type: 'string',
        enum: ['name', 'usage', 'tasks'],
        description: 'How to sort the tags',
        default: 'name',
      },
      includeEmpty: {
        type: 'boolean',
        description: 'Include tags with no tasks',
        default: true,
      },
    },
  };

  async execute(args: { sortBy?: string; includeEmpty?: boolean }): Promise<any> {
    const timer = new OperationTimer();
    
    try {
      const { sortBy = 'name', includeEmpty = true } = args;
      
      // Create cache key
      const cacheKey = `list_${sortBy}_${includeEmpty}`;
      
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
            include_empty: includeEmpty
          }
        );
      }
      
      // Execute script
      const script = this.omniAutomation.buildScript(LIST_TAGS_SCRIPT, { 
        options: { sortBy, includeEmpty }
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      if (result.error) {
        return createErrorResponse(
          'list_tags',
          'SCRIPT_ERROR',
          result.message || 'Failed to list tags',
          { details: result.details },
          timer.toMetadata()
        );
      }
      
      const cacheData = {
        tags: result.tags,
        summary: result.summary
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
          query_time_ms: result.summary?.query_time_ms || timer.getElapsedMs()
        }
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}