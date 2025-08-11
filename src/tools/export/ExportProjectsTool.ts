import { z } from 'zod';
import { BaseTool } from '../base.js';
import { EXPORT_PROJECTS_SCRIPT } from '../../omnifocus/scripts/export.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { ExportProjectsResponse } from '../response-types.js';
import { ExportProjectsSchema } from '../schemas/export-schemas.js';

export class ExportProjectsTool extends BaseTool<typeof ExportProjectsSchema> {
  name = 'export_projects';
  description = 'Export all projects to JSON/CSV. Format: json|csv (default json). Set includeStats=true for task metrics per project (slower). Returns file content for saving.';
  schema = ExportProjectsSchema;

  async executeValidated(args: z.infer<typeof ExportProjectsSchema>): Promise<ExportProjectsResponse> {
    const timer = new OperationTimer();

    try {
      const { format = 'json', includeStats = false } = args;

      // Execute export script
      const script = this.omniAutomation.buildScript(EXPORT_PROJECTS_SCRIPT, {
        format,
        includeStats,
      });
      const result = await this.omniAutomation.execute<{
        format: string;
        data: any;
        count: number;
        error?: boolean;
        message?: string;
      }>(script);

      if (result.error) {
        return this.handleError(new Error(result.message || 'Failed to export projects')) as any;
      }

      return createSuccessResponse(
        'export_projects',
        {
          format: result.format as 'json' | 'csv' | 'markdown',
          data: result.data,
          count: result.count,
          includeStats,
        },
        {
          ...timer.toMetadata(),
          export_date: new Date().toISOString(),
          include_stats: includeStats,
          project_count: result.count,
        }
      );
    } catch (error) {
      return this.handleError(error) as any;
    }
  }
}
