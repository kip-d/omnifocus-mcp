import { BaseTool } from '../base.js';
import { LIST_TAGS_SCRIPT } from '../../omnifocus/scripts/tags.js';

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
    try {
      const { sortBy = 'name', includeEmpty = true } = args;
      
      // Create cache key
      const cacheKey = `list_${sortBy}_${includeEmpty}`;
      
      // Check cache
      const cached = this.cache.get<any>('tags', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached tags');
        return {
          ...cached,
          from_cache: true,
        };
      }
      
      // Execute script
      const script = this.omniAutomation.buildScript(LIST_TAGS_SCRIPT, { 
        options: { sortBy, includeEmpty }
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      if (result.error) {
        return result;
      }
      
      const finalResult = {
        tags: result.tags,
        summary: result.summary,
        from_cache: false,
      };
      
      // Cache results
      this.cache.set('tags', cacheKey, finalResult);
      
      return finalResult;
    } catch (error) {
      return this.handleError(error);
    }
  }
}