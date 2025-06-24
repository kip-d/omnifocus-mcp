import { BaseTool } from '../base.js';
import { TaskUpdate } from '../../omnifocus/types.js';
import { UPDATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';

export class UpdateTaskTool extends BaseTool {
  name = 'update_task';
  description = 'Update an existing task in OmniFocus';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'ID of the task to update',
      },
      name: {
        type: 'string',
        description: 'New task name',
      },
      note: {
        type: 'string',
        description: 'New task note',
      },
      flagged: {
        type: 'boolean',
        description: 'New flagged status',
      },
      dueDate: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'New due date (null to clear)',
      },
      deferDate: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'New defer date (null to clear)',
      },
      estimatedMinutes: {
        type: ['number', 'null'],
        description: 'New estimated time (null to clear)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'New tags (replaces all existing tags)',
      },
      projectId: {
        type: ['string', 'null'],
        description: 'New project ID (null to move to inbox)',
      },
    },
    required: ['taskId'],
  };

  async execute(args: { taskId: string } & TaskUpdate): Promise<any> {
    try {
      const { taskId, ...updates } = args;
      
      // Invalidate task cache on update
      this.cache.invalidate('tasks');
      
      const script = this.omniAutomation.buildScript(UPDATE_TASK_SCRIPT, { 
        taskId,
        updates,
      });
      
      const result = await this.omniAutomation.execute(script);
      
      if (result.error) {
        return result;
      }
      
      this.logger.info(`Updated task: ${taskId}`);
      
      return {
        success: true,
        task: result,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}