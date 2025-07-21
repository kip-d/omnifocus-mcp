import { BaseTool } from '../base.js';
import { COMPLETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects.js';

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
    try {
      const { projectId, completeAllTasks = false } = args;
      
      // Execute complete script (ensure completeAllTasks is always a boolean)
      const script = this.omniAutomation.buildScript(COMPLETE_PROJECT_SCRIPT, { 
        projectId,
        completeAllTasks: Boolean(completeAllTasks)
      });
      const result = await this.omniAutomation.execute<any>(script);
      
      // Only invalidate cache after successful completion
      if (result && !result.error) {
        this.cache.invalidate('projects');
        // Also invalidate analytics since project completion affects productivity stats
        this.cache.invalidate('analytics');
      }
      
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }
}