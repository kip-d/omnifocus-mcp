import { BaseTool } from '../base.js';
import { UPDATE_PROJECT_SCRIPT } from '../../omnifocus/scripts/project-crud.js';

export class UpdateProjectTool extends BaseTool {
  name = 'update_project';
  description = 'Update an existing project in OmniFocus';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      projectName: {
        type: 'string',
        description: 'Name of the project to update',
      },
      updates: {
        type: 'object',
        description: 'Fields to update',
        properties: {
          name: {
            type: 'string',
            description: 'New name for the project',
          },
          note: {
            type: 'string',
            description: 'New note (null to clear)',
          },
          deferDate: {
            type: ['string', 'null'],
            description: 'New defer date in ISO format (null to clear)',
          },
          dueDate: {
            type: ['string', 'null'],
            description: 'New due date in ISO format (null to clear)',
          },
          flagged: {
            type: 'boolean',
            description: 'Whether the project is flagged',
          },
          status: {
            type: 'string',
            enum: ['active', 'onHold', 'dropped', 'done'],
            description: 'Project status',
          },
        },
      },
    },
    required: ['projectName', 'updates'],
  };

  async execute(args: { 
    projectName: string;
    updates: {
      name?: string;
      note?: string | null;
      deferDate?: string | null;
      dueDate?: string | null;
      flagged?: boolean;
      status?: string;
    };
  }): Promise<any> {
    try {
      const { projectName, updates } = args;
      
      // Clear project cache since we're updating
      this.cache.clear('projects');
      
      // Execute update script
      const script = this.omniAutomation.buildScript(UPDATE_PROJECT_SCRIPT, { 
        projectName,
        updates
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }
}