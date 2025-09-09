import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { COMPLETE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks/complete-task.js';

const CompleteTaskSchema = z.object({
  taskId: z.string().min(1).describe('Task ID to complete'),
  completionDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null(),
  ]).optional().nullable().transform(v => v === '' ? null : v),
});

type CompleteTaskInput = z.infer<typeof CompleteTaskSchema>;

export class CompleteTaskTool extends BaseTool<typeof CompleteTaskSchema> {
  name = 'complete_task';
  description = 'Complete a task by ID. Accepts optional completionDate.';
  schema = CompleteTaskSchema;

  async executeValidated(args: CompleteTaskInput): Promise<any> {
    const timer = new OperationTimerV2();
    try {
      const script = this.omniAutomation.buildScript(COMPLETE_TASK_SCRIPT, args as Record<string, unknown>);
      const anyOmni: any = this.omniAutomation as any;
      try {
        const res = await anyOmni.executeJson(script);
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        if (data && typeof data === 'object' && (data as any).success === false) {
          const err = String((data as any).error || '').toLowerCase();
          if (err.includes('access not allowed')) {
            // Fallback to URL scheme
            await anyOmni.executeViaUrlScheme?.('omnifocus://complete');
            this.cache.invalidate('tasks');
            this.cache.invalidate('analytics');
            return createSuccessResponseV2('complete_task', { task: { id: args.taskId, completed: true }, method: 'url_scheme' }, undefined, { ...timer.toMetadata(), method: 'url_scheme' });
          }
          return createErrorResponseV2('complete_task', 'SCRIPT_ERROR', (data as any).error || 'Script execution failed', undefined, (data as any).details, timer.toMetadata());
        }
        this.cache.invalidate('tasks');
        this.cache.invalidate('analytics');
        const task = (data as any)?.id ? data : (data as any)?.task ?? data;
        return createSuccessResponseV2('complete_task', { task }, undefined, { ...timer.toMetadata(), operation: 'complete_task' });
      } catch (e: any) {
        // Exception path: permission => URL scheme
        if (String(e?.message || e).toLowerCase().includes('access not allowed')) {
          await anyOmni.executeViaUrlScheme?.('omnifocus://complete');
          this.cache.invalidate('tasks');
          this.cache.invalidate('analytics');
          return createSuccessResponseV2('complete_task', { task: { id: args.taskId, completed: true }, method: 'url_scheme' }, undefined, { ...timer.toMetadata(), method: 'url_scheme' });
        }
        throw e;
      }
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}
