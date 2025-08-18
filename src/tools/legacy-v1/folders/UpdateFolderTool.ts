import { z } from 'zod';
import { BaseTool } from '../../base.js';
import { UPDATE_FOLDER_SCRIPT } from '../../../omnifocus/scripts/folders/update-folder.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../../utils/response-format.js';
import { UpdateFolderSchema } from '../../schemas/folder-schemas.js';

export class UpdateFolderTool extends BaseTool<typeof UpdateFolderSchema> {
  name = 'update_folder';
  description = '[DEPRECATED] Update folder properties in OmniFocus. Use manage_folder with operation:"update" instead. Change name and/or status (active/dropped). Validates duplicate names within parent. Invalidates cache.';
  schema = UpdateFolderSchema;

  async executeValidated(args: z.infer<typeof UpdateFolderSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { folderId, updates } = args;

      // Execute update script
      const script = this.omniAutomation.buildScript(UPDATE_FOLDER_SCRIPT, {
        folderId,
        updates,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'update_folder',
          'SCRIPT_ERROR',
          result.message || 'Failed to update folder',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Only invalidate cache after successful update
      this.cache.invalidate('folders');
      this.cache.invalidate('projects'); // Projects cache may include folder info

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse update folder result: ${result}`);
        parsedResult = result;
      }

      return createEntityResponse(
        'update_folder',
        'folder',
        parsedResult,
        {
          ...timer.toMetadata(),
          updated_id: folderId,
          changes: parsedResult.changes,
          input_params: {
            folderId,
            updates: Object.keys(updates),
            name_updated: !!updates.name,
            status_updated: !!updates.status,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
