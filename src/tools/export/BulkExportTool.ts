import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';
import * as path from 'path';
import { ExportTasksTool } from './ExportTasksTool.js';
import { ExportProjectsTool } from './ExportProjectsTool.js';
import { TagsToolV2 } from '../tags/TagsToolV2.js';
import { mkdir, writeFile } from 'fs/promises';

const BulkExportSchema = z.object({
  outputDirectory: z.string().min(1).describe('Directory to write export files into'),
  format: z.enum(['json', 'csv']).default('json').describe('Export format for tasks/projects'),
  includeCompleted: coerceBoolean().default(true).describe('Include completed tasks in export'),
  includeProjectStats: coerceBoolean().default(true).describe('Include statistics for project export'),
});

type BulkExportInput = z.infer<typeof BulkExportSchema>;

export class BulkExportTool extends BaseTool<typeof BulkExportSchema> {
  name = 'bulk_export';
  description = 'Export all OmniFocus data to files (tasks, projects, tags). Formats: json|csv for tasks/projects; tags are always JSON.';
  schema = BulkExportSchema;

  async executeValidated(args: BulkExportInput): Promise<any> {
    const timer = new OperationTimerV2();
    const { outputDirectory, format, includeCompleted, includeProjectStats } = args;
    try {
      await mkdir(outputDirectory, { recursive: true });

      const exports: Record<string, any> = {};
      let totalExported = 0;

      // Tasks
      try {
        const tasksTool = new ExportTasksTool(this.cache);
        const t = await (tasksTool as any).executeJson?.({
          format,
          filter: includeCompleted ? {} : { completed: false },
          fields: undefined,
        });
        if (t && t.success) {
          const tData = t.data;
          const file = path.join(outputDirectory, `tasks.${format}`);
          await writeFile(file, String(tData.data), 'utf-8');
          exports.tasks = { format, task_count: tData.count, exported: true };
          totalExported += Number(tData.count) || 0;
        }
      } catch {
        // ignore task export failures
      }

      // Projects
      try {
        const projectsTool = new ExportProjectsTool(this.cache);
        const p = await (projectsTool as any).executeJson?.({
          format,
          includeStats: includeProjectStats,
        });
        if (p && p.success) {
          const pData = p.data;
          const file = path.join(outputDirectory, `projects.${format}`);
          await writeFile(file, String(pData.data), 'utf-8');
          exports.projects = { format, project_count: pData.count, exported: true };
          totalExported += Number(pData.count) || 0;
        }
      } catch {
        // ignore project export failures
      }

      // Tags (always JSON)
      try {
        const tagsTool = new TagsToolV2(this.cache);
        const tg = await (tagsTool as any).executeJson?.({ includeEmpty: true });
        if (tg && tg.success) {
          const items = (tg.data?.items ?? []) as any[];
          const count = tg.metadata?.total_count ?? items.length;
          const file = path.join(outputDirectory, 'tags.json');
          await writeFile(file, JSON.stringify(items, null, 2), 'utf-8');
          exports.tags = { format: 'json', tag_count: count, exported: true };
          totalExported += Number(count) || 0;
        }
      } catch {
        // ignore tag export failures
      }

      return createSuccessResponseV2('bulk_export', { exports, summary: { totalExported } }, undefined, { ...timer.toMetadata(), operation: 'bulk_export' });
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}

