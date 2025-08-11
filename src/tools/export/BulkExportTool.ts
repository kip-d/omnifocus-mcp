import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ExportTasksTool } from './ExportTasksTool.js';
import { ExportProjectsTool } from './ExportProjectsTool.js';
import { ListTagsTool } from '../tags/ListTagsTool.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { BulkExportResponse, BulkExportResponseData } from '../response-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BulkExportSchema } from '../schemas/export-schemas.js';

export class BulkExportTool extends BaseTool<typeof BulkExportSchema> {
  name = 'bulk_export';
  description = 'Export all OmniFocus data to files. Specify outputDirectory. Format: json|csv. Set includeCompleted=true for complete backup, includeProjectStats for metrics. Creates 3 files.';
  schema = BulkExportSchema;

  async executeValidated(args: z.infer<typeof BulkExportSchema>): Promise<BulkExportResponse> {
    const timer = new OperationTimer();
    try {
      const {
        outputDirectory,
        format = 'json',
        includeCompleted = true,
        includeProjectStats = true,
      } = args;

      // Ensure directory exists
      await fs.mkdir(outputDirectory, { recursive: true });

      const exports: BulkExportResponseData['exports'] = {};
      let totalExported = 0;

      // Export tasks
      const taskExporter = new ExportTasksTool(this.cache);
      const taskFilter = includeCompleted ? {} : { completed: false };
      const taskResult = await taskExporter.execute({ format, filter: taskFilter });

      if (taskResult.success && taskResult.data) {
        const taskFile = path.join(outputDirectory, `tasks.${format}`);
        const taskCount = taskResult.data.count;

        if (format === 'csv') {
          await fs.writeFile(taskFile, taskResult.data.data as string, 'utf-8');
        } else {
          await fs.writeFile(taskFile, JSON.stringify(taskResult.data.data, null, 2), 'utf-8');
        }
        
        exports.tasks = {
          format: format,
          taskCount: taskCount,
          exported: true,
        };
        totalExported += taskCount;
      }

      // Export projects
      const projectExporter = new ExportProjectsTool(this.cache);
      const projectResult = await projectExporter.execute({
        format,
        includeStats: includeProjectStats,
      });

      if (projectResult.success && projectResult.data) {
        const projectFile = path.join(outputDirectory, `projects.${format}`);
        const projectCount = projectResult.data.count;

        if (format === 'csv') {
          await fs.writeFile(projectFile, projectResult.data.data as string, 'utf-8');
        } else {
          await fs.writeFile(projectFile, JSON.stringify(projectResult.data.data, null, 2), 'utf-8');
        }
        
        exports.projects = {
          format: format,
          projectCount: projectCount,
          exported: true,
        };
        totalExported += projectCount;
      }

      // Export tags (JSON only)
      const tagExporter = new ListTagsTool(this.cache);
      const tagResult = await tagExporter.execute({ includeEmpty: true });

      if (tagResult.success && tagResult.data) {
        const tagFile = path.join(outputDirectory, 'tags.json');
        const tagItems = tagResult.data.items || [];
        const tagCount = tagResult.metadata?.total_count || tagItems.length;

        await fs.writeFile(tagFile, JSON.stringify(tagItems, null, 2), 'utf-8');
        
        exports.tags = {
          format: 'json',
          tagCount: tagCount,
          exported: true,
        };
        totalExported += tagCount;
      }

      return createSuccessResponse(
        'bulk_export',
        {
          exports,
          summary: {
            totalExported,
            exportDate: new Date().toISOString(),
          },
        },
        {
          ...timer.toMetadata(),
          output_directory: outputDirectory,
          export_format: format,
          include_completed: includeCompleted,
          include_project_stats: includeProjectStats,
        }
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
