import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_FOLDERS_SCRIPT } from '../../omnifocus/scripts/folders/list-folders.js';
import { createCollectionResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ListFoldersSchema } from '../schemas/folder-schemas.js';

export class ListFoldersTool extends BaseTool<typeof ListFoldersSchema> {
  name = 'list_folders';
  description = 'List folders in OmniFocus with hierarchy information. Filter by status or search, include parent/child relationships and project counts. Sort by name, depth, or status.';
  schema = ListFoldersSchema;

  async executeValidated(args: z.infer<typeof ListFoldersSchema>): Promise<any> {
    const timer = new OperationTimer();
    const cacheKey = 'folders';

    try {
      // Check cache first
      const cached = this.cache.get('folders', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached folder data');
        return createCollectionResponse(
          'list_folders',
          'folders',
          cached as any,
          {
            ...timer.toMetadata(),
            from_cache: true,
            filters: {
              status: args.status,
              search: args.search,
            },
          },
        );
      }

      // Execute list script
      const script = this.omniAutomation.buildScript(LIST_FOLDERS_SCRIPT, {
        options: args,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'list_folders',
          'SCRIPT_ERROR',
          result.message || 'Failed to list folders',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse list folders result: ${result}`);
        parsedResult = { folders: [], count: 0 };
      }

      // Cache the results for 5 minutes (folders change less frequently)
      this.cache.set('folders', cacheKey, parsedResult);

      return createCollectionResponse(
        'list_folders',
        'folders',
        parsedResult,
        {
          ...timer.toMetadata(),
          from_cache: false,
          total_folders: parsedResult.totalFolders,
          filters: {
            status: args.status,
            search: args.search,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}