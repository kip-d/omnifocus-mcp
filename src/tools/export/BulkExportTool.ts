import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ExportTasksTool } from './ExportTasksTool.js';
import { ExportProjectsTool } from './ExportProjectsTool.js';
import { TagsToolV2 } from '../tags/TagsToolV2.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { BulkExportResponse, BulkExportResponseData, ExportTasksResponse, ExportProjectsResponse, ListTasksResponse } from '../response-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BulkExportSchema } from '../schemas/export-schemas.js';

export class BulkExportTool extends BaseTool<typeof BulkExportSchema> {
  name = 'bulk_export';
  description = 'Export all OmniFocus data to files. Specify outputDirectory. Format: json|csv. Set includeCompleted=true for complete backup, includeProjectStats for metrics. Creates 3 files.';
  schema = BulkExportSchema;

  async executeValidated(args: z.infer<typeof BulkExportSchema>): Promise<any> {
    const timer = new OperationTimerV2();
    const {
      outputDirectory,
      format = 'json',
      includeCompleted = true,
      includeProjectStats = true,
    } = args;

    try {

      // Ensure directory exists
      await fs.mkdir(outputDirectory, { recursive: true });

      const exports: BulkExportResponseData['exports'] = {};
      let totalExported = 0;

      // Export tasks (prefer executeJson from tests, fall back to execute)
      const taskExporter = new ExportTasksTool(this.cache) as any;
      const taskFilter = includeCompleted ? {} : { completed: false };
      const taskResult: any = typeof taskExporter.executeJson === 'function'
        ? await taskExporter.executeJson({ format, filter: taskFilter })
        : await taskExporter.execute({ format, filter: taskFilter });

      if (taskResult && taskResult.success && taskResult.data) {
        const taskFile = path.join(outputDirectory, `tasks.${format}`);
        const taskCount = taskResult.data.count;

        const payload = taskResult.data.data;
        const toWrite = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        await fs.writeFile(taskFile, toWrite, 'utf-8');

        exports.tasks = {
          format: format,
          task_count: taskCount,
          exported: true,
        };
        totalExported += taskCount;
      }

      // Export projects
      const projectExporter = new ExportProjectsTool(this.cache) as any;
      const projectResult: any = typeof projectExporter.executeJson === 'function'
        ? await projectExporter.executeJson({ format, includeStats: includeProjectStats })
        : await projectExporter.execute({ format, includeStats: includeProjectStats });

      if (projectResult && projectResult.success && projectResult.data) {
        const projectFile = path.join(outputDirectory, `projects.${format}`);
        const projectCount = projectResult.data.count;

        const ppayload = projectResult.data.data;
        const pwrite = typeof ppayload === 'string' ? ppayload : JSON.stringify(ppayload, null, 2);
        await fs.writeFile(projectFile, pwrite, 'utf-8');

        exports.projects = {
          format: format,
          project_count: projectCount,
          exported: true,
        };
        totalExported += projectCount;
      }

      // Export tags (JSON only)
      const tagExporter = new TagsToolV2(this.cache) as any;
      const tagResult: any = typeof tagExporter.executeJson === 'function'
        ? await tagExporter.executeJson({ includeEmpty: true })
        : await tagExporter.execute({ includeEmpty: true });

      if (tagResult && tagResult.success && tagResult.data) {
        const tagFile = path.join(outputDirectory, 'tags.json');
        const tagItems = (tagResult.data.items || tagResult.data.tags || []);
        const tagCount = (tagResult.metadata?.total_count) || tagItems.length;

        await fs.writeFile(tagFile, JSON.stringify(tagItems, null, 2), 'utf-8');

        exports.tags = {
          format: 'json',
          tag_count: tagCount,
          exported: true,
        };
        totalExported += tagCount;
      }

      return createSuccessResponseV2('bulk_export', { exports, summary: { totalExported, export_date: new Date().toISOString() } }, undefined, { ...timer.toMetadata() });
    } catch (error) {
      // Provide specific recovery information for file system errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('eacces') || errorMessage.includes('permission')) {
          return createErrorResponseV2(
            'bulk_export',
            'PERMISSION_DENIED',
            `Cannot write to directory: ${outputDirectory}`,
            'Check directory permissions',
            {
              recovery: [
                'Check that the directory exists and is writable',
                'Try using a different output directory',
                'Ensure you have write permissions to the parent directory',
              ],
              path: outputDirectory,
            },
            timer.toMetadata(),
          );
        }
        if (errorMessage.includes('enospc')) {
          return createErrorResponseV2(
            'bulk_export',
            'DISK_FULL',
            'Not enough disk space to complete export',
            'Free disk space and try again',
            {
              recovery: [
                'Free up disk space and try again',
                'Choose a different output directory on a drive with more space',
              ],
              path: outputDirectory,
            },
            timer.toMetadata(),
          );
        }
        if (errorMessage.includes('enoent')) {
          return createErrorResponseV2(
            'bulk_export',
            'PATH_NOT_FOUND',
            `Output directory path not found: ${outputDirectory}`,
            'Verify the output directory path',
            {
              recovery: [
                'Verify the output directory path is correct',
                'Create the parent directory first',
                'Use an absolute path instead of a relative path',
              ],
              path: outputDirectory,
            },
            timer.toMetadata(),
          );
        }
      }
      // Fall back to generic error handling
      return this.handleError(error) as any;
    }
  }
}
