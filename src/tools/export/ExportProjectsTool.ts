import { z } from 'zod';
import { BaseTool } from '../base.js';
import { EXPORT_PROJECTS_SCRIPT } from '../../omnifocus/scripts/export.js';
import { createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { ExportProjectsSchema } from '../schemas/export-schemas.js';

export class ExportProjectsTool extends BaseTool<typeof ExportProjectsSchema> {
  name = 'export_projects';
  description = 'Export all projects to JSON/CSV. Format: json|csv (default json). Set includeStats=true for task metrics per project (slower). Returns file content for saving.';
  schema = ExportProjectsSchema;

  async executeValidated(args: z.infer<typeof ExportProjectsSchema>): Promise<any> {
    const timer = new OperationTimerV2();

    try {
      const { format = 'json', includeStats = false } = args;

      // Execute export script
      const script = this.omniAutomation.buildScript(EXPORT_PROJECTS_SCRIPT, {
        format,
        includeStats,
      });
      const result = await this.omniAutomation.execute(script) as {
        format: string;
        data: any;
        count: number;
        error?: boolean;
        message?: string;
      };

      if (result.error) {
        return this.handleError(new Error(result.message || 'Failed to export projects')) as any;
      }

      return createSuccessResponseV2('export_projects', { format: result.format as 'json' | 'csv' | 'markdown', data: result.data, count: result.count, includeStats }, undefined, { ...timer.toMetadata() });
    } catch (error) {
      return this.handleError(error) as any;
    }
  }
}
