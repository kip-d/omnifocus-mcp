import { z } from 'zod';
import { BaseTool } from '../base.js';
import { DELETE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/delete-folder.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { DeleteFolderSchema } from '../schemas/folder-schemas.js';

export class DeleteFolderTool extends BaseTool<typeof DeleteFolderSchema> {
  name = 'delete_folder';
  description = '[DEPRECATED] Delete a folder in OmniFocus with safety checks. Use manage_folder with operation:"delete" instead. Can move contents to another folder or root. Use force:true to delete folders with contents. Invalidates cache.';
  schema = DeleteFolderSchema;

  async executeValidated(args: z.infer<typeof DeleteFolderSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { folderId, ...options } = args;

      // Execute delete script
      const script = this.omniAutomation.buildScript(DELETE_FOLDER_SCRIPT, {
        folderId,
        options,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'delete_folder',
          'SCRIPT_ERROR',
          result.message || 'Failed to delete folder',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Only invalidate cache after successful deletion
      this.cache.invalidate('folders');
      this.cache.invalidate('projects'); // Projects cache may include folder info

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse delete folder result: ${result}`);
        parsedResult = result;
      }

      return createEntityResponse(
        'delete_folder',
        'folder',
        parsedResult,
        {
          ...timer.toMetadata(),
          deleted_id: folderId,
          moved_to: parsedResult.movedTo,
          moved_contents: parsedResult.moved,
          input_params: {
            folderId,
            moveContentsTo: options.moveContentsTo,
            force: options.force || false,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
