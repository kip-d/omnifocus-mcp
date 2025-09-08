import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createListFoldersScript } from '../../omnifocus/scripts/folders/list-folders.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
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
    const timer = new OperationTimerV2();
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
          return createErrorResponseV2(
            'query_folders',
            'INVALID_OPERATION',
            `Unsupported operation: ${String(operation)}`,
            'Use list|get|search|get_projects',
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async handleList(args: z.infer<typeof ListFoldersOperationSchema>, timer: OperationTimerV2): Promise<any> {
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
      return createSuccessResponseV2('query_folders', { folders: (cached as any).folders ?? (cached as any).items ?? cached }, undefined, { ...timer.toMetadata(), operation: 'list', from_cache: true, filters: { status } });
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

    const script = createListFoldersScript(scriptOptions);
    console.error(`[FOLDERS_DEBUG] Generated script length: ${script?.length}, type: ${typeof script}`);
    console.error(`[FOLDERS_DEBUG] Script preview: ${script?.substring(0, 100)}...`);
    const result = await this.execJson(script);
    if ((result as any).success === false) {
      return createErrorResponseV2(
        'query_folders',
        'LIST_FAILED',
        (result as any).error || 'Query failed',
        'Ensure folder data is accessible',
        { details: (result as any).details, operation: 'list' },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;
    const foldersArr = parsedResult.items || parsedResult.folders || [];

    // Cache the results for 5 minutes (folders change less frequently)
    if (!includeProjects) { // Only cache if projects aren't included
      this.cache.set('folders', cacheKey, { folders: foldersArr });
    }

    return createSuccessResponseV2('query_folders', { folders: foldersArr }, undefined, { ...timer.toMetadata(), operation: 'list', from_cache: false, total_folders: foldersArr.length, filters: { status } });
  }

  private async handleGet(args: z.infer<typeof GetFolderOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { folderId, includeDetails = true } = args;

    // For get operation, we'll use list with a filter approach since we don't have a separate get script
    const script = createListFoldersScript({
      includeHierarchy: true,
      includeProjects: includeDetails,
      limit: 1000, // Set high limit to ensure we get all folders for filtering
    });
    const result = await this.execJson(script);
    if ((result as any).success === false) {
      return createErrorResponseV2(
        'query_folders',
        'GET_FAILED',
        (result as any).error || 'Get failed',
        undefined,
        { details: (result as any).details, operation: 'get', folderId },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;

    // Find the specific folder by ID
    const folder = parsedResult.items?.find((f: any) => f.id === folderId);
    if (!folder) {
      return createErrorResponseV2(
        'query_folders',
        'NOT_FOUND',
        `Folder not found with ID: ${folderId}`,
        undefined,
        { operation: 'get', folderId },
        timer.toMetadata(),
      );
    }

    return createSuccessResponseV2('query_folders', { folder: { ...folder, operation: 'get' } }, undefined, { ...timer.toMetadata(), operation: 'get', folder_id: folderId });
  }

  private async handleSearch(args: z.infer<typeof SearchFoldersOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { searchTerm, includeDetails = true, limit = 100 } = args;

    const script = createListFoldersScript({
      search: searchTerm,
      includeHierarchy: true,
      includeProjects: includeDetails,
      limit,
    });
    const result = await this.execJson(script);
    if ((result as any).success === false) {
      return createErrorResponseV2(
        'query_folders',
        'SEARCH_FAILED',
        (result as any).error || 'Search failed',
        undefined,
        { details: (result as any).details, operation: 'search', searchTerm },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;

    return createSuccessResponseV2('query_folders', { folders: parsedResult.items ?? parsedResult.folders ?? [] }, undefined, { ...timer.toMetadata(), operation: 'search', search_term: searchTerm, total_matches: parsedResult.summary?.total || parsedResult.items?.length || 0 });
  }

  private async handleGetProjects(args: z.infer<typeof GetFolderProjectsOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { folderId } = args;

    // Get folder with projects included
    const script = createListFoldersScript({
      includeHierarchy: false,
      includeProjects: true,
      limit: 1000,
    });
    const result = await this.execJson(script);
    if ((result as any).success === false) {
      return createErrorResponseV2(
        'query_folders',
        'GET_PROJECTS_FAILED',
        (result as any).error || 'Get projects failed',
        undefined,
        { details: (result as any).details, operation: 'get_projects', folderId },
        timer.toMetadata(),
      );
    }

    const parsedResult = result.data as any;

    // Find the specific folder by ID and return its projects
    const folder = parsedResult.items?.find((f: any) => f.id === folderId);
    if (!folder) {
      return createErrorResponseV2(
        'query_folders',
        'NOT_FOUND',
        `Folder not found with ID: ${folderId}`,
        undefined,
        { operation: 'get_projects', folderId },
        timer.toMetadata(),
      );
    }

    const projects = (folder as any)?.projects || [];

    return createSuccessResponseV2('query_folders', { projects, count: projects.length, operation: 'get_projects' }, undefined, { ...timer.toMetadata(), operation: 'get_projects', folder_id: folderId, project_count: projects.length });
  }

  // Execute the script and adapt the response format
  private async execJson(script: string) {
    const anyOmni: any = this.omniAutomation as any;
    // Execute the actual script
    const raw = await anyOmni.execute(script);
    // Adapt mocks: { folders: [...] } -> { success:true, data:{ items:[...], summary:{ total } } }
    if (raw && typeof raw === 'object') {
      const obj: any = raw;
      if (obj.success === false) {
        return { success: false, error: obj.error || 'Query failed', details: obj.details };
      }
      const items = obj.items || obj.folders || obj.projects || [];
      const data = obj.items ? obj : { items, summary: { total: Array.isArray(items) ? items.length : 0 } };
      return { success: true, data };
    }
    return { success: false, error: 'Invalid result', details: raw };
  }
}
