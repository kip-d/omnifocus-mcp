import { LegacyBaseTool } from '../legacy-base.js';
import { CREATE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class CreateProjectTool extends LegacyBaseTool {
  name = 'create_project';
  description = 'Create a new project in OmniFocus with optional folder placement (creates folder if needed)';

  inputSchema = {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Name of the new project',
      },
      note: {
        type: 'string',
        description: 'Optional note for the project',
      },
      deferDate: {
        type: 'string',
        description: 'Defer date in ISO format',
      },
      dueDate: {
        type: 'string',
        description: 'Due date in ISO format',
      },
      flagged: {
        type: 'boolean',
        description: 'Whether the project is flagged',
      },
      folder: {
        type: 'string',
        description: 'Name of folder to place project in (creates it if it doesn\'t exist)',
      },
    },
    required: ['name'],
  };

  async execute(args: {
    name: string;
    note?: string;
    deferDate?: string;
    dueDate?: string;
    flagged?: boolean;
    folder?: string;
  }): Promise<any> {
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

      return createEntityResponse(
        'create_project',
        'project',
        parsedResult,
        {
          ...timer.toMetadata(),
          created_id: parsedResult.id || parsedResult.projectId,
          folder: args.folder,
          input_params: {
            name: args.name,
            has_note: !!args.note,
            has_due_date: !!args.dueDate,
            has_defer_date: !!args.deferDate,
            has_folder: !!args.folder,
            flagged: args.flagged || false,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
