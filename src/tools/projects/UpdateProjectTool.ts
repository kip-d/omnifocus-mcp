import { BaseTool } from '../base.js';
import { UPDATE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class UpdateProjectTool extends BaseTool {
  name = 'update_project';
  description = 'Update an existing project in OmniFocus, including moving between folders';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'ID of the project to update',
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
            type: 'string',
            format: 'date-time',
            description: 'New defer date in ISO format',
          },
          clearDeferDate: {
            type: 'boolean',
            description: 'Set to true to clear the existing defer date',
          },
          dueDate: {
            type: 'string',
            format: 'date-time',
            description: 'New due date in ISO format',
          },
          clearDueDate: {
            type: 'boolean',
            description: 'Set to true to clear the existing due date',
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
          folder: {
            type: 'string',
            description: 'Move project to folder (use empty string to move to root)',
          },
        },
      },
    },
    required: ['projectId', 'updates'],
  };

  async execute(args: { 
    projectId: string;
    updates: {
      name?: string;
      note?: string;
      deferDate?: string;
      clearDeferDate?: boolean;
      dueDate?: string;
      clearDueDate?: boolean;
      flagged?: boolean;
      status?: string;
      folder?: string;
    };
  }): Promise<any> {
    const timer = new OperationTimer();
    
    try {
      const { projectId, updates } = args;
      
      // Execute update script
      const script = this.omniAutomation.buildScript(UPDATE_PROJECT_SCRIPT, { 
        projectId,
        updates
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
              fields_updated: Object.keys(updates)
            }
          }
        );
      }
      
      // Error case - return standardized error
      return createErrorResponse(
        'update_project',
        'UPDATE_FAILED',
        result.message || 'Failed to update project',
        result,
        timer.toMetadata()
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}