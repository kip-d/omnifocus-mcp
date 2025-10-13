import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportTool } from '../../../../src/tools/export/ExportTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

// Mock deps
vi.mock('../../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

// Mock the export scripts since we're testing the self-contained implementation
vi.mock('../../../../src/omnifocus/scripts/export/export-tasks.js', () => ({
  EXPORT_TASKS_SCRIPT: 'mock-tasks-export-script'
}));
vi.mock('../../../../src/omnifocus/scripts/export/export-projects.js', () => ({
  EXPORT_PROJECTS_SCRIPT: 'mock-projects-export-script'
}));

// Mock TagsToolV2 for bulk export
vi.mock('../../../../src/tools/tags/TagsToolV2.js', () => ({
  TagsToolV2: vi.fn().mockImplementation(() => ({
    execute: vi.fn(async () => ({
      success: true,
      data: { items: [{ id: 't1', name: 'Work' }] },
      metadata: { total_count: 1 }
    }))
  }))
}));

vi.mock('../../../../src/utils/response-format-v2.js', () => ({
  createErrorResponseV2: vi.fn((operation, code, message, suggestion, details, metadata) => ({
    success: false,
    data: {},
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
    error: { code, message, suggestion, details },
  })),
  createSuccessResponseV2: vi.fn((operation, data, suggestion, metadata) => ({
    success: true,
    data,
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
  })),
  OperationTimerV2: vi.fn().mockImplementation(() => ({ toMetadata: vi.fn(() => ({ query_time_ms: 5 })) })),
}));

// Mock fs for bulk export
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/'))
}));

describe('ExportTool (self-contained implementation)', () => {
  let mockCache: any;
  let mockOmni: any;
  let tool: ExportTool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() };
    mockOmni = { buildScript: vi.fn(), execute: vi.fn(), executeJson: vi.fn() };
    
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new ExportTool(mockCache);
    (tool as any).omniAutomation = mockOmni;
  });

  describe('Task Export', () => {
    it('handles task export with direct script execution', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { format: 'json', data: [{ id: 't1', name: 'Test Task' }], count: 1 }
      });

      const res: any = await tool.executeValidated({ 
        type: 'tasks', 
        format: 'json', 
        filter: { search: 'test' } 
      } as any);

      expect(res.success).toBe(true);
      expect(res.data.format).toBe('json');
      expect(res.data.count).toBe(1);
      expect(mockOmni.buildScript).toHaveBeenCalledWith('mock-tasks-export-script', {
        format: 'json',
        filter: { search: 'test' },
        fields: undefined
      });
    });

    it('handles task export failures', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: false,
        error: 'Export failed'
      });

      const res: any = await tool.executeValidated({ type: 'tasks' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('TASK_EXPORT_FAILED');
    });
  });

  describe('Project Export', () => {
    it('handles project export with direct script execution', async () => {
      mockOmni.buildScript.mockReturnValue('mock-script');
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          format: 'json',
          data: [{ id: 'p1', name: 'Test Project' }],
          count: 1
        }
      });

      const res: any = await tool.executeValidated({ 
        type: 'projects', 
        format: 'json',
        includeStats: true 
      } as any);

      expect(res.success).toBe(true);
      expect(res.data.format).toBe('json');
      expect(res.data.count).toBe(1);
      expect(res.data.includeStats).toBe(true);
      expect(mockOmni.buildScript).toHaveBeenCalledWith('mock-projects-export-script', {
        format: 'json',
        includeStats: true
      });
    });

    it('handles project export failures', async () => {
      mockOmni.buildScript.mockReturnValue('mock-script');
      mockOmni.executeJson.mockResolvedValue({
        success: false,
        error: 'Projects export failed'
      });

      const res: any = await tool.executeValidated({ type: 'projects' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('SCRIPT_ERROR');
    });
  });

  describe('Bulk Export', () => {
    beforeEach(() => {
      // Mock dynamic fs import
      vi.doMock('fs', () => ({
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
      }));
    });

    it('handles bulk export with direct implementation', async () => {
      mockOmni.buildScript.mockReturnValue('mock-script');
      // Mock both task and project exports with executeJson
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { format: 'json', data: [{ id: 't1' }], count: 1 }
      });

      const res: any = await tool.executeValidated({ 
        type: 'all',
        outputDirectory: '/tmp/export',
        format: 'json',
        includeCompleted: true,
        includeProjectStats: true
      } as any);

      expect(res.success).toBe(true);
      expect(res.data.exports).toBeDefined();
      expect(res.data.exports.tasks).toBeDefined();
      expect(res.data.exports.projects).toBeDefined();
      expect(res.data.exports.tags).toBeDefined();
      expect(res.data.summary.totalExported).toBeGreaterThan(0);
    });

    it('requires outputDirectory for bulk export', async () => {
      const res: any = await tool.executeValidated({ type: 'all' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('outputDirectory is required');
    });

    it('handles directory creation failures', async () => {
      // Mock fs import to throw error
      vi.doMock('fs', () => ({
        mkdirSync: vi.fn(() => { throw new Error('EACCES: permission denied'); })
      }));

      const res: any = await tool.executeValidated({ 
        type: 'all',
        outputDirectory: '/protected/path'
      } as any);

      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MKDIR_FAILED');
    });
  });

  describe('Validation', () => {
    it('returns error for invalid export type', async () => {
      const res: any = await tool.executeValidated({ type: 'invalid' as any } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('INVALID_TYPE');
      expect(res.error.message).toContain('Invalid export type');
    });
  });

  describe('Script Building', () => {
    it('builds task export script with correct parameters', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { format: 'csv', data: 'id,name\nt1,Task1', count: 1 }
      });

      await tool.executeValidated({ 
        type: 'tasks',
        format: 'csv',
        filter: { completed: false },
        fields: ['id', 'name']
      } as any);

      expect(mockOmni.buildScript).toHaveBeenCalledWith('mock-tasks-export-script', {
        format: 'csv',
        filter: { completed: false },
        fields: ['id', 'name']
      });
    });

    it('builds project export script with correct parameters', async () => {
      mockOmni.buildScript.mockReturnValue('mock-script');
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          format: 'markdown',
          data: '# Projects\n## Project 1',
          count: 1
        }
      });

      await tool.executeValidated({ 
        type: 'projects',
        format: 'markdown',
        includeStats: false
      } as any);

      expect(mockOmni.buildScript).toHaveBeenCalledWith('mock-projects-export-script', {
        format: 'markdown',
        includeStats: false
      });
    });
  });
});