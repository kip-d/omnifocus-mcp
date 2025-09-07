import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ManageFolderTool } from './ManageFolderTool.js';
import { QueryFoldersTool } from './QueryFoldersTool.js';
import { createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
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

  private manageTool: ManageFolderTool;
  private queryTool: QueryFoldersTool;

  constructor(cache: any) {
    super(cache);
    // Initialize the individual tools
    this.manageTool = new ManageFolderTool(cache);
    this.queryTool = new QueryFoldersTool(cache);
  }

  async executeValidated(args: FoldersInput): Promise<any> {
    const timer = new OperationTimerV2();
    const { operation, ...params } = args;

    try {
      // Route to appropriate tool based on operation type
      switch (operation) {
        // Query operations
        case 'list':
          return await this.queryTool.execute({
            operation: 'list',
            includeProjects: params.includeProjects,
            includeSubfolders: params.includeSubfolders,
          });

        case 'get':
          if (!params.folderId && !params.folderName) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId or folderName is required for get operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }
          return await this.queryTool.execute({
            operation: 'get',
            folderId: params.folderId,
            folderName: params.folderName,
          });

        case 'search':
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
          return await this.queryTool.execute({
            operation: 'search',
            searchQuery: params.searchQuery,
          });

        case 'projects':
          if (!params.folderId && !params.folderName) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId or folderName is required for projects operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }
          return await this.queryTool.execute({
            operation: 'projects',
            folderId: params.folderId,
            folderName: params.folderName,
          });

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
          return await this.manageTool.execute({
            operation: 'create',
            name: params.name,
            parentFolderId: params.parentFolderId,
          });

        case 'update':
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
          if (!params.name) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'name is required for update operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }
          return await this.manageTool.execute({
            operation: 'update',
            folderId: params.folderId,
            name: params.name,
          });

        case 'delete':
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
          return await this.manageTool.execute({
            operation: 'delete',
            folderId: params.folderId,
          });

        case 'move':
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
          if (!params.parentFolderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'parentFolderId is required for move operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }
          return await this.manageTool.execute({
            operation: 'move',
            folderId: params.folderId,
            parentFolderId: params.parentFolderId,
          });

        case 'duplicate':
          if (!params.folderId) {
            return createErrorResponseV2(
              'folders',
              'MISSING_PARAMETER',
              'folderId is required for duplicate operation',
              undefined,
              { operation },
              timer.toMetadata(),
            );
          }
          return await this.manageTool.execute({
            operation: 'duplicate',
            folderId: params.folderId,
            duplicateName: params.duplicateName,
          });

        case 'set_status':
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
          return await this.manageTool.execute({
            operation: 'set_status',
            folderId: params.folderId,
            status: params.status,
            includeContents: params.includeContents,
          });

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
}
