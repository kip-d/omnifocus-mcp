import { z } from 'zod';
import { BaseTool } from '../base.js';
import { DELETE_TASK_SCRIPT, DELETE_TASK_OMNI_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { DeleteTaskSchema } from '../schemas/task-schemas.js';

export class DeleteTaskTool extends BaseTool<typeof DeleteTaskSchema> {
  name = 'delete_task';
  description = 'Delete (drop) a task permanently from OmniFocus. This cannot be undone. Task will be removed from all projects and contexts.';
  schema = DeleteTaskSchema;

  async executeValidated(args: z.infer<typeof DeleteTaskSchema>): Promise<any> {
    const timer = new OperationTimerV2();

    try {
      // Try JXA first, fall back to URL scheme if access denied
      try {
        const script = this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, args as unknown as Record<string, unknown>);
        const anyOmni: any = this.omniAutomation as any;
        const res = typeof anyOmni.executeJson === 'function' ? await anyOmni.executeJson(script) : await anyOmni.execute(script);
        const result = (res && typeof res === 'object' && 'success' in res) ? res as any : { success: true, data: res };

        if (!result.success) {
          // If error contains "parameter is missing" or "access not allowed", use URL scheme
          if (result.error && typeof result.error === 'string' &&
              (result.error.toLowerCase().includes('parameter is missing') ||
               result.error.toLowerCase().includes('access not allowed'))) {
            this.logger.info('JXA failed, falling back to URL scheme for task deletion');
            return await this.executeViaUrlScheme(args);
          }
          return createErrorResponseV2('delete_task', 'SCRIPT_ERROR', result.error, 'Verify task ID and permissions', (result as any).details, timer.toMetadata());
        }

        const parsedResult = (result as any).data;

        // Invalidate caches after successful deletion
        this.cache.invalidate('tasks');
        this.cache.invalidate('analytics');
        this.cache.invalidate('projects');
        this.cache.invalidate('tags');

        this.logger.info(`Deleted task via JXA: ${args.taskId}`);
        return createSuccessResponseV2('delete_task', { task: parsedResult }, undefined, { ...timer.toMetadata(), deleted_id: args.taskId, method: 'jxa', input_params: { taskId: args.taskId } });
      } catch (jxaError: any) {
        // If JXA fails with permission error, use URL scheme
        if (jxaError.message &&
            (jxaError.message.toLowerCase().includes('parameter is missing') ||
             jxaError.message.toLowerCase().includes('access not allowed'))) {
          this.logger.info('JXA failed, falling back to URL scheme for task deletion');
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
    const omniScript = this.omniAutomation.buildScript(DELETE_TASK_OMNI_SCRIPT, args);
    await this.omniAutomation.executeViaUrlScheme(omniScript);

    // Invalidate caches after successful URL scheme execution
    this.cache.invalidate('tasks');
    this.cache.invalidate('analytics');
    this.cache.invalidate('projects');
    this.cache.invalidate('tags');

    this.logger.info(`Deleted task via URL scheme: ${args.taskId}`);

    // Return standardized format since URL scheme doesn't return detailed results
    return createSuccessResponseV2('delete_task', { task: { id: args.taskId, deleted: true, name: 'Task deleted successfully' } }, undefined, { ...timer.toMetadata(), deleted_id: args.taskId, method: 'url_scheme', input_params: { taskId: args.taskId } });
  }
}
