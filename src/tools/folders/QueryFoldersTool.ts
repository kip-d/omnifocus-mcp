import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_FOLDERS_SCRIPT } from '../../omnifocus/scripts/folders/list-folders.js';
import { createCollectionResponse, createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { isScriptSuccess, ListResultSchema } from '../../omnifocus/script-result-types.js';
import {
  QueryFoldersSchema,
  ListFoldersOperationSchema,
  GetFolderOperationSchema,
  SearchFoldersOperationSchema,
  GetFolderProjectsOperationSchema,
} from '../schemas/folder-schemas.js';

export class QueryFoldersTool extends BaseTool<typeof QueryFoldersSchema> {
  name = 'query_folders';
  description = 'Unified tool for folder query operations: list all folders, get specific folder, search folders by name, and get projects within a folder.';
  schema = QueryFoldersSchema;

  async executeValidated(args: z.infer<typeof QueryFoldersSchema>): Promise<any> {
    const timer = new OperationTimer();
    const { operation } = args;

    try {
      switch (operation) {
        case 'list':
          return await this.handleList(args, timer);
        case 'get':
          return await this.handleGet(args, timer);
        case 'search':
          return await this.handleSearch(args, timer);
        case 'get_projects':
          return await this.handleGetProjects(args, timer);
        default:
          return createErrorResponse(
            'query_folders',
            'INVALID_OPERATION',
            `Unsupported operation: ${String(operation)}`,
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async handleList(args: z.infer<typeof ListFoldersOperationSchema>, timer: OperationTimer): Promise<any> {
    const {
      status,
      includeHierarchy = true,
      includeProjects = false,
      sortBy = 'name',
      sortOrder = 'asc',
      limit = 100,
    } = args;

    const cacheKey = 'folders';

    // Check cache first
    const cached = this.cache.get('folders', cacheKey);
    if (cached && !includeProjects) { // Don't use cache if projects are requested as they may be stale
      this.logger.debug('Returning cached folder data');
      return createCollectionResponse(
        'query_folders',
        'folders',
        cached as any,
        {
          ...timer.toMetadata(),
          operation: 'list',
          from_cache: true,
          filters: { status },
        },
      );
    }

    // Build script options
    const scriptOptions = {
      status,
      includeHierarchy,
      includeProjects,
      sortBy,
      sortOrder,
      limit,
    };

    const script = this.omniAutomation.buildScript(LIST_FOLDERS_SCRIPT, {
      options: scriptOptions,
    });
    const result = await this.omniAutomation.executeJson(script, ListResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponse(
        'query_folders',
        'LIST_FAILED',
        result.error,
        { details: result.details, operation: 'list' },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;

    // Cache the results for 5 minutes (folders change less frequently)
    if (!includeProjects) { // Only cache if projects aren't included
      this.cache.set('folders', cacheKey, parsedResult);
    }

    return createCollectionResponse(
      'query_folders',
      'folders',
      parsedResult,
      {
        ...timer.toMetadata(),
        operation: 'list',
        from_cache: false,
        total_folders: parsedResult.summary?.total || parsedResult.items?.length || 0,
        filters: { status },
      },
    );
  }

  private async handleGet(args: z.infer<typeof GetFolderOperationSchema>, timer: OperationTimer): Promise<any> {
    const { folderId, includeDetails = true } = args;

    // For get operation, we'll use list with a filter approach since we don't have a separate get script
    const script = this.omniAutomation.buildScript(LIST_FOLDERS_SCRIPT, {
      options: {
        includeHierarchy: true,
        includeProjects: includeDetails,
        limit: 1000, // Set high limit to ensure we get all folders for filtering
      },
    });
    const result = await this.omniAutomation.executeJson(script, ListResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponse(
        'query_folders',
        'GET_FAILED',
        result.error,
        { details: result.details, operation: 'get', folderId },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;

    // Find the specific folder by ID
    const folder = parsedResult.items?.find((f: any) => f.id === folderId);
    if (!folder) {
      return createErrorResponse(
        'query_folders',
        'NOT_FOUND',
        `Folder not found with ID: ${folderId}`,
        { operation: 'get', folderId },
        timer.toMetadata(),
      );
    }

    return createEntityResponse(
      'query_folders',
      'folder',
      { ...folder, operation: 'get' },
      {
        ...timer.toMetadata(),
        operation: 'get',
        folder_id: folderId,
      },
    );
  }

  private async handleSearch(args: z.infer<typeof SearchFoldersOperationSchema>, timer: OperationTimer): Promise<any> {
    const { searchTerm, includeDetails = true, limit = 100 } = args;

    const script = this.omniAutomation.buildScript(LIST_FOLDERS_SCRIPT, {
      options: {
        search: searchTerm,
        includeHierarchy: true,
        includeProjects: includeDetails,
        limit,
      },
    });
    const result = await this.omniAutomation.executeJson(script, ListResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponse(
        'query_folders',
        'SEARCH_FAILED',
        result.error,
        { details: result.details, operation: 'search', searchTerm },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;

    return createCollectionResponse(
      'query_folders',
      'folders',
      { ...parsedResult, operation: 'search' },
      {
        ...timer.toMetadata(),
        operation: 'search',
        search_term: searchTerm,
        total_matches: parsedResult.summary?.total || parsedResult.items?.length || 0,
      },
    );
  }

  private async handleGetProjects(args: z.infer<typeof GetFolderProjectsOperationSchema>, timer: OperationTimer): Promise<any> {
    const { folderId } = args;

    // Get folder with projects included
    const script = this.omniAutomation.buildScript(LIST_FOLDERS_SCRIPT, {
      options: {
        includeHierarchy: false,
        includeProjects: true,
        limit: 1000,
      },
    });
    const result = await this.omniAutomation.executeJson(script, ListResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponse(
        'query_folders',
        'GET_PROJECTS_FAILED',
        result.error,
        { details: result.details, operation: 'get_projects', folderId },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;

    // Find the specific folder by ID and return its projects
    const folder = parsedResult.items?.find((f: any) => f.id === folderId);
    if (!folder) {
      return createErrorResponse(
        'query_folders',
        'NOT_FOUND',
        `Folder not found with ID: ${folderId}`,
        { operation: 'get_projects', folderId },
        timer.toMetadata(),
      );
    }

    const projects = (folder as any)?.projects || [];

    return createCollectionResponse(
      'query_folders',
      'projects',
      { projects, count: projects.length, operation: 'get_projects' },
      {
        ...timer.toMetadata(),
        operation: 'get_projects',
        folder_id: folderId,
        project_count: projects.length,
      },
    );
  }
}
