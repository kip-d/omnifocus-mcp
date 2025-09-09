import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { UPDATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks/update-task.js';

const UpdateTaskSchema = z.object({
  taskId: z.string().min(1).describe('Task ID to update'),
  projectId: z.union([z.string().min(1), z.literal(''), z.null()]).optional().nullable()
    .describe('Project ID for the task. Use list_projects to find valid IDs; list_tasks can provide current task IDs.'),
  name: z.string().optional(),
  note: z.string().optional(),
  flagged: z.union([z.boolean(), z.string()]).optional(),
  dueDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null(),
  ]).optional().nullable().transform(v => v === '' ? null : v),
  deferDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null(),
  ]).optional().nullable().transform(v => v === '' ? null : v),
  estimatedMinutes: z.union([z.number(), z.string()]).optional(),
  tags: z.array(z.string()).optional(),
  clearDueDate: z.boolean().optional(),
  clearDeferDate: z.boolean().optional(),
  clearEstimatedMinutes: z.boolean().optional(),
  clearRepeatRule: z.boolean().optional(),
  minimalResponse: z.union([z.boolean(), z.string()]).optional(),
});

type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export class UpdateTaskTool extends BaseTool<typeof UpdateTaskSchema> {
  name = 'update_task';
  description = 'Update task fields including name, note, dates, tags, and flags. Supports clear* options to remove fields and minimalResponse for bulk contexts.';
  schema = UpdateTaskSchema;

  async executeValidated(args: UpdateTaskInput): Promise<any> {
    const timer = new OperationTimerV2();
    try {
      const { taskId, ...rest } = args;
      // Determine updates
      const updates: Record<string, any> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v === undefined) continue;
        if (k === 'clearDueDate' && v) updates.dueDate = null;
        else if (k === 'clearDeferDate' && v) updates.deferDate = null;
        else if (k === 'clearEstimatedMinutes' && v) updates.estimatedMinutes = null;
        else if (k === 'clearRepeatRule' && v) updates.repeatRule = null;
        else if (!k.startsWith('clear')) updates[k] = v;
      }

      if (Object.keys(updates).length === 0) {
        return createSuccessResponseV2('update_task', { task: { id: taskId, updated: false } }, undefined, { ...timer.toMetadata(), message: 'No valid updates provided' });
      }

      const script = this.omniAutomation.buildScript(UPDATE_TASK_SCRIPT, { taskId, updates } as Record<string, unknown>);
      const anyOmni: any = this.omniAutomation as any;
      const res = await anyOmni.executeJson(script);
      const data = typeof res === 'string' ? JSON.parse(res) : res;

      if (data && typeof data === 'object' && (data as any).success === false) {
        return createErrorResponseV2('update_task', 'SCRIPT_ERROR', (data as any).error || 'Script execution failed', undefined, (data as any).details, timer.toMetadata());
      }

      this.cache.invalidate('tasks');
      const task = (data as any)?.id ? data : (data as any)?.task ?? data;
      return createSuccessResponseV2('update_task', { task }, undefined, { ...timer.toMetadata(), operation: 'update_task' });
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}
