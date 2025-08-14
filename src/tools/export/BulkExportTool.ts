import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ExportTasksTool } from './ExportTasksTool.js';
import { ExportProjectsTool } from './ExportProjectsTool.js';
import { ListTagsTool } from '../tags/ListTagsTool.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { BulkExportResponse, BulkExportResponseData, ExportTasksResponse, ExportProjectsResponse, ListTasksResponse } from '../response-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BulkExportSchema } from '../schemas/export-schemas.js';

export class BulkExportTool extends BaseTool<typeof BulkExportSchema> {
  name = 'bulk_export';
  description = 'Export all OmniFocus data to files. Specify outputDirectory. Format: json|csv. Set includeCompleted=true for complete backup, includeProjectStats for metrics. Creates 3 files.';
  schema = BulkExportSchema;

  async executeValidated(args: z.infer<typeof BulkExportSchema>): Promise<BulkExportResponse> {
    const timer = new OperationTimer();
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

      // Export tasks
      const taskExporter = new ExportTasksTool(this.cache);
      const taskFilter = includeCompleted ? {} : { completed: false };
      const taskResult = await taskExporter.execute({ format, filter: taskFilter }) as ExportTasksResponse;

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
          task_count: taskCount,
          exported: true,
        };
        totalExported += taskCount;
      }

      // Export projects
      const projectExporter = new ExportProjectsTool(this.cache);
      const projectResult = await projectExporter.execute({
        format,
        includeStats: includeProjectStats,
      }) as ExportProjectsResponse;

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
          project_count: projectCount,
          exported: true,
        };
        totalExported += projectCount;
      }

      // Export tags (JSON only)
      const tagExporter = new ListTagsTool(this.cache);
      const tagResult = await tagExporter.execute({ includeEmpty: true }) as ListTasksResponse;

      if (tagResult.success && tagResult.data) {
        const tagFile = path.join(outputDirectory, 'tags.json');
        const tagItems = tagResult.data.items || [];
        const tagCount = tagResult.metadata?.total_count || tagItems.length;

        await fs.writeFile(tagFile, JSON.stringify(tagItems, null, 2), 'utf-8');

        exports.tags = {
          format: 'json',
          tag_count: tagCount,
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
            export_date: new Date().toISOString(),
          },
        },
        {
          ...timer.toMetadata(),
        },
      );
    } catch (error) {
      // Provide specific recovery information for file system errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('eacces') || errorMessage.includes('permission')) {
          return createErrorResponse(
            'bulk_export',
            'PERMISSION_DENIED',
            `Cannot write to directory: ${outputDirectory}`,
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
          return createErrorResponse(
            'bulk_export',
            'DISK_FULL',
            'Not enough disk space to complete export',
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
          return createErrorResponse(
            'bulk_export',
            'PATH_NOT_FOUND',
            `Output directory path not found: ${outputDirectory}`,
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
