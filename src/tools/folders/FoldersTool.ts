import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createListFoldersScript } from '../../omnifocus/scripts/folders/list-folders.js';
import { CREATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/create-folder.js';
import { UPDATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/update-folder.js';
import { DELETE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/delete-folder.js';
import { MOVE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/move-folder.js';
import { createErrorResponseV2, createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { isScriptSuccess } from '../../omnifocus/script-result-types.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';

// Consolidated folders schema
const FoldersSchema = z.object({
  operation: z.enum(['list', 'get', 'search', 'projects', 'create', 'update', 'delete', 'move', 'duplicate', 'set_status'])
    .describe('Operation to perform on folders'),

  // Identification
  folderId: z.string()
    .optional()
    .describe('Folder ID (required for get, update, delete, move, duplicate, set_status, projects)'),

  folderName: z.string()
    .optional()
    .describe('Folder name (alternative to folderId for some operations)'),

  // Create/Update parameters
  name: z.string()
    .optional()
    .describe('New folder name (for create/update)'),

  parentFolderId: z.string()
    .optional()
    .describe('Parent folder ID (for create/move)'),

  // Query parameters
  searchQuery: z.string()
    .optional()
    .describe('Search query for folder names (search operation)'),

  includeProjects: coerceBoolean()
    .optional()
    .describe('Include projects in each folder (list operation)'),

  includeSubfolders: coerceBoolean()
    .optional()
    .describe('Include subfolders (list operation)'),

  // Status operation
  status: z.enum(['active', 'dropped'])
    .optional()
    .describe('New status for folder (set_status operation)'),

  includeContents: coerceBoolean()
    .optional()
    .describe('Apply status to all projects in folder (set_status operation)'),

  // Duplicate operation
  duplicateName: z.string()
    .optional()
    .describe('Name for duplicated folder (duplicate operation)'),
});

type FoldersInput = z.infer<typeof FoldersSchema>;

/**
 * Consolidated tool for all folder operations
 * Combines query and management operations into a single tool
 */
export class FoldersTool extends BaseTool<typeof FoldersSchema> {
  name = 'folders';
  description = 'Query and manage OmniFocus folders. Operations: list (all folders), get (specific folder), search (by name), projects (projects in folder), create, update, delete, move, duplicate, set_status. Consistent with the projects tool pattern.';
  schema = FoldersSchema;

  constructor(cache: any) {
    super(cache);
  }

  async executeValidated(args: FoldersInput): Promise<any> {
    const timer = new OperationTimerV2();
    const { operation, ...params } = args;

    try {
      // Route to appropriate tool based on operation type
      switch (operation) {
        // Query operations
        case 'list': {
          // Direct implementation of list folders
          const {
            includeHierarchy = true,
            includeProjects = params.includeProjects || false,
            sortBy = 'name',
            sortOrder = 'asc',
            limit = 100,
          } = params as any;

          const cacheKey = 'folders';

          // Check cache first
          const cached = this.cache.get('folders', cacheKey);
          if (cached && !includeProjects) { // Don't use cache if projects are requested as they may be stale
            this.logger.debug('Returning cached folder data');
            return createSuccessResponseV2('folders', { folders: (cached as any).folders ?? (cached as any).items ?? cached }, undefined, { ...timer.toMetadata(), operation: 'list', from_cache: true, filters: {} });
          }

          // Build script options
          const scriptOptions = {
            includeHierarchy,
            includeProjects,
            sortBy,
            sortOrder,
            limit,
          };

          const script = createListFoldersScript(scriptOptions);
          console.error(`[FOLDERS_DEBUG] Generated script length: ${script?.length}, type: ${typeof script}`);
          console.error(`[FOLDERS_DEBUG] Script preview: ${script?.substring(0, 100)}...`);
          const listResult = await this.execJson(script);
          if ((listResult as any).success === false) {
            return createErrorResponseV2(
              'folders',
              'LIST_FAILED',
              (listResult as any).error || 'Query failed',
              'Ensure folder data is accessible',
              { details: (listResult as any).details, operation: 'list' },
              timer.toMetadata(),
            );
          }

          const parsedListResult = listResult.data as any;
          const foldersArr = parsedListResult.items || parsedListResult.folders || [];

          // Cache the results for 5 minutes (folders change less frequently)
          if (!includeProjects) {
            this.cache.set('folders', cacheKey, foldersArr);
          }

          return createSuccessResponseV2('folders', { folders: foldersArr }, undefined, { ...timer.toMetadata(), operation: 'list', total_folders: foldersArr.length });
        }

        case 'get': {
          // Direct implementation of get folder by ID
          if (!params.folderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId is required for get operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          // For get operation, use list with a filter approach since we don't have a separate get script
          const getScript = createListFoldersScript({
            includeHierarchy: true,
            includeProjects: true,
            limit: 1000, // Set high limit to ensure we get all folders for filtering
          });
          const getResult = await this.execJson(getScript);
          if ((getResult as any).success === false) {
            return createErrorResponseV2(
              'folders',
              'GET_FAILED',
              (getResult as any).error || 'Get failed',
              undefined,
              { details: (getResult as any).details, operation: 'get', folderId: params.folderId },
              timer.toMetadata(),
            );
          }

          const parsedGetResult = getResult.data as any;

          // Find the specific folder by ID
          const folder = parsedGetResult.items?.find((f: any) => f.id === params.folderId);
          if (!folder) {
            return createErrorResponseV2(
              'folders',
              'NOT_FOUND',
              `Folder not found with ID: ${params.folderId}`,
              undefined,
              { operation: 'get', folderId: params.folderId },
              timer.toMetadata(),
            );
          }

          return createSuccessResponseV2('folders', { folder: { ...folder, operation: 'get' } }, undefined, { ...timer.toMetadata(), operation: 'get', folder_id: params.folderId });
        }

        case 'search': {
          // Direct implementation of search folders by name
          if (!params.searchQuery) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'searchQuery is required for search operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          const searchScript = createListFoldersScript({
            search: params.searchQuery,
            includeHierarchy: true,
            includeProjects: true,
            limit: 100,
          });
          const searchResult = await this.execJson(searchScript);
          if ((searchResult as any).success === false) {
            return createErrorResponseV2(
              'folders',
              'SEARCH_FAILED',
              (searchResult as any).error || 'Search failed',
              undefined,
              { details: (searchResult as any).details, operation: 'search', searchTerm: params.searchQuery },
              timer.toMetadata(),
            );
          }

          const parsedSearchResult = searchResult.data as any;

          return createSuccessResponseV2('folders', { folders: parsedSearchResult.items ?? parsedSearchResult.folders ?? [] }, undefined, { ...timer.toMetadata(), operation: 'search', search_term: params.searchQuery, total_matches: parsedSearchResult.summary?.total || parsedSearchResult.items?.length || 0 });
        }

        case 'projects': {
          // Direct implementation of get projects within a folder
          if (!params.folderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId is required for projects operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          // Get folder with projects included
          const projectsScript = createListFoldersScript({
            includeHierarchy: false,
            includeProjects: true,
            limit: 1000,
          });
          const projectsResult = await this.execJson(projectsScript);
          if ((projectsResult as any).success === false) {
            return createErrorResponseV2(
              'folders',
              'GET_PROJECTS_FAILED',
              (projectsResult as any).error || 'Get projects failed',
              undefined,
              { details: (projectsResult as any).details, operation: 'get_projects', folderId: params.folderId },
              timer.toMetadata(),
            );
          }

          const parsedProjectsResult = projectsResult.data as any;

          // Find the specific folder by ID and return its projects
          const folderWithProjects = parsedProjectsResult.items?.find((f: any) => f.id === params.folderId);
          if (!folderWithProjects) {
            return createErrorResponseV2(
              'folders',
              'NOT_FOUND',
              `Folder not found with ID: ${params.folderId}`,
              undefined,
              { operation: 'get_projects', folderId: params.folderId },
              timer.toMetadata(),
            );
          }

          const projects = (folderWithProjects as any)?.projects || [];

          return createSuccessResponseV2('folders', { projects, count: projects.length, operation: 'get_projects' }, undefined, { ...timer.toMetadata(), operation: 'get_projects', folder_id: params.folderId, project_count: projects.length });
        }

        // Management operations
        case 'create': {
          if (!params.name) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'name is required for create operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          // Direct implementation of create folder
          const createScript = this.omniAutomation.buildScript(CREATE_FOLDER_SCRIPT, {
            name: params.name,
            options: { parent: params.parentFolderId },
          });
          const createResult = await this.execJson(createScript);

          if (!isScriptSuccess(createResult)) {
            const invalid = createResult.error === 'Invalid result';
            const code = invalid ? 'INVALID_RESULT' : 'CREATE_FAILED';
            const message = invalid ? 'Script completed but returned unexpected result format' : createResult.error;
            return createErrorResponseV2(
              'folders',
              code,
              message,
              invalid ? 'Ensure the script returns { folder: {...} }' : undefined,
              { details: createResult.details, operation: 'create' },
              timer.toMetadata(),
            );
          }

          // Invalidate cache after successful creation
          this.cache.invalidate('folders');

          const createdFolder = createResult.data as any;
          return createSuccessResponseV2('folders', { folder: createdFolder }, undefined, { ...timer.toMetadata(), operation: 'create', created_id: createdFolder?.id });
        }

        case 'update': {
          // Direct implementation of update folder
          if (!params.folderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId is required for update operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          const updates: any = {};
          if (params.name !== undefined) updates.name = params.name;
          if (params.status !== undefined) updates.status = params.status;

          const updateScript = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
            folderId: params.folderId,
            updates,
          });
          const updateResult = await this.execJson(updateScript);

          if (!isScriptSuccess(updateResult)) {
            return createErrorResponseV2(
              'folders',
              'UPDATE_FAILED',
              updateResult.error,
              'Verify folderId and parameters',
              { details: updateResult.details, operation: 'update' },
              timer.toMetadata(),
            );
          }

          // Invalidate cache after successful update
          this.cache.invalidate('folders');
          this.cache.invalidate('projects');

          const parsedUpdateResult = updateResult.data as any;

          return createSuccessResponseV2('folders', { folder: { ...parsedUpdateResult, operation: 'update' } }, undefined, { ...timer.toMetadata(), operation: 'update', updated_id: params.folderId, changes: parsedUpdateResult.changes });
        }

        case 'delete': {
          // Direct implementation of delete folder
          if (!params.folderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId is required for delete operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          const deleteScript = this.omniAutomation.buildScript(DELETE_FOLDER_SCRIPT, {
            folderId: params.folderId,
            options: { moveContentsTo: params.parentFolderId, force: false },
          });
          const deleteResult = await this.execJson(deleteScript);

          if (!isScriptSuccess(deleteResult)) {
            return createErrorResponseV2(
              'folders',
              'DELETE_FAILED',
              deleteResult.error,
              undefined,
              { details: deleteResult.details, operation: 'delete' },
              timer.toMetadata(),
            );
          }

          // Invalidate cache after successful deletion
          this.cache.invalidate('folders');
          this.cache.invalidate('projects');

          const parsedDeleteResult = deleteResult.data as any;

          return createSuccessResponseV2('folders', { folder: { ...parsedDeleteResult, operation: 'delete' } }, undefined, { ...timer.toMetadata(), operation: 'delete', deleted_id: params.folderId, moved_to: parsedDeleteResult.folder?.parent, moved_contents: parsedDeleteResult.changes });
        }

        case 'move': {
          // Direct implementation of move folder
          if (!params.folderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId is required for move operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          const moveScript = this.omniAutomation.buildScript(MOVE_FOLDER_SCRIPT, {
            folderId: params.folderId,
            options: { newParent: params.parentFolderId, position: undefined, relativeToFolder: undefined },
          });
          const moveResult = await this.execJson(moveScript);

          if (!isScriptSuccess(moveResult)) {
            return createErrorResponseV2(
              'folders',
              'MOVE_FAILED',
              moveResult.error,
              undefined,
              { details: moveResult.details, operation: 'move' },
              timer.toMetadata(),
            );
          }

          // Invalidate cache after successful move
          this.cache.invalidate('folders');

          const parsedMoveResult = moveResult.data as any;

          return createSuccessResponseV2('folders', { folder: { ...parsedMoveResult, operation: 'move' } }, undefined, { ...timer.toMetadata(), operation: 'move', moved_id: params.folderId, old_parent: parsedMoveResult.folder?.parent, new_parent: params.parentFolderId });
        }

        case 'duplicate': {
          // Direct implementation placeholder - not implemented in original ManageFolderTool either
          return createErrorResponseV2(
            'folders',
            'NOT_IMPLEMENTED',
            'Duplicate operation is not yet implemented. Use create operation instead.',
            undefined,
            { operation: 'duplicate', folderId: params.folderId, newName: params.duplicateName },
            timer.toMetadata(),
          );
        }

        case 'set_status': {
          // Direct implementation of set status (uses update script)
          if (!params.folderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId is required for set_status operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          if (!params.status) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'status is required for set_status operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }

          // Status change is just an update operation
          const statusScript = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
            folderId: params.folderId,
            updates: { status: params.status },
          });
          const statusResult = await this.execJson(statusScript);

          if (!isScriptSuccess(statusResult)) {
            return createErrorResponseV2(
              'folders',
              'SET_STATUS_FAILED',
              statusResult.error,
              undefined,
              { details: statusResult.details, operation: 'set_status' },
              timer.toMetadata(),
            );
          }

          // Invalidate cache after successful status change
          this.cache.invalidate('folders');
          this.cache.invalidate('projects');

          const parsedStatusResult = statusResult.data as any;

          return createSuccessResponseV2('folders', { folder: { ...parsedStatusResult, operation: 'set_status' } }, undefined, { ...timer.toMetadata(), operation: 'set_status', updated_id: params.folderId, new_status: params.status });
        }

        default:
          return createErrorResponseV2(
            'folders',
            'INVALID_OPERATION',
            `Invalid operation: ${String(operation)}`,
            undefined,
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Helper to execute JSON scripts with consistent error handling
  private async execJson(script: string, _schema?: any): Promise<any> {
    const anyOmni: any = this.omniAutomation as any;
    const res = typeof anyOmni.executeJson === 'function' ? await anyOmni.executeJson(script) : await anyOmni.execute(script);
    if (res === null || res === undefined) {
      return { success: false, error: 'NULL_RESULT' };
    }
    if (res && typeof res === 'object') {
      const obj: any = res;
      if (obj.success === false) return obj;
      // Treat presence of folders/items or ok/updated flags as success
      if (Array.isArray(obj.folders) || Array.isArray(obj.items) || obj.ok === true || typeof obj.updated === 'number') {
        return { success: true, data: obj };
      }
    }
    // Fallback: wrap as success with raw data
    return { success: true, data: res };
  }
}
