import { z } from 'zod';
import { BaseTool } from '../base.js';
import { MOVE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/move-folder.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { MoveFolderSchema } from '../schemas/folder-schemas.js';

export class MoveFolderTool extends BaseTool<typeof MoveFolderSchema> {
  name = 'move_folder';
  description = '[DEPRECATED] Move a folder within the OmniFocus hierarchy. Use manage_folder with operation:"move" instead. Change parent folder and position (beginning/ending/before/after). Prevents circular hierarchies and duplicate names. Invalidates cache.';
  schema = MoveFolderSchema;

  async executeValidated(args: z.infer<typeof MoveFolderSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { folderId, ...options } = args;

      // Execute move script
      const script = this.omniAutomation.buildScript(MOVE_FOLDER_SCRIPT, {
        folderId,
        options,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'move_folder',
          'SCRIPT_ERROR',
          result.message || 'Failed to move folder',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Only invalidate cache after successful move
      this.cache.invalidate('folders');

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse move folder result: ${result}`);
        parsedResult = result;
      }

      return createEntityResponse(
        'move_folder',
        'folder',
        parsedResult,
        {
          ...timer.toMetadata(),
          moved_id: folderId,
          old_parent: parsedResult.folder?.oldParent,
          new_parent: parsedResult.folder?.newParent,
          position: parsedResult.folder?.position,
          input_params: {
            folderId,
            newParent: options.newParent,
            position: options.position || 'ending',
            has_relative_folder: !!options.relativeToFolder,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
