import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/create-folder.js';
import { UPDATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/update-folder.js';
import { DELETE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/delete-folder.js';
import { MOVE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/move-folder.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import {
  CreateFolderOperationSchema,
  UpdateFolderOperationSchema,
  DeleteFolderOperationSchema,
  MoveFolderOperationSchema,
  SetFolderStatusOperationSchema,
  DuplicateFolderOperationSchema,
  ManageFolderSchema,
} from '../schemas/folder-schemas.js';

export class ManageFolderTool extends BaseTool<typeof ManageFolderSchema> {
  name = 'manage_folder';
  description = 'Unified tool for folder management operations: create, update, delete, move, set_status, and duplicate folders. Each operation has specific required parameters.';
  schema = ManageFolderSchema;

  async executeValidated(args: z.infer<typeof ManageFolderSchema>): Promise<any> {
    const timer = new OperationTimer();
    const { operation } = args;

    try {
      switch (operation) {
        case 'create':
          return await this.handleCreate(args, timer);
        case 'update':
          return await this.handleUpdate(args, timer);
        case 'delete':
          return await this.handleDelete(args, timer);
        case 'move':
          return await this.handleMove(args, timer);
        case 'set_status':
          return await this.handleSetStatus(args, timer);
        case 'duplicate':
          return await this.handleDuplicate(args, timer);
        default:
          return createErrorResponse(
            'manage_folder',
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

  private async handleCreate(args: z.infer<typeof CreateFolderOperationSchema>, timer: OperationTimer): Promise<any> {
    const { name, parent, position, relativeToFolder, status } = args;

    const script = this.omniAutomation.buildScript(CREATE_FOLDER_SCRIPT, {
      name,
      options: { parent, position, relativeToFolder, status },
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (result.error) {
      return createErrorResponse(
        'manage_folder',
        'CREATE_FAILED',
        result.message || result.error || 'Failed to create folder',
        { details: result.details, rawResult: result, operation: 'create' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful creation
    this.cache.invalidate('folders');

    let parsedResult;
    try {
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      this.logger.error(`Failed to parse create folder result: ${result}`);
      parsedResult = result;
    }

    if (parsedResult.error) {
      return createErrorResponse(
        'manage_folder',
        'CREATE_FAILED',
        parsedResult.message || parsedResult.error || 'Failed to create folder',
        { details: parsedResult.details, rawResult: parsedResult, operation: 'create' },
        timer.toMetadata(),
      );
    }

    if (!parsedResult.folder && !parsedResult.id) {
      return createErrorResponse(
        'manage_folder',
        'INVALID_RESULT',
        'Script completed but returned unexpected result format',
        { rawResult: parsedResult, operation: 'create' },
        timer.toMetadata(),
      );
    }

    return createEntityResponse(
      'manage_folder',
      'folder',
      {
        folderId: parsedResult.folder?.id || parsedResult.id,
        name: parsedResult.folder?.name || name,
        parent: parsedResult.folder?.parent || parent,
        status: parsedResult.folder?.status || status || 'active',
        operation: 'create',
      },
      {
        ...timer.toMetadata(),
        operation: 'create',
        created_id: parsedResult.folder?.id || parsedResult.id,
      },
    );
  }

  private async handleUpdate(args: z.infer<typeof UpdateFolderOperationSchema>, timer: OperationTimer): Promise<any> {
    const { folderId, name, status } = args;
    const updates: any = {};

    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;

    const script = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
      folderId,
      updates,
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (result.error) {
      return createErrorResponse(
        'manage_folder',
        'UPDATE_FAILED',
        result.message || 'Failed to update folder',
        { details: result.details, operation: 'update' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful update
    this.cache.invalidate('folders');
    this.cache.invalidate('projects');

    let parsedResult;
    try {
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      this.logger.error(`Failed to parse update folder result: ${result}`);
      parsedResult = result;
    }

    return createEntityResponse(
      'manage_folder',
      'folder',
      { ...parsedResult, operation: 'update' },
      {
        ...timer.toMetadata(),
        operation: 'update',
        updated_id: folderId,
        changes: parsedResult.changes,
      },
    );
  }

  private async handleDelete(args: z.infer<typeof DeleteFolderOperationSchema>, timer: OperationTimer): Promise<any> {
    const { folderId, moveContentsTo, force } = args;

    const script = this.omniAutomation.buildScript(DELETE_FOLDER_SCRIPT, {
      folderId,
      options: { moveContentsTo, force },
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (result.error) {
      return createErrorResponse(
        'manage_folder',
        'DELETE_FAILED',
        result.message || 'Failed to delete folder',
        { details: result.details, operation: 'delete' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful deletion
    this.cache.invalidate('folders');
    this.cache.invalidate('projects');

    let parsedResult;
    try {
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      this.logger.error(`Failed to parse delete folder result: ${result}`);
      parsedResult = result;
    }

    return createEntityResponse(
      'manage_folder',
      'folder',
      { ...parsedResult, operation: 'delete' },
      {
        ...timer.toMetadata(),
        operation: 'delete',
        deleted_id: folderId,
        moved_to: parsedResult.movedTo,
        moved_contents: parsedResult.moved,
      },
    );
  }

  private async handleMove(args: z.infer<typeof MoveFolderOperationSchema>, timer: OperationTimer): Promise<any> {
    const { folderId, parentId, position, relativeToFolder } = args;

    const script = this.omniAutomation.buildScript(MOVE_FOLDER_SCRIPT, {
      folderId,
      options: { newParent: parentId, position, relativeToFolder },
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (result.error) {
      return createErrorResponse(
        'manage_folder',
        'MOVE_FAILED',
        result.message || 'Failed to move folder',
        { details: result.details, operation: 'move' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful move
    this.cache.invalidate('folders');

    let parsedResult;
    try {
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      this.logger.error(`Failed to parse move folder result: ${result}`);
      parsedResult = result;
    }

    return createEntityResponse(
      'manage_folder',
      'folder',
      { ...parsedResult, operation: 'move' },
      {
        ...timer.toMetadata(),
        operation: 'move',
        moved_id: folderId,
        old_parent: parsedResult.folder?.oldParent,
        new_parent: parsedResult.folder?.newParent,
      },
    );
  }

  private async handleSetStatus(args: z.infer<typeof SetFolderStatusOperationSchema>, timer: OperationTimer): Promise<any> {
    const { folderId, status } = args;

    // Status change is just an update operation
    const script = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
      folderId,
      updates: { status },
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (result.error) {
      return createErrorResponse(
        'manage_folder',
        'SET_STATUS_FAILED',
        result.message || 'Failed to set folder status',
        { details: result.details, operation: 'set_status' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful status change
    this.cache.invalidate('folders');
    this.cache.invalidate('projects');

    let parsedResult;
    try {
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      this.logger.error(`Failed to parse set status result: ${result}`);
      parsedResult = result;
    }

    return createEntityResponse(
      'manage_folder',
      'folder',
      { ...parsedResult, operation: 'set_status' },
      {
        ...timer.toMetadata(),
        operation: 'set_status',
        updated_id: folderId,
        new_status: status,
      },
    );
  }

  private async handleDuplicate(args: z.infer<typeof DuplicateFolderOperationSchema>, timer: OperationTimer): Promise<any> {
    const { folderId, newName } = args;

    // For duplication, we need to first get the folder details, then create a new one
    // This is a two-step process since OmniFocus doesn't have native duplicate functionality
    return createErrorResponse(
      'manage_folder',
      'NOT_IMPLEMENTED',
      'Duplicate operation is not yet implemented. Use create operation instead.',
      { operation: 'duplicate', folderId, newName },
      timer.toMetadata(),
    );
  }
}
