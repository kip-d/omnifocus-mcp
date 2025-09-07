import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/create-folder.js';
import { UPDATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/update-folder.js';
import { DELETE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/delete-folder.js';
import { MOVE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/move-folder.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { isScriptSuccess } from '../../omnifocus/script-result-types.js';
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
    const timer = new OperationTimerV2();
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
          return createErrorResponseV2(
            'manage_folder',
            'INVALID_OPERATION',
            `Unsupported operation: ${String(operation)}`,
            'Use create|update|delete|move|set_status|duplicate',
            { operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async handleCreate(args: z.infer<typeof CreateFolderOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { name, parent, position, relativeToFolder, status } = args;

    const script = this.omniAutomation.buildScript(CREATE_FOLDER_SCRIPT, {
      name,
      options: { parent, position, relativeToFolder, status },
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      const invalid = result.error === 'Invalid result';
      const code = invalid ? 'INVALID_RESULT' : 'CREATE_FAILED';
      const message = invalid ? 'Script completed but returned unexpected result format' : result.error;
      return createErrorResponseV2(
        'manage_folder',
        code,
        message,
        invalid ? 'Ensure the script returns { folder: {...} }' : undefined,
        { details: result.details, operation: 'create' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful creation
    this.cache.invalidate('folders');

    const parsedResult = result.data as any;

    if (!parsedResult.folder) {
      return createErrorResponseV2(
        'manage_folder',
        'INVALID_RESULT',
        'Script completed but returned unexpected result format',
        'Return object containing folder property',
        { rawResult: parsedResult, operation: 'create' },
        timer.toMetadata(),
      );
    }
    return createSuccessResponseV2('manage_folder', { folder: { folderId: parsedResult.folder.id, name: parsedResult.folder.name, parent: parsedResult.folder.parent, status: parsedResult.folder.status || status || 'active', operation: 'create' } }, undefined, { ...timer.toMetadata(), operation: 'create', created_id: parsedResult.folder.id });
  }

  private async handleUpdate(args: z.infer<typeof UpdateFolderOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { folderId, name, status } = args;
    const updates: any = {};

    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;

    const script = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
      folderId,
      updates,
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'manage_folder',
        'UPDATE_FAILED',
        result.error,
        'Verify folderId and parameters',
        { details: result.details, operation: 'update' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful update
    this.cache.invalidate('folders');
    this.cache.invalidate('projects');

    const parsedResult = result.data as any;

    return createSuccessResponseV2('manage_folder', { folder: { ...parsedResult, operation: 'update' } }, undefined, { ...timer.toMetadata(), operation: 'update', updated_id: folderId, changes: parsedResult.changes });
  }

  private async handleDelete(args: z.infer<typeof DeleteFolderOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { folderId, moveContentsTo, force } = args;

    const script = this.omniAutomation.buildScript(DELETE_FOLDER_SCRIPT, {
      folderId,
      options: { moveContentsTo, force },
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'manage_folder',
        'DELETE_FAILED',
        result.error,
        undefined,
        { details: result.details, operation: 'delete' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful deletion
    this.cache.invalidate('folders');
    this.cache.invalidate('projects');

    const parsedResult = result.data as any;

    return createSuccessResponseV2('manage_folder', { folder: { ...parsedResult, operation: 'delete' } }, undefined, { ...timer.toMetadata(), operation: 'delete', deleted_id: folderId, moved_to: parsedResult.folder?.parent, moved_contents: parsedResult.changes });
  }

  private async handleMove(args: z.infer<typeof MoveFolderOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { folderId, parentId, position, relativeToFolder } = args;

    const script = this.omniAutomation.buildScript(MOVE_FOLDER_SCRIPT, {
      folderId,
      options: { newParent: parentId, position, relativeToFolder },
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'manage_folder',
        'MOVE_FAILED',
        result.error,
        undefined,
        { details: result.details, operation: 'move' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful move
    this.cache.invalidate('folders');

    const parsedResult = result.data as any;

    return createSuccessResponseV2('manage_folder', { folder: { ...parsedResult, operation: 'move' } }, undefined, { ...timer.toMetadata(), operation: 'move', moved_id: folderId, old_parent: parsedResult.folder?.parent, new_parent: parentId });
  }

  private async handleSetStatus(args: z.infer<typeof SetFolderStatusOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { folderId, status } = args;

    // Status change is just an update operation
    const script = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
      folderId,
      updates: { status },
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'manage_folder',
        'SET_STATUS_FAILED',
        result.error,
        undefined,
        { details: result.details, operation: 'set_status' },
        timer.toMetadata(),
      );
    }

    // Invalidate cache after successful status change
    this.cache.invalidate('folders');
    this.cache.invalidate('projects');

    const parsedResult = result.data as any;

    return createSuccessResponseV2('manage_folder', { folder: { ...parsedResult, operation: 'set_status' } }, undefined, { ...timer.toMetadata(), operation: 'set_status', updated_id: folderId, new_status: status });
  }

  private async handleDuplicate(args: z.infer<typeof DuplicateFolderOperationSchema>, timer: OperationTimerV2): Promise<any> {
    const { folderId, newName } = args;

    // For duplication, we need to first get the folder details, then create a new one
    // This is a two-step process since OmniFocus doesn't have native duplicate functionality
    return createErrorResponseV2(
      'manage_folder',
      'NOT_IMPLEMENTED',
      'Duplicate operation is not yet implemented. Use create operation instead.',
      undefined,
      { operation: 'duplicate', folderId, newName },
      timer.toMetadata(),
    );
  }

  // Backward-compatible helper: adapt raw mock results into ScriptResult
  private async execJson(script: string): Promise<any> {
    const anyOmni: any = this.omniAutomation as any;
    const raw = await (typeof anyOmni.execute === 'function' ? anyOmni.execute(script) : anyOmni.executeJson(script));
    if (raw && typeof raw === 'object') {
      const obj: any = raw;
      if (obj.success === false) {
        return { success: false, error: obj.error || 'Operation failed', details: obj.details };
      }
      if (obj.folder || obj.id || obj.deletedFolder) {
        return { success: true, data: obj };
      }
    }
    return { success: false, error: 'Invalid result', details: raw };
  }
}
