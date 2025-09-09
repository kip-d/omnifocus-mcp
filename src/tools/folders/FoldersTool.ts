import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createListFoldersScript } from '../../omnifocus/scripts/folders/list-folders.js';
import { CREATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/create-folder.js';
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
        case 'list':
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

        case 'get':
        case 'search':  
        case 'projects':
          // TODO: Implement these operations in future phases
          return createErrorResponseV2(
            'folders',
            'NOT_IMPLEMENTED',
            `Operation '${operation}' not yet implemented in consolidated version`,
            'Use individual tools for now',
            { operation },
            timer.toMetadata(),
          );

        // Management operations
        case 'create':
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

        case 'update':
        case 'delete':
        case 'move':
        case 'duplicate':
        case 'set_status':
          // TODO: Implement these operations in future phases
          return createErrorResponseV2(
            'folders',
            'NOT_IMPLEMENTED',
            `Operation '${operation}' not yet implemented in consolidated version`,
            'Use individual tools for now',
            { operation },
            timer.toMetadata(),
          );

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
