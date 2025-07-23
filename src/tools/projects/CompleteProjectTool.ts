import { BaseTool } from '../base.js';
import { COMPLETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class CompleteProjectTool extends BaseTool {
  name = 'complete_project';
  description = 'Mark a project as completed in OmniFocus';

  inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'ID of the project to complete',
      },
      completeAllTasks: {
        type: 'boolean',
        description: 'Complete all incomplete tasks in the project',
        default: false,
      },
    },
    required: ['projectId'],
  };

  async execute(args: {
    projectId: string;
    completeAllTasks?: boolean;
  }): Promise<any> {
    const timer = new OperationTimer();

    try {
      const { projectId, completeAllTasks = false } = args;

      // Execute complete script (ensure completeAllTasks is always a boolean)
      const script = this.omniAutomation.buildScript(COMPLETE_PROJECT_SCRIPT, {
        projectId,
        completeAllTasks: Boolean(completeAllTasks),
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return createErrorResponse(
          'complete_project',
          'SCRIPT_ERROR',
          result.message || 'Failed to complete project',
          { details: result.details },
          timer.toMetadata(),
        );
      }

      // Only invalidate cache after successful completion
      this.cache.invalidate('projects');
      // Also invalidate analytics since project completion affects productivity stats
      this.cache.invalidate('analytics');

      // Parse the result if it's a string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse complete project result: ${result}`);
        parsedResult = result;
      }

      return createEntityResponse(
        'complete_project',
        'project',
        parsedResult,
        {
          ...timer.toMetadata(),
          completed_id: projectId,
          complete_all_tasks: completeAllTasks,
          input_params: { projectId, completeAllTasks },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
