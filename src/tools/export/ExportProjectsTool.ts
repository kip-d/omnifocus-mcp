import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';

const ExportProjectsSchema = z.object({
  format: z.enum(['json', 'csv']).default('json').describe('Export format: json|csv'),
  includeStats: coerceBoolean().default(false).describe('Include per-project statistics (slower operation).'),
});

type ExportProjectsInput = z.infer<typeof ExportProjectsSchema>;

export class ExportProjectsTool extends BaseTool<typeof ExportProjectsSchema> {
  name = 'export_projects';
  description = 'Export all projects to JSON/CSV. Optionally include statistics; formats: json|csv';
  schema = ExportProjectsSchema;

  async executeValidated(args: ExportProjectsInput): Promise<any> {
    const timer = new OperationTimerV2();
    try {
      const script = this.omniAutomation.buildScript('// EXPORT_PROJECTS_SCRIPT', args as Record<string, unknown>);
      const anyOmni: any = this.omniAutomation as any;
      const res = await anyOmni.executeJson(script);
      const final = (res && typeof res === 'object' && 'success' in res)
        ? (res as any).success ? (res as any).data : res
        : res;

      if (final && typeof final === 'object' && (final as any).error) {
        return createErrorResponseV2('export_projects', 'PROJECT_EXPORT_FAILED', (final as any).error || 'Failed to access projects', undefined, (final as any).details, timer.toMetadata());
      }

      const format = (final as any)?.format;
      let dataStr: string = (final as any)?.data;
      const count = (final as any)?.count;
      if (typeof dataStr !== 'string') {
        try { dataStr = JSON.stringify(dataStr ?? []); } catch { dataStr = '[]'; }
      }
      return createSuccessResponseV2('export_projects', { format, data: dataStr, count, includeStats: args.includeStats }, undefined, { ...timer.toMetadata(), operation: 'export_projects' });
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}
