import { BaseTool } from '../base.js';
import { DELETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/project-crud.js';

export class DeleteProjectTool extends BaseTool {
  name = 'delete_project';
  description = 'Delete a project from OmniFocus';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      projectName: {
        type: 'string',
        description: 'Name of the project to delete',
      },
      deleteTasks: {
        type: 'boolean',
        description: 'Delete all tasks in the project (otherwise they move to Inbox)',
        default: false,
      },
    },
    required: ['projectName'],
  };

  async execute(args: { 
    projectName: string;
    deleteTasks?: boolean;
  }): Promise<any> {
    try {
      const { projectName, deleteTasks = false } = args;
      
      // Clear project cache since we're deleting
      this.cache.clear('projects');
      
      // Execute delete script
      const script = this.omniAutomation.buildScript(DELETE_PROJECT_SCRIPT, { 
        projectName,
        deleteTasks
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }
}