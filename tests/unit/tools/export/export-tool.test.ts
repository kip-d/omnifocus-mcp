import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportTool } from '../../../../src/tools/export/ExportTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

// Mock dependencies
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

// Mock OmniAutomation - the tool uses direct implementation, not delegation
const mockOmniAutomation = {
  buildScript: vi.fn((script, params) => `mocked_script_${script}_${JSON.stringify(params)}`),
  executeJson: vi.fn(),
  execute: vi.fn(),
};

vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn(() => mockOmniAutomation)
}));

// Mock TagsToolV2 for bulk export
const mockTagsToolV2 = {
  executeValidated: vi.fn(async () => ({
    success: true,
    data: { tags: [{ id: 't1', name: 'work' }] }
  }))
};

vi.mock('../../../../src/tools/tags/TagsToolV2.js', () => ({
  TagsToolV2: vi.fn(() => mockTagsToolV2)
}));

// Mock fs for bulk export
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/utils/response-format-v2.js', () => ({
  createErrorResponseV2: vi.fn((operation, code, message, suggestion, details, metadata) => ({
    success: false,
    data: {},
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
    error: { code, message, suggestion, details },
  })),
  createSuccessResponseV2: vi.fn((operation, data, summary, metadata) => ({
    success: true,
    data,
    summary,
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
  })),
  OperationTimerV2: vi.fn().mockImplementation(() => ({ toMetadata: vi.fn(() => ({ query_time_ms: 1 })) })),
}));

describe('ExportTool (consolidated)', () => {
  let tool: ExportTool;
  let mockCache: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new ExportTool(mockCache);
    // Reset mock implementations
    mockOmniAutomation.executeJson.mockReset();
    mockOmniAutomation.execute.mockReset();
    mockOmniAutomation.buildScript.mockReset();
  });

  it('exports tasks with direct implementation', async () => {
    // Mock successful task export response
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { tasks: [{ id: 't1', name: 'Test Task' }] }
    });

    const res: any = await tool.executeValidated({
      type: 'tasks',
      format: 'json',
      filter: { completed: false },
      fields: ['id', 'name']
    } as any);

    expect(res.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
  });

  it('exports projects with direct implementation', async () => {
    // Mock successful project export response
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { projects: [{ id: 'p1', name: 'Test Project' }] }
    });

    const res: any = await tool.executeValidated({
      type: 'projects',
      format: 'json',
      includeStats: true
    } as any);

    expect(res.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
  });

  it('performs bulk export when type=all with outputDirectory', async () => {
    // Mock successful export responses
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'test1', name: 'Test Item' }] }
    });

    const res: any = await tool.executeValidated({
      type: 'all',
      format: 'json',
      outputDirectory: '/tmp/export',
      includeCompleted: true
    } as any);

    expect(res.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled(); // both tasks and projects should be called
    expect(mockTagsToolV2.executeValidated).toHaveBeenCalled(); // tags export
  });

  it('returns error when type=all without outputDirectory', async () => {
    const res: any = await tool.executeValidated({
      type: 'all',
      format: 'json'
    } as any);

    expect(res.success).toBe(false);
    expect(res.error.code).toBe('MISSING_PARAMETER');
    expect(res.error.message).toContain('outputDirectory');
  });

  it('returns error for invalid type', async () => {
    const res: any = await tool.executeValidated({
      type: 'invalid',
      format: 'json'
    } as any);

    expect(res.success).toBe(false);
    // This would be caught by Zod schema validation before reaching the tool
  });
});