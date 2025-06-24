import { BaseTool } from '../base.js';
import { CREATE_PROJECT_SCRIPT } from '../../omnifocus/scripts/project-crud.js';

export class CreateProjectTool extends BaseTool {
  name = 'create_project';
  description = 'Create a new project in OmniFocus';
  
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
      parentFolder: {
        type: 'string',
        description: 'Name of parent folder (optional)',
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
    parentFolder?: string;
  }): Promise<any> {
    try {
      const { name, ...options } = args;
      
      // Clear project cache since we're creating
      this.cache.clear('projects');
      
      // Execute create script
      const script = this.omniAutomation.buildScript(CREATE_PROJECT_SCRIPT, { 
        name,
        options
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }
}