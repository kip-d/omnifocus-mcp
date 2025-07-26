import { z } from 'zod';
import { BaseTool } from '../base.js';
import { MANAGE_TAGS_SCRIPT } from '../../omnifocus/scripts/tags.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ManageTagsSchema } from '../schemas/tag-schemas.js';

export class ManageTagsTool extends BaseTool<typeof ManageTagsSchema> {
  name = 'manage_tags';
  description = 'Create, rename, or delete tags in OmniFocus';
  schema = ManageTagsSchema;

  async executeValidated(args: z.infer<typeof ManageTagsSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { action, tagName, newName, targetTag } = args;

      // Validation is now handled by Zod schema

      // Execute script
      const script = this.omniAutomation.buildScript(MANAGE_TAGS_SCRIPT, {
        action,
        tagName,
        newName,
        targetTag,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'manage_tags',
          'SCRIPT_ERROR',
          result.message || 'Failed to manage tag',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Only invalidate cache after successful tag modification
      this.cache.invalidate('tags');
      // Tag changes might affect task filtering, so invalidate tasks too
      this.cache.invalidate('tasks');

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse manage tags result: ${result}`);
        parsedResult = result;
      }

      return createSuccessResponse(
        'manage_tags',
        {
          action: parsedResult.action || action,
          message: parsedResult.message,
          tag_name: parsedResult.tagName || tagName,
          ...(parsedResult.oldName && { old_name: parsedResult.oldName }),
          ...(parsedResult.newName && { new_name: parsedResult.newName }),
          ...(parsedResult.targetTag && { target_tag: parsedResult.targetTag }),
          ...(parsedResult.tasksAffected !== undefined && { tasks_affected: parsedResult.tasksAffected }),
          ...(parsedResult.tasksMerged !== undefined && { tasks_merged: parsedResult.tasksMerged }),
        },
        {
          ...timer.toMetadata(),
          action: action,
          input_params: args,
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
