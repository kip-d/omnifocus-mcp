import { z } from 'zod';
import { BaseTool } from '../base.js';
import { COMPLETE_TASK_SCRIPT, COMPLETE_TASK_OMNI_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { CompleteTaskSchema } from '../schemas/task-schemas.js';
import { localToUTC } from '../../utils/timezone.js';

export class CompleteTaskTool extends BaseTool<typeof CompleteTaskSchema> {
  name = 'complete_task';
  description = 'Mark a task as completed in OmniFocus. Optionally specify completionDate using YYYY-MM-DD or "YYYY-MM-DD HH:mm" format (defaults to now). Updates cache after completion.';
  schema = CompleteTaskSchema;

  async executeValidated(args: z.infer<typeof CompleteTaskSchema>): Promise<any> {
    const timer = new OperationTimerV2();

    try {
      // Convert completionDate if provided
      const processedArgs = {
        ...args,
        completionDate: args.completionDate ? localToUTC(args.completionDate, 'completion') : undefined,
      };

      // Try JXA first, fall back to URL scheme if access denied
      try {
        const script = this.omniAutomation.buildScript(COMPLETE_TASK_SCRIPT, processedArgs as unknown as Record<string, unknown>);
        const anyOmni: any = this.omniAutomation as any;
        // Use flexible executeJson without strict schema to support unit mocks
        const res = typeof anyOmni.executeJson === 'function' ? await anyOmni.executeJson(script) : await anyOmni.execute(script);
        const result = (res && typeof res === 'object' && 'success' in res) ? res as any : { success: true, data: res };

        if (!result.success) {
          // If error contains "access not allowed", use URL scheme
          if (result.error && typeof result.error === 'string' && result.error.toLowerCase().includes('access not allowed')) {
            this.logger.info('JXA access denied, falling back to URL scheme for task completion');
            return await this.executeViaUrlScheme(args);
          }
          return createErrorResponseV2('complete_task', 'SCRIPT_ERROR', result.error, 'Verify task ID and OmniFocus state', (result as any).details, timer.toMetadata());
        }

        this.logger.info(`Completed task via JXA: ${args.taskId}`);

        const parsedResult = (result as any).data;

        // Invalidate cache after successful completion
        this.cache.invalidate('tasks');
        this.cache.invalidate('analytics');

        return createSuccessResponseV2('complete_task', { task: parsedResult }, undefined, { ...timer.toMetadata(), completed_id: args.taskId, method: 'jxa', input_params: { taskId: args.taskId } });
      } catch (jxaError: any) {
        // If JXA fails with permission error, use URL scheme
        if (jxaError.message && jxaError.message.toLowerCase().includes('access not allowed')) {
          this.logger.info('JXA access denied, falling back to URL scheme for task completion');
          return await this.executeViaUrlScheme(args);
        }
        throw jxaError;
      }
    } catch (error) {
      return this.handleError(error) as any;
    }
  }

  private async executeViaUrlScheme(args: { taskId: string }): Promise<any> {
    const timer = new OperationTimerV2();
    const omniScript = this.omniAutomation.buildScript(COMPLETE_TASK_OMNI_SCRIPT, args);
    await this.omniAutomation.executeViaUrlScheme(omniScript);

    // Invalidate cache after successful URL scheme execution
    this.cache.invalidate('tasks');
    this.cache.invalidate('analytics');

    this.logger.info(`Completed task via URL scheme: ${args.taskId}`);

    // Return standardized format since URL scheme doesn't return detailed results
    return createSuccessResponseV2('complete_task', { task: { id: args.taskId, completed: true, completionDate: new Date().toISOString() } }, undefined, { ...timer.toMetadata(), completed_id: args.taskId, method: 'url_scheme', input_params: { taskId: args.taskId } });
  }
}
