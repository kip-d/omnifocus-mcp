import { z } from 'zod';
import { BaseTool } from '../base.js';
import { EXPORT_TASKS_SCRIPT } from '../../omnifocus/scripts/export.js';
import { ExportTasksSchema } from '../schemas/export-schemas.js';

export class ExportTasksTool extends BaseTool<typeof ExportTasksSchema> {
  name = 'export_tasks';
  description = 'Export tasks to JSON/CSV with filtering. Format: json|csv|markdown. Apply any list_tasks filters. Specify fields array or get all. Returns file content for saving.';
  schema = ExportTasksSchema;

  async executeValidated(args: z.infer<typeof ExportTasksSchema>): Promise<any> {
    try {
      const { format = 'json', filter = {}, fields } = args;

      // Execute export script
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
        return {
          error: true,
          message: result.message,
        };
      }

      return {
        format: result.format,
        count: result.count,
        data: result.data,
        metadata: {
          exportedAt: new Date().toISOString(),
          filters: filter,
          fields: fields || 'default',
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}
