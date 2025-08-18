import { z } from 'zod';
import { BaseTool } from '../../base.js';
import { CREATE_PROJECT_SCRIPT } from '../../../omnifocus/scripts/projects.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../../utils/response-format.js';
import { CreateProjectSchema } from '../../schemas/project-schemas.js';

export class CreateProjectTool extends BaseTool<typeof CreateProjectSchema> {
  name = 'create_project';
  description = 'Create a new project in OmniFocus. Specify folder to organize (creates if needed). Set status, flagged, dueDate, deferDate, sequential (for task order). Returns project ID for task assignment. Invalidates cache.';
  schema = CreateProjectSchema;

  async executeValidated(args: z.infer<typeof CreateProjectSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { name, ...options } = args;

      // Execute create script
      const script = this.omniAutomation.buildScript(CREATE_PROJECT_SCRIPT, {
        name,
        options,
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'create_project',
          'SCRIPT_ERROR',
          result.message || 'Failed to create project',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Only invalidate cache after successful creation
      this.cache.invalidate('projects');

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse create project result: ${result}`);
        parsedResult = result;
      }

      // Check for errors in parsed result
      if (parsedResult.error) {
        return createErrorResponse(
          'create_project',
          'CREATION_FAILED',
          parsedResult.message || 'Failed to create project',
          { details: parsedResult.details },
          timer.toMetadata(),
        );
      }

      return createEntityResponse(
        'create_project',
        'project',
        {
          projectId: parsedResult.project?.id || parsedResult.id,
          name: parsedResult.project?.name || args.name,
          folder: args.folder,
          nextReviewDate: parsedResult.project?.nextReviewDate,
          reviewInterval: parsedResult.project?.reviewInterval,
        },
        {
          ...timer.toMetadata(),
          created_id: parsedResult.project?.id || parsedResult.id,
          folder: args.folder,
          input_params: {
            name: args.name,
            has_note: !!args.note,
            has_due_date: !!args.dueDate,
            has_defer_date: !!args.deferDate,
            has_folder: !!args.folder,
            has_review: !!args.reviewInterval,
            flagged: args.flagged || false,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
