import { z } from 'zod';
import { BaseTool } from '../base.js';
import { DELETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { DeleteProjectSchema } from '../schemas/project-schemas.js';

export class DeleteProjectTool extends BaseTool<typeof DeleteProjectSchema> {
  name = 'delete_project';
  description = 'Delete a project permanently from OmniFocus. Set deleteTasks=true to delete all tasks (otherwise move to inbox). This cannot be undone. Invalidates cache.';
  schema = DeleteProjectSchema;

  async executeValidated(args: z.infer<typeof DeleteProjectSchema>): Promise<any> {
    try {
      const { projectId, deleteTasks = false } = args;

      // Try JXA first, fall back to URL scheme if access denied or parameter missing
      try {
        const script = this.omniAutomation.buildScript(DELETE_PROJECT_SCRIPT, {
          projectId,
          deleteTasks: Boolean(deleteTasks),
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

        // Invalidate cache after successful deletion
        this.cache.invalidate('projects');

        this.logger.info(`Deleted project via JXA: ${result.projectName} (${projectId})`);

        // Parse the result if it's a string
        let parsedResult;
        try {
          parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
        } catch (parseError) {
          this.logger.error(`Failed to parse delete project result: ${result}`);
          parsedResult = result;
        }

        return createSuccessResponse(
          'delete_project',
          {
            message: `Project '${parsedResult.projectName || 'Unknown'}' deleted successfully`,
            deleted_id: projectId,
            project_name: parsedResult.projectName,
            tasks_deleted: parsedResult.tasksDeleted || 0,
            tasks_orphaned: parsedResult.tasksOrphaned || 0,
          },
          {
            delete_tasks: args.deleteTasks || false,
            method: 'jxa',
          },
        );
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
    const timer = new OperationTimer();
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

    // Invalidate cache after successful URL scheme execution
    this.cache.invalidate('projects');

    this.logger.info(`Marked project as dropped via URL scheme: ${args.projectId}`);

    // Return standardized format since URL scheme doesn't return detailed results
    return createSuccessResponse(
      'delete_project',
      {
        message: 'Project marked as dropped (deletion not available via URL scheme)',
        deleted_id: args.projectId,
        project_name: 'Project marked as dropped',
        tasks_deleted: 0,
        tasks_orphaned: 0,
      },
      {
        ...timer.toMetadata(),
        delete_tasks: args.deleteTasks || false,
        method: 'url_scheme',
        note: 'Used URL scheme fallback - project marked as dropped instead of deleted',
      },
    );
  }
}
