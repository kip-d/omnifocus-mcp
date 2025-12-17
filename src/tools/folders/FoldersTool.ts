import { z } from 'zod';
import { BaseTool } from '../base.js';
import { buildListFoldersScriptV3 } from '../../omnifocus/scripts/folders/list-folders-v3.js';
import { CREATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/create-folder.js';
import { UPDATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/update-folder.js';
import { DELETE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/delete-folder.js';
import { MOVE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/move-folder.js';
import {
  createErrorResponseV2,
  createSuccessResponseV2,
  OperationTimerV2,
  StandardResponseV2,
} from '../../utils/response-format.js';
import { isScriptSuccess, isScriptError } from '../../omnifocus/script-result-types.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { FoldersDataV2 } from '../response-types-v2.js';
import { FolderId } from '../../utils/branded-types.js';

// Convert string ID to branded FolderId for type safety (compile-time only, no runtime validation)
const convertToFolderId = (id: string): FolderId => id as FolderId;

// Consolidated folders schema
const FoldersSchema = z.object({
  operation: z
    .enum(['list', 'get', 'search', 'projects', 'create', 'update', 'delete', 'move', 'duplicate', 'set_status'])
    .describe('Operation to perform on folders'),

  // Identification
  folderId: z
    .string()
    .optional()
    .describe('Folder ID (required for get, update, delete, move, duplicate, set_status, projects)'),

  folderName: z.string().optional().describe('Folder name (alternative to folderId for some operations)'),

  // Create/Update parameters
  name: z.string().optional().describe('New folder name (for create/update)'),

  parentFolderId: z.string().optional().describe('Parent folder ID (for create/move)'),

  // Query parameters
  searchQuery: z.string().optional().describe('Search query for folder names (search operation)'),

  includeProjects: coerceBoolean().optional().describe('Include projects in each folder (list operation)'),

  includeSubfolders: coerceBoolean().optional().describe('Include subfolders (list operation)'),

  // Status operation
  status: z.enum(['active', 'dropped']).optional().describe('New status for folder (set_status operation)'),

  includeContents: coerceBoolean().optional().describe('Apply status to all projects in folder (set_status operation)'),

  // Duplicate operation
  duplicateName: z.string().optional().describe('Name for duplicated folder (duplicate operation)'),
});

type FoldersInput = z.infer<typeof FoldersSchema>;

/**
 * Consolidated tool for all folder operations
 * Combines query and management operations into a single tool
 */
export class FoldersTool extends BaseTool<typeof FoldersSchema> {
  name = 'folders';
  description =
    'Query and manage OmniFocus folders. Operations: list (all folders), get (specific folder), search (by name), projects (projects in folder), create, update, delete, move, duplicate, set_status. Consistent with the projects tool pattern.';
  schema = FoldersSchema;
  meta = {
    // Phase 1: Essential metadata
    category: 'Organization' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'mutations', 'hierarchy', 'organization'],
    capabilities: ['list', 'create', 'update', 'delete', 'move'],

    // Phase 2: Capability & Performance Documentation
    maxResults: 500,
    maxQueryDuration: 3000, // 3 seconds
    requiresPermission: true,
    requiredCapabilities: ['read', 'write'],
    limitations: [
      'Maximum 500 folders per query',
      'Folders support hierarchy (parent-child nesting)',
      'Dropped folders cannot be undropped via API',
      'set_status can apply recursively to all projects in folder',
    ],
  };

  constructor(cache: CacheManager) {
    super(cache);
  }

  async executeValidated(args: FoldersInput): Promise<StandardResponseV2<unknown>> {
    const timer = new OperationTimerV2();
    const { operation, ...params } = args;

    // Convert to branded FolderId for type safety
    const brandedFolderId = params.folderId ? convertToFolderId(params.folderId) : undefined;

    try {
      // Route to appropriate tool based on operation type
      switch (operation) {
        // Query operations
        case 'list': {
          // Direct implementation of list folders using v3 OmniJS script
          const {
            includeProjects = params.includeProjects || false,
            includeSubfolders = params.includeSubfolders !== false,
            sortBy = 'path',
            sortOrder = 'asc',
            limit = 100,
          } = params as {
            includeProjects?: boolean;
            includeSubfolders?: boolean;
            sortBy?: string;
            sortOrder?: string;
            limit?: number;
          };

          const cacheKey = `folders_${includeProjects ? 'with_projects' : 'basic'}`;

          // Check cache first
          const cached = this.cache.get('folders', cacheKey);
          if (cached && !includeProjects) {
            // Don't use cache if projects are requested as they may be stale
            this.logger.debug('Returning cached folder data');
            return createSuccessResponseV2(
              'folders',
              {
                folders:
                  (cached as { folders?: unknown[]; items?: unknown[] }).folders ??
                  (cached as { folders?: unknown[]; items?: unknown[] }).items ??
                  cached,
              },
              undefined,
              { ...timer.toMetadata(), operation: 'list', from_cache: true, filters: {} },
            );
          }

          // Use v3 script with OmniJS bridge for accurate hierarchy
          const script = buildListFoldersScriptV3({
            limit,
            includeProjects,
            includeSubfolders,
            sortBy: sortBy as 'name' | 'depth' | 'path',
            sortOrder: sortOrder as 'asc' | 'desc',
          });

          const listResult = await this.execJson(script);
          if (isScriptError(listResult)) {
            return createErrorResponseV2(
              'folders',
              'LIST_FAILED',
              listResult.error || 'Query failed',
              'Ensure folder data is accessible',
              { details: listResult.details, operation: 'list' },
              timer.toMetadata(),
            );
          }

          const parsedListResult = listResult.data as {
            items?: unknown[];
            folders?: unknown[];
            metadata?: { returned_count?: number; total_available?: number };
          };
          const foldersArr = parsedListResult.items || parsedListResult.folders || [];

          // Cache the results for 5 minutes (folders change less frequently)
          if (!includeProjects) {
            this.cache.set('folders', cacheKey, { folders: foldersArr });
          }

          return createSuccessResponseV2('folders', { folders: foldersArr }, undefined, {
            ...timer.toMetadata(),
            operation: 'list',
            total_folders: foldersArr.length,
          });
        }

        case 'get': {
          // Direct implementation of get folder by ID using v3 OmniJS script
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

          // Use v3 script with includeProjects for complete folder info
          const getScript = buildListFoldersScriptV3({
            limit: 1000, // High limit to ensure we get all folders
            includeProjects: true,
            includeSubfolders: true,
          });
          const getResult = await this.execJson(getScript);
          if (isScriptError(getResult)) {
            return createErrorResponseV2(
              'folders',
              'GET_FAILED',
              getResult.error || 'Get failed',
              undefined,
              { details: getResult.details, operation: 'get', folderId: params.folderId },
              timer.toMetadata(),
            );
          }

          const parsedGetResult = getResult.data as { folders?: Array<{ id: string; [key: string]: unknown }> };

          // Find the specific folder by ID
          const folder = parsedGetResult.folders?.find(
            (f: { id: string; [key: string]: unknown }) => f.id === params.folderId,
          );
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

          return createSuccessResponseV2('folders', { folder: { ...folder, operation: 'get' } }, undefined, {
            ...timer.toMetadata(),
            operation: 'get',
            folder_id: params.folderId,
          });
        }

        case 'search': {
          // Direct implementation of search folders by name using v3 OmniJS script
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

          const searchScript = buildListFoldersScriptV3({
            search: params.searchQuery,
            includeProjects: true,
            includeSubfolders: true,
            limit: 100,
          });
          const searchResult = await this.execJson(searchScript);
          if (isScriptError(searchResult)) {
            return createErrorResponseV2(
              'folders',
              'SEARCH_FAILED',
              searchResult.error || 'Search failed',
              undefined,
              { details: searchResult.details, operation: 'search', searchTerm: params.searchQuery },
              timer.toMetadata(),
            );
          }

          const parsedSearchResult = searchResult.data as {
            folders?: unknown[];
            metadata?: { returned_count?: number };
          };

          return createSuccessResponseV2('folders', { folders: parsedSearchResult.folders ?? [] }, undefined, {
            ...timer.toMetadata(),
            operation: 'search',
            search_term: params.searchQuery,
            total_matches: parsedSearchResult.metadata?.returned_count || (parsedSearchResult.folders?.length ?? 0),
          });
        }

        case 'projects': {
          // Direct implementation of get projects within a folder using v3 OmniJS script
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

          // Get folders with projects included using v3
          const projectsScript = buildListFoldersScriptV3({
            includeProjects: true,
            includeSubfolders: false,
            limit: 1000,
          });
          const projectsResult = await this.execJson(projectsScript);
          if (isScriptError(projectsResult)) {
            return createErrorResponseV2(
              'folders',
              'GET_PROJECTS_FAILED',
              projectsResult.error || 'Get projects failed',
              undefined,
              { details: projectsResult.details, operation: 'get_projects', folderId: params.folderId },
              timer.toMetadata(),
            );
          }

          const parsedProjectsResult = projectsResult.data as { folders?: Array<{ id: string; projects?: unknown[] }> };

          // Find the specific folder by ID and return its projects
          const folderWithProjects = parsedProjectsResult.folders?.find(
            (f: { id: string; projects?: unknown[] }) => f.id === params.folderId,
          );
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

          const projects = (folderWithProjects as { projects?: unknown[] })?.projects || [];

          return createSuccessResponseV2(
            'folders',
            { projects, count: projects.length, operation: 'get_projects' },
            undefined,
            {
              ...timer.toMetadata(),
              operation: 'get_projects',
              folder_id: params.folderId,
              project_count: projects.length,
            },
          );
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

          const createdFolder = createResult.data as { id?: string; [key: string]: unknown };
          return createSuccessResponseV2('folders', { folder: { ...createdFolder, operation: 'create' } }, undefined, {
            ...timer.toMetadata(),
            operation: 'create',
            created_id: createdFolder?.id,
          });
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

          const updates: Record<string, unknown> = {};
          if (params.name !== undefined) updates.name = params.name;
          if (params.status !== undefined) updates.status = params.status;

          const updateScript = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
            folderId: brandedFolderId,
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

          const parsedUpdateResult = updateResult.data as { changes?: unknown; [key: string]: unknown };

          return createSuccessResponseV2(
            'folders',
            { folder: { ...parsedUpdateResult, operation: 'update' } },
            undefined,
            {
              ...timer.toMetadata(),
              operation: 'update',
              updated_id: params.folderId,
              changes: parsedUpdateResult.changes as
                | string
                | number
                | boolean
                | unknown[]
                | Record<string, unknown>
                | null,
            },
          );
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
            folderId: brandedFolderId,
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

          // OmniFocus script results are untyped, requiring unsafe operations for data extraction
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          const parsedDeleteResult = deleteResult.data as any;

          return createSuccessResponseV2(
            'folders',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            { folder: { ...parsedDeleteResult, operation: 'delete' } },
            undefined,
            {
              ...timer.toMetadata(),
              operation: 'delete',
              deleted_id: params.folderId,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              moved_to: parsedDeleteResult.folder?.parent,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              moved_contents: parsedDeleteResult.changes,
            },
          );
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
            folderId: brandedFolderId,
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

          // OmniFocus script results are untyped, requiring unsafe operations for data extraction
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          const parsedMoveResult = moveResult.data as any;

          return createSuccessResponseV2(
            'folders',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            { folder: { ...parsedMoveResult, operation: 'move' } },
            undefined,
            {
              ...timer.toMetadata(),
              operation: 'move',
              moved_id: params.folderId,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              old_parent: parsedMoveResult.folder?.parent,
              new_parent: params.parentFolderId,
            },
          );
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
            folderId: brandedFolderId,
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

          // OmniFocus script results are untyped, requiring unsafe operations for data extraction
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          const parsedStatusResult = statusResult.data as any;

          return createSuccessResponseV2(
            'folders',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            { folder: { ...parsedStatusResult, operation: 'set_status' } },
            undefined,
            { ...timer.toMetadata(), operation: 'set_status', updated_id: params.folderId, new_status: params.status },
          );
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
      return this.handleErrorV2<FoldersDataV2>(error);
    }
  }
}
