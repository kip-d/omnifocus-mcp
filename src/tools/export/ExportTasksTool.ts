import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';

const ExportTasksSchema = z.object({
  format: z.enum(['json', 'csv', 'markdown']).default('json').describe('Export format: json|csv|markdown'),
  filter: z.object({
    search: z.string().optional(),
    project: z.string().optional(),
    projectId: z.string().optional().describe('Project ID to filter. Use list_projects to obtain IDs.'),
    tags: z.array(z.string()).optional(),
    flagged: z.boolean().optional(),
    completed: z.boolean().optional(),
    available: z.boolean().optional(),
    limit: z.number().optional(),
  }).default({}).describe('Filter criteria for task export'),
  fields: z.array(z.enum([
    'id', 'name', 'note', 'project', 'tags',
    'deferDate', 'dueDate', 'completed', 'completionDate',
    'flagged', 'estimated', 'created', 'createdDate',
    'modified', 'modifiedDate',
  ])).optional().describe('Fields to include'),
});

type ExportTasksInput = z.infer<typeof ExportTasksSchema>;

export class ExportTasksTool extends BaseTool<typeof ExportTasksSchema> {
  name = 'export_tasks';
  description = 'Export tasks to JSON/CSV/Markdown with optional filters and field selection. Formats: json|csv|markdown';
  schema = ExportTasksSchema;

  async executeValidated(args: ExportTasksInput): Promise<any> {
    const timer = new OperationTimerV2();
    try {
      const script = this.omniAutomation.buildScript('// EXPORT_TASKS_SCRIPT', args as Record<string, unknown>);
      const anyOmni: any = this.omniAutomation as any;
      const res = await anyOmni.executeJson(script);
      const final = (res && typeof res === 'object' && 'success' in res)
        ? (res as any).success ? (res as any).data : res
        : res;

      if (final && typeof final === 'object' && (final as any).error) {
        return createErrorResponseV2('export_tasks', 'TASK_EXPORT_FAILED', (final as any).error || 'Script execution failed', undefined, (final as any).details, timer.toMetadata());
      }

      const format = (final as any)?.format;
      let dataStr: string = (final as any)?.data;
      const count = (final as any)?.count;
      if (typeof dataStr !== 'string') {
        try { dataStr = JSON.stringify(dataStr ?? []); } catch { dataStr = '[]'; }
      }
      return createSuccessResponseV2('export_tasks', { format, data: dataStr, count }, undefined, { ...timer.toMetadata(), operation: 'export_tasks' });
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}
