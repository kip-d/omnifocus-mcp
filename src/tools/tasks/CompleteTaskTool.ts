import { BaseTool } from '../base.js';
import { COMPLETE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';

export class CompleteTaskTool extends BaseTool {
  name = 'complete_task';
  description = 'Mark a task as completed in OmniFocus';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'ID of the task to complete',
      },
    },
    required: ['taskId'],
  };

  async execute(args: { taskId: string }): Promise<any> {
    try {
      // Invalidate task and analytics cache
      this.cache.invalidate('tasks');
      this.cache.invalidate('analytics');
      
      const script = this.omniAutomation.buildScript(COMPLETE_TASK_SCRIPT, args);
      const result = await this.omniAutomation.execute(script);
      
      if (result.error) {
        return result;
      }
      
      this.logger.info(`Completed task: ${args.taskId}`);
      
      return {
        success: true,
        task: result,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}