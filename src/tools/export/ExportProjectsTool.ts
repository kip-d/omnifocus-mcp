import { BaseTool } from '../base.js';
import { EXPORT_PROJECTS_SCRIPT } from '../../omnifocus/scripts/export.js';

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
    try {
      const { format = 'json', includeStats = false } = args;
      
      // Execute export script
      const script = this.omniAutomation.buildScript(EXPORT_PROJECTS_SCRIPT, { 
        format,
        includeStats
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
          includeStats,
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}