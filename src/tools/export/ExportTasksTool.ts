import { z } from 'zod';
import { BaseTool } from '../base.js';
// REVERTED: Using original JXA script - hybrid approach had critical performance issues
import { EXPORT_TASKS_SCRIPT } from '../../omnifocus/scripts/export/export-tasks.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { ExportTasksResponse } from '../response-types.js';
import { ExportTasksSchema } from '../schemas/export-schemas.js';

export class ExportTasksTool extends BaseTool<typeof ExportTasksSchema> {
  name = 'export_tasks';
  description = 'Export tasks to JSON/CSV/Markdown with filtering. Format: json|csv|markdown. Apply any list_tasks filters. Fields: id, name, note, project, tags, deferDate, dueDate, completed, completionDate, flagged, estimated, created/createdDate, modified/modifiedDate. Returns file content for saving.';
  schema = ExportTasksSchema;

  async executeValidated(args: z.infer<typeof ExportTasksSchema>): Promise<ExportTasksResponse> {
    const timer = new OperationTimer();
    try {
      const { format = 'json', filter = {}, fields } = args;

      // Execute original export script
      const script = this.omniAutomation.buildScript(EXPORT_TASKS_SCRIPT, {
        format,
        filter,
        fields,
      });
      const result = await this.omniAutomation.execute<{
        format: string;
        data: any;
        count: number;
        error?: boolean;
        message?: string;
      }>(script);

      if (result.error) {
        return this.handleError(new Error(result.message || 'Failed to export tasks')) as any;
      }

      return createSuccessResponse(
        'export_tasks',
        {
          format: result.format as 'json' | 'csv' | 'markdown',
          data: result.data,
          count: result.count,
        },
        {
          ...timer.toMetadata(),
        },
      );
    } catch (error) {
      return this.handleError(error) as any;
    }
  }
}
