import { BaseTool } from '../base.js';
import { EXPORT_PROJECTS_SCRIPT } from '../../omnifocus/scripts/export.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class ExportProjectsTool extends BaseTool {
  name = 'export_projects';
  description = 'Export all projects in JSON or CSV format with optional statistics';

  inputSchema = {
    type: 'object' as const,
    properties: {
      format: {
        type: 'string',
        enum: ['json', 'csv'],
        description: 'Export format (default: json)',
        default: 'json',
      },
      includeStats: {
        type: 'boolean',
        description: 'Include task statistics for each project',
        default: false,
      },
    },
  };

  async execute(args: {
    format?: 'json' | 'csv';
    includeStats?: boolean;
  }): Promise<any> {
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
