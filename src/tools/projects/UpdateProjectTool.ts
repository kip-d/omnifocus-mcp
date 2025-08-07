import { z } from 'zod';
import { BaseTool } from '../base.js';
import { UPDATE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { UpdateProjectSchema } from '../schemas/project-schemas.js';

export class UpdateProjectTool extends BaseTool<typeof UpdateProjectSchema> {
  name = 'update_project';
  description = 'Update an existing project in OmniFocus. Pass projectId and updates object with fields to change (name, note, status, flagged, folder, dates, sequential). Can move between folders. Invalidates cache.';
  schema = UpdateProjectSchema;

  async executeValidated(args: z.infer<typeof UpdateProjectSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { projectId, updates } = args;

      // Execute update script
      const script = this.omniAutomation.buildScript(UPDATE_PROJECT_SCRIPT, {
        projectId,
        updates,
      });
      const result = await this.omniAutomation.execute<any>(script);

      // Only invalidate cache after successful update
      if (result && !result.error) {
        this.cache.invalidate('projects');

        // Return standardized response
        return createEntityResponse(
          'update_project',
          'project',
          result,
          {
            ...timer.toMetadata(),
            updated_id: projectId,
            input_params: {
              projectId,
              fields_updated: Object.keys(updates),
            },
          },
        );
      }

      // Error case - return standardized error
      return createErrorResponse(
        'update_project',
        'UPDATE_FAILED',
        result.message || 'Failed to update project',
        result,
        timer.toMetadata(),
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
