import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { CREATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks/create-task.js';

const CreateTaskSchema = z.object({
  name: z.string().min(1).describe('Task name'),
  note: z.string().optional().describe('Task note/description'),
  projectId: z.union([z.string().min(1), z.literal(''), z.null()]).optional().nullable()
    .transform(v => v === '' ? null : v)
    .describe('Project ID for the task. Use list_projects to find valid IDs; list_tasks can provide parent task IDs for subtasks.'),
  parentTaskId: z.union([z.string().min(1), z.literal(''), z.null()]).optional()
    .transform(v => v === '' ? undefined : v)
    .describe('Parent task ID to create as a subtask'),
  dueDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null(),
  ]).optional().nullable().transform(v => v === '' ? null : v)
    .describe('Due date (YYYY-MM-DD or YYYY-MM-DD HH:mm)'),
  deferDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null(),
  ]).optional().nullable().transform(v => v === '' ? null : v)
    .describe('Defer date (YYYY-MM-DD or YYYY-MM-DD HH:mm)'),
  flagged: z.union([z.boolean(), z.string()]).optional().describe('Flag the task'),
  estimatedMinutes: z.union([z.number(), z.string()]).optional().refine(v => {
    const n = typeof v === 'string' ? Number(v) : v;
    return n === undefined || (Number.isFinite(n) && n >= 0);
  }, 'estimatedMinutes must be a non-negative number'),
  tags: z.array(z.string()).optional().describe('Tags to assign'),
  sequential: z.union([z.boolean(), z.string()]).optional().describe('Whether subtasks are sequential'),
});

type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export class CreateTaskTool extends BaseTool<typeof CreateTaskSchema> {
  name = 'create_task';
  description = 'Create a new task. Use list_projects to find projectId and list_tasks for parentTaskId when creating subtasks.';
  schema = CreateTaskSchema;

  async executeValidated(args: CreateTaskInput): Promise<any> {
    const timer = new OperationTimerV2();
    try {
      const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData: args } as Record<string, unknown>);
      const anyOmni: any = this.omniAutomation as any;
      const res = await anyOmni.executeJson(script);

      // Support both object and JSON string return
      const data = typeof res === 'string' ? JSON.parse(res) : res;
      if (data && typeof data === 'object' && (data as any).success === false) {
        return createErrorResponseV2('create_task', 'SCRIPT_ERROR', (data as any).error || 'Script execution failed', undefined, (data as any).details, timer.toMetadata());
      }
      // Success path
      this.cache.invalidate('tasks');
      const task = (data as any)?.taskId ? data : (data as any)?.task ?? data;
      return createSuccessResponseV2('create_task', { task }, undefined, { ...timer.toMetadata(), operation: 'create_task' });
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}
