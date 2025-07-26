import { z } from 'zod';
import { BaseTool } from '../base.js';
import { EXPORT_PROJECTS_SCRIPT } from '../../omnifocus/scripts/export.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { ExportProjectsSchema } from '../schemas/export-schemas.js';

export class ExportProjectsTool extends BaseTool<typeof ExportProjectsSchema> {
  name = 'export_projects';
  description = 'Export all projects in JSON or CSV format with optional statistics';
  schema = ExportProjectsSchema;

  async executeValidated(args: z.infer<typeof ExportProjectsSchema>): Promise<any> {
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
        return createErrorResponse(
          'export_projects',
          'SCRIPT_ERROR',
          result.message || 'Failed to export projects',
          { details: result },
          timer.toMetadata(),
        );
      }

      return createSuccessResponse(
        'export_projects',
        {
          format: result.format,
          count: result.count,
          data: result.data,
        },
        {
          ...timer.toMetadata(),
          exported_at: new Date().toISOString(),
          include_stats: includeStats,
          format: format,
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
