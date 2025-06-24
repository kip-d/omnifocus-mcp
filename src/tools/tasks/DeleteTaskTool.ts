import { BaseTool } from '../base.js';
import { DELETE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';

export class DeleteTaskTool extends BaseTool {
  name = 'delete_task';
  description = 'Delete (drop) a task in OmniFocus';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'ID of the task to delete',
      },
    },
    required: ['taskId'],
  };

  async execute(args: { taskId: string }): Promise<any> {
    try {
      // Invalidate task cache
      this.cache.invalidate('tasks');
      
      const script = this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, args);
      const result = await this.omniAutomation.execute(script);
      
      if (result.error) {
        return result;
      }
      
      this.logger.info(`Deleted task: ${result.name} (${args.taskId})`);
      
      return {
        success: true,
        task: result,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}