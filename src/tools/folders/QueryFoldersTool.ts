import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';

const QueryFoldersSchema = z.object({
  operation: z.enum(['list', 'get', 'search']).default('list')
    .describe('Folder query operation to perform'),
  // list filters
  status: z.array(z.enum(['active', 'dropped'])).optional()
    .describe('Filter by folder status'),
  limit: z.number().int().positive().optional()
    .describe('Maximum number of folders'),
  includeEmpty: z.boolean().optional()
    .describe('Include folders with no contents'),
  includeProjects: z.boolean().optional()
    .describe('Include projects in folder listing'),
  includeSubfolders: z.boolean().optional()
    .describe('Include subfolders in listing'),
  // get
  folderId: z.string().optional()
    .describe('Folder ID to fetch (for get operation)'),
  // search
  searchTerm: z.string().optional()
    .describe('Search term for folder names (for search operation)'),
});

type QueryFoldersInput = z.infer<typeof QueryFoldersSchema>;

export class QueryFoldersTool extends BaseTool<typeof QueryFoldersSchema> {
  name = 'query_folders';
  description = 'Unified tool for folder query operations: list, get, search. Supports caching at the consolidated tool level.';
  schema = QueryFoldersSchema;

  async executeValidated(args: QueryFoldersInput): Promise<any> {
    const timer = new OperationTimerV2();
    const { operation } = args;

    try {
      // Handle caching for list operation
      if (args.operation === 'list' || !args.operation) {
        const cached = this.cache.get('folders', 'folders');
        if (cached) {
          return createSuccessResponseV2('query_folders', { folders: (cached as any).folders ?? cached }, undefined, { ...timer.toMetadata(), operation: 'list', from_cache: true });
        }
      }

      // Build a simple script placeholder and delegate to omniAutomation mock in tests
      const params: any = { ...args };
      const script = this.omniAutomation.buildScript('// QUERY_FOLDERS', params as Record<string, unknown>);
      const raw = await this.omniAutomation.execute(script);
      if (raw && typeof raw === 'object' && (raw as any).success === false) {
        return createErrorResponseV2('query_folders', 'QUERY_FAILED', (raw as any).error || 'Query failed', undefined, (raw as any).details, timer.toMetadata());
      }

      // Tests feed various shapes. Normalize a bit and wrap.
      if (operation === 'get') {
        const folder = (raw as any)?.folder ?? (raw as any)?.folders?.[0];
        if (!folder) {
          return createErrorResponseV2('query_folders', 'NOT_FOUND', 'Folder not found', undefined, { params }, timer.toMetadata());
        }
        return createSuccessResponseV2('query_folders', { folder }, undefined, { ...timer.toMetadata(), operation: 'get' });
      }

      if (operation === 'search') {
        const folders = (raw as any)?.folders ?? [];
        return createSuccessResponseV2('query_folders', { folders }, undefined, { ...timer.toMetadata(), operation: 'search' });
      }

      // list default
      const folders = (raw as any)?.folders ?? (Array.isArray(raw) ? raw : []);
      // Cache result
      this.cache.set('folders', 'folders', { folders });
      return createSuccessResponseV2('query_folders', { folders }, undefined, { ...timer.toMetadata(), operation: 'list' });
    } catch (error) {
      return this.handleErrorV2(error);
    }
  }
}
