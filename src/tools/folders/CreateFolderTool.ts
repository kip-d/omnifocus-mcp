import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_FOLDER_SCRIPT } from '../../omnifocus/scripts/folders/create-folder.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { CreateFolderSchema } from '../schemas/folder-schemas.js';

export class CreateFolderTool extends BaseTool<typeof CreateFolderSchema> {
  name = 'create_folder';
  description = '[DEPRECATED] Create a new folder in OmniFocus. Use manage_folder with operation:"create" instead. Specify parent folder for hierarchy organization, position (beginning/ending/before/after), and status. Returns folder ID. Invalidates cache.';
  schema = CreateFolderSchema;

  async executeValidated(args: z.infer<typeof CreateFolderSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { name, ...options } = args;

      // Execute create script
      const script = this.omniAutomation.buildScript(CREATE_FOLDER_SCRIPT, {
        name,
        options,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'create_folder',
          'SCRIPT_ERROR',
          result.message || result.error || 'Failed to create folder',
          { details: result.details, rawResult: result },
          timer.toMetadata(),
        );
      }

      // Only invalidate cache after successful creation
      this.cache.invalidate('folders');

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse create folder result: ${result}`);
        parsedResult = result;
      }

      // Check for errors in parsed result
      if (parsedResult.error) {
        return createErrorResponse(
          'create_folder',
          'CREATION_FAILED',
          parsedResult.message || parsedResult.error || 'Failed to create folder',
          { details: parsedResult.details, rawResult: parsedResult },
          timer.toMetadata(),
        );
      }

      // Check if we have a folder result
      if (!parsedResult.folder && !parsedResult.id) {
        return createErrorResponse(
          'create_folder',
          'INVALID_RESULT',
          'Script completed but returned unexpected result format',
          { rawResult: parsedResult },
          timer.toMetadata(),
        );
      }

      return createEntityResponse(
        'create_folder',
        'folder',
        {
          folderId: parsedResult.folder?.id || parsedResult.id,
          name: parsedResult.folder?.name || args.name,
          parent: parsedResult.folder?.parent || args.parent,
          status: parsedResult.folder?.status || args.status || 'active',
        },
        {
          ...timer.toMetadata(),
          created_id: parsedResult.folder?.id || parsedResult.id,
          parent: args.parent,
          input_params: {
            name: args.name,
            has_parent: !!args.parent,
            position: args.position || 'ending',
            status: args.status || 'active',
            has_relative_folder: !!args.relativeToFolder,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
