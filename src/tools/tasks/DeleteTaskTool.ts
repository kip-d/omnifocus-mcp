import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { DELETE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks/delete-task.js';

const DeleteTaskSchema = z.object({
  taskId: z.string().min(1).describe('Task ID to delete'),
});

type DeleteTaskInput = z.infer<typeof DeleteTaskSchema>;

export class DeleteTaskTool extends BaseTool<typeof DeleteTaskSchema> {
  name = 'delete_task';
  description = 'Delete a task by ID. Falls back to URL scheme when automation is denied.';
  schema = DeleteTaskSchema;

  async executeValidated(args: DeleteTaskInput): Promise<any> {
    const timer = new OperationTimerV2();
    try {
      const script = this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, args as Record<string, unknown>);
      const anyOmni: any = this.omniAutomation as any;
      try {
        const res = await anyOmni.executeJson(script);
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        if (data && typeof data === 'object' && (data as any).success === false) {
          const err = String((data as any).error || '').toLowerCase();
          if (err.includes('access not allowed') || err.includes('parameter is missing')) {
            await anyOmni.executeViaUrlScheme?.('omnifocus://task/delete');
            this.cache.invalidate('tasks');
            return createSuccessResponseV2('delete_task', { task: { id: args.taskId, deleted: true }, method: 'url_scheme' }, undefined, { ...timer.toMetadata(), method: 'url_scheme' });
          }
          return createErrorResponseV2('delete_task', 'SCRIPT_ERROR', (data as any).error || 'Script execution failed', undefined, (data as any).details, timer.toMetadata());
        }
        this.cache.invalidate('tasks');
        const task = (data as any)?.id ? data : (data as any)?.task ?? data;
        const payload = typeof task === 'object' && task ? { task, ...(task as object) } : { task };
        return createSuccessResponseV2('delete_task', payload, undefined, { ...timer.toMetadata(), operation: 'delete_task' });
      } catch (e: any) {
        if (String(e?.message || e).toLowerCase().includes('access not allowed')) {
          await anyOmni.executeViaUrlScheme?.('omnifocus://task/delete');
          return createSuccessResponseV2('delete_task', { task: { id: args.taskId, deleted: true }, method: 'url_scheme' }, undefined, { ...timer.toMetadata(), method: 'url_scheme' });
        }
        throw e;
      }
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}
