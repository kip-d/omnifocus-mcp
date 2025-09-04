import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BulkExportTool } from '../../../src/tools/export/BulkExportTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { createMockedTool, createExportTasksMock, ResponseBuilder } from '../../utils/mock-factories.js';
import { SchemaTestHelper } from '../../utils/schema-helpers.js';

// Mock fs/promises at module level
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock the dependent tools
vi.mock('../../../src/tools/export/ExportTasksTool.js', () => ({
  ExportTasksTool: vi.fn().mockImplementation(() => ({
    executeJson: vi.fn().mockResolvedValue({
      success: true,
      data: { data: '[]', count: 0 },
    }),
  })),
}));

vi.mock('../../../src/tools/export/ExportProjectsTool.js', () => ({
  ExportProjectsTool: vi.fn().mockImplementation(() => ({
    executeJson: vi.fn().mockResolvedValue({
      success: true,
      data: { data: '[]', count: 0 },
    }),
  })),
}));

vi.mock('../../../src/tools/tags/TagsToolV2.js', () => ({
  TagsToolV2: vi.fn().mockImplementation(() => ({
    executeJson: vi.fn().mockResolvedValue({
      success: true,
      data: { items: [] },
      metadata: { total_count: 0 },
    }),
  })),
}));

// Mock response format utilities
vi.mock('../../../src/utils/response-format.js', () => ({
  createSuccessResponse: vi.fn((operation, data, metadata) => ({
    success: true,
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
  })),
  createErrorResponse: vi.fn((operation, code, message, details, metadata) => ({
    success: false,
    data: null,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
    error: {
      code,
      message,
      details,
    },
  })),
  OperationTimer: vi.fn().mockImplementation(() => ({
    toMetadata: vi.fn(() => ({ query_time_ms: 100 })),
  })),
}));

describe('BulkExportTool', () => {
  let tool: BulkExportTool;
  let mockCache: any;
  let mockFs: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };
    
    // Get mocked fs module
    mockFs = await import('fs/promises');
    
    tool = new BulkExportTool(mockCache);
  });

  describe('basic functionality', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('bulk_export');
      expect(tool.description).toContain('Export all OmniFocus data to files');
      expect(tool.description).toContain('json|csv');
    });

    it('should use default parameters when not specified', async () => {
      const result = await tool.execute({
        outputDirectory: '/tmp/test',
      });

      expect(result.success).toBe(true);
      expect(result.data.exports.tasks).toBeDefined();
      expect(result.data.exports.projects).toBeDefined();
      expect(result.data.exports.tags).toBeDefined();
      expect(result.data.exports.tasks.format).toBe('json');
      expect(result.data.exports.projects.format).toBe('json');
      expect(result.data.exports.tags.format).toBe('json');
    });

    it('should override default parameters when specified', async () => {
      const { ExportTasksTool } = await import('../../../src/tools/export/ExportTasksTool.js');
      const { ExportProjectsTool } = await import('../../../src/tools/export/ExportProjectsTool.js');
      
      // Update mocks for CSV format
      (ExportTasksTool as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: true,
          data: { data: 'col1,col2\nval1,val2', count: 1 },
        }),
      }));
      
      (ExportProjectsTool as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: true,
          data: { data: 'col1,col2\nval1,val2', count: 1 },
        }),
      }));

      const result = await tool.execute({
        outputDirectory: '/tmp/test',
        format: 'csv',
        includeCompleted: false,
        includeProjectStats: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.exports.tasks.format).toBe('csv');
      expect(result.data.exports.projects.format).toBe('csv');
      expect(result.data.exports.tags.format).toBe('json'); // Tags are always JSON
    });
  });

  describe('file system operations', () => {
    it('should create output directory if it does not exist', async () => {
      await tool.execute({
        outputDirectory: '/tmp/new-directory',
      });

      expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/new-directory', { recursive: true });
    });

    it('should write files with correct extensions', async () => {
      await tool.execute({
        outputDirectory: '/tmp/test',
        format: 'json',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/tmp/test/tasks.json',
        expect.any(String),
        'utf-8'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/tmp/test/projects.json',
        expect.any(String),
        'utf-8'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/tmp/test/tags.json',
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('export operations', () => {
    it('should export tasks successfully', async () => {
      const { ExportTasksTool } = await import('../../../src/tools/export/ExportTasksTool.js');
      
      (ExportTasksTool as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: true,
          data: { data: '[{"id":"1","name":"Test Task"}]', count: 1 },
        }),
      }));

      const result = await tool.execute({
        outputDirectory: '/tmp/test',
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.data.exports.tasks.exported).toBe(true);
      expect(result.data.exports.tasks.task_count).toBe(1);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.totalExported).toBeGreaterThanOrEqual(1);
    });

    it('should export projects successfully', async () => {
      const { ExportProjectsTool } = await import('../../../src/tools/export/ExportProjectsTool.js');
      
      (ExportProjectsTool as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: true,
          data: { data: '[{"id":"1","name":"Test Project"}]', count: 1 },
        }),
      }));

      const result = await tool.execute({
        outputDirectory: '/tmp/test',
        format: 'csv',
      });

      expect(result.success).toBe(true);
      expect(result.data.exports.projects.exported).toBe(true);
      expect(result.data.exports.projects.project_count).toBe(1);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.totalExported).toBeGreaterThanOrEqual(1);
    });

    it('should export tags successfully', async () => {
      const { TagsToolV2 } = await import('../../../src/tools/tags/TagsToolV2.js');
      
      (TagsToolV2 as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: true,
          data: { items: [{ id: '1', name: 'Test Tag' }] },
          metadata: { total_count: 1 },
        }),
      }));

      const result = await tool.execute({
        outputDirectory: '/tmp/test',
      });

      expect(result.success).toBe(true);
      expect(result.data.exports.tags.exported).toBe(true);
      expect(result.data.exports.tags.tag_count).toBe(1);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.totalExported).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('should handle task export failures gracefully', async () => {
      const { ExportTasksTool } = await import('../../../src/tools/export/ExportTasksTool.js');
      
      (ExportTasksTool as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: false,
          error: 'Task export failed',
        }),
      }));

      const result = await tool.execute({
        outputDirectory: '/tmp/test',
      });

      // Should still succeed even if individual exports fail
      expect(result.success).toBe(true);
      // Tasks should not be in exports if they failed
      expect(result.data.exports.tasks).toBeUndefined();
    });

    it('should handle project export failures gracefully', async () => {
      const { ExportProjectsTool } = await import('../../../src/tools/export/ExportProjectsTool.js');
      
      (ExportProjectsTool as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: false,
          error: 'Project export failed',
        }),
      }));

      const result = await tool.execute({
        outputDirectory: '/tmp/test',
      });

      expect(result.success).toBe(true);
      expect(result.data.exports.projects).toBeUndefined();
    });

    it('should handle tag export failures gracefully', async () => {
      const { TagsToolV2 } = await import('../../../src/tools/tags/TagsToolV2.js');
      
      (TagsToolV2 as any).mockImplementation(() => ({
        executeJson: vi.fn().mockResolvedValue({
          success: false,
          error: 'Tag export failed',
        }),
      }));

      const result = await tool.execute({
        outputDirectory: '/tmp/test',
      });

      expect(result.success).toBe(true);
      expect(result.data.exports.tags).toBeUndefined();
    });
  });
});