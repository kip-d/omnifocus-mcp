import { z } from 'zod';
import { BaseTool } from '../base.js';
// REVERTED: Using original JXA script - hybrid approach had critical performance issues
import { EXPORT_TASKS_SCRIPT } from '../../omnifocus/scripts/export/export-tasks.js';
import { createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { ExportTasksResponse } from '../response-types.js';
import { ExportTasksSchema } from '../schemas/export-schemas.js';

export class ExportTasksTool extends BaseTool<typeof ExportTasksSchema> {
  name = 'export_tasks';
  description = 'Export tasks to JSON/CSV/Markdown with filtering. Format: json|csv|markdown. Apply any list_tasks filters. Fields: id, name, note, project, tags, deferDate, dueDate, completed, completionDate, flagged, estimated, created/createdDate, modified/modifiedDate. Returns file content for saving.';
  schema = ExportTasksSchema;

  async executeValidated(args: z.infer<typeof ExportTasksSchema>): Promise<any> {
    const timer = new OperationTimerV2();
    try {
      const { format = 'json', filter = {}, fields } = args;

      // Execute original export script
      const script = this.omniAutomation.buildScript(EXPORT_TASKS_SCRIPT, {
        format,
        filter,
        fields,
      });
      const anyOmni: any = this.omniAutomation as any;
      const raw = typeof anyOmni.executeJson === 'function' ? await anyOmni.executeJson(script) : await anyOmni.execute(script);
      if (raw && typeof raw === 'object' && 'success' in raw) {
        const sr: any = raw;
        if (!sr.success) {
          return this.handleError(new Error(sr.error || 'Failed to export tasks')) as any;
        }
        const result = sr.data;
        return createSuccessResponseV2('export_tasks', { format: result.format as 'json' | 'csv' | 'markdown', data: result.data, count: result.count }, undefined, { ...timer.toMetadata() });
      }
      const result: any = raw;
      if (result && result.error) {
        return this.handleError(new Error(result.message || 'Failed to export tasks')) as any;
      }

      return createSuccessResponseV2('export_tasks', { format: result.format as 'json' | 'csv' | 'markdown', data: result.data, count: result.count }, undefined, { ...timer.toMetadata() });
    } catch (error) {
      return this.handleError(error) as any;
    }
  }
}
