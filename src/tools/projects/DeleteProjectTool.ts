import { BaseTool } from '../base.js';
import { DELETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects.js';

export class DeleteProjectTool extends BaseTool {
  name = 'delete_project';
  description = 'Delete a project from OmniFocus';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'ID of the project to delete',
      },
      deleteTasks: {
        type: 'boolean',
        description: 'Delete all tasks in the project (otherwise they move to Inbox)',
        default: false,
      },
    },
    required: ['projectId'],
  };

  async execute(args: { 
    projectId: string;
    deleteTasks?: boolean;
  }): Promise<any> {
    try {
      const { projectId, deleteTasks = false } = args;
      
      // Clear project cache since we're deleting
      this.cache.clear('projects');
      
      // Try JXA first, fall back to URL scheme if access denied or parameter missing
      try {
        const script = this.omniAutomation.buildScript(DELETE_PROJECT_SCRIPT, { 
          projectId,
          deleteTasks: Boolean(deleteTasks)
        });
        const result = await this.omniAutomation.execute<any>(script);
        
        if (result.error) {
          // If error contains "parameter is missing" or "access not allowed", use URL scheme
          if (result.message && 
              (result.message.toLowerCase().includes('parameter is missing') ||
               result.message.toLowerCase().includes('access not allowed'))) {
            this.logger.info('JXA failed, falling back to URL scheme for project deletion');
            return await this.executeViaUrlScheme(args);
          }
          return result;
        }
        
        this.logger.info(`Deleted project via JXA: ${result.projectName} (${projectId})`);
        return result;
      } catch (jxaError: any) {
        // If JXA fails with permission error, use URL scheme
        if (jxaError.message && 
            (jxaError.message.toLowerCase().includes('parameter is missing') ||
             jxaError.message.toLowerCase().includes('access not allowed'))) {
          this.logger.info('JXA failed, falling back to URL scheme for project deletion');
          return await this.executeViaUrlScheme(args);
        }
        throw jxaError;
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async executeViaUrlScheme(args: { 
    projectId: string;
    deleteTasks?: boolean;
  }): Promise<any> {
    // For URL scheme, we'll use a simpler script that just marks project as dropped
    const omniScript = `
      const projectId = "${args.projectId}";
      
      try {
        const projects = flattenedProjects;
        let targetProject = null;
        
        projects.forEach(project => {
          if (project.id() === projectId) {
            targetProject = project;
          }
        });
        
        if (!targetProject) {
          throw new Error('Project not found');
        }
        
        // Mark as dropped since actual deletion might not be available via URL scheme
        targetProject.status = Project.Status.Dropped;
        targetProject.completionDate = new Date();
        
        return true;
      } catch (error) {
        throw new Error('Failed to drop project: ' + error.message);
      }
    `;
    
    await this.omniAutomation.executeViaUrlScheme(omniScript);
    
    this.logger.info(`Marked project as dropped via URL scheme: ${args.projectId}`);
    
    // Return expected format since URL scheme doesn't return detailed results
    return {
      success: true,
      projectName: 'Project marked as dropped',
      tasksDeleted: 0,
      tasksOrphaned: 0,
      message: 'Project marked as dropped (deletion not available via URL scheme)',
      note: 'Used URL scheme fallback - project marked as dropped instead of deleted'
    };
  }
}