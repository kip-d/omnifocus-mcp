import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportTool } from '../../../../src/tools/export/ExportTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

// Mock child export tools and deps
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
vi.mock('../../../../src/tools/export/ExportTasksTool.js', () => ({
  ExportTasksTool: vi.fn().mockImplementation(() => ({
    execute: vi.fn(async (args: any) => ({
      success: true,
      data: { format: args.format || 'json', data: '[]', count: 0 },
      metadata: { operation: 'export_tasks', timestamp: new Date().toISOString(), from_cache: false },
    }))
  })),
}));
vi.mock('../../../../src/tools/export/ExportProjectsTool.js', () => ({
  ExportProjectsTool: vi.fn().mockImplementation(() => ({
    execute: vi.fn(async (args: any) => ({
      success: true,
      data: { format: args.format || 'json', data: '[]', count: 0, includeStats: !!args.includeStats },
      metadata: { operation: 'export_projects', timestamp: new Date().toISOString(), from_cache: false },
    }))
  })),
}));
vi.mock('../../../../src/tools/export/BulkExportTool.js', () => ({
  BulkExportTool: vi.fn().mockImplementation(() => ({
    execute: vi.fn(async (args: any) => ({
      success: true,
      data: { wrote: ['tasks.json', 'projects.json'], outputDirectory: args.outputDirectory, format: args.format || 'json' },
      metadata: { operation: 'export_all', timestamp: new Date().toISOString(), from_cache: false },
    }))
  })),
}));
vi.mock('../../../../src/utils/response-format-v2.js', () => ({
  createErrorResponseV2: vi.fn((operation, code, message, suggestion, details, metadata) => ({
    success: false,
    data: {},
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
    error: { code, message, suggestion, details },
  })),
  OperationTimerV2: vi.fn().mockImplementation(() => ({ toMetadata: vi.fn(() => ({ query_time_ms: 5 })) })),
}));

describe('ExportTool (consolidated)', () => {
  let mockCache: any;
  let tool: ExportTool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new ExportTool(mockCache as any);
  });

  it('delegates to task export', async () => {
    const res: any = await tool.executeValidated({ type: 'tasks', format: 'csv', filter: { search: 'foo' } } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.operation).toBe('export_tasks');
    expect(res.data.format).toBe('csv');
  });

  it('delegates to project export', async () => {
    const res: any = await tool.executeValidated({ type: 'projects', includeStats: true } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.operation).toBe('export_projects');
    expect(res.data.includeStats).toBe(true);
  });

  it('delegates to bulk export when type=all', async () => {
    const res: any = await tool.executeValidated({ type: 'all', outputDirectory: '/tmp/out', format: 'json' } as any);
    expect(res.success).toBe(true);
    expect(res.data.outputDirectory).toBe('/tmp/out');
    expect(res.data.wrote.length).toBeGreaterThan(0);
  });

  it('returns error when type=all without outputDirectory', async () => {
    const res: any = await tool.executeValidated({ type: 'all', format: 'json' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('MISSING_PARAMETER');
    expect(res.error.message).toContain('outputDirectory');
  });

  it('returns error for invalid type', async () => {
    const res: any = await tool.executeValidated({ type: 'bogus' as any } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('INVALID_TYPE');
  });
});
