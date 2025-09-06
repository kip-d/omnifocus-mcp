import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryFoldersTool } from '../../../../src/tools/folders/QueryFoldersTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

vi.mock('../../../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../../../src/utils/logger.js', () => ({ createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

describe('QueryFoldersTool', () => {
  let tool: QueryFoldersTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn() };
    mockOmni = { buildScript: vi.fn(), execute: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new QueryFoldersTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
  });

  it('list uses cache when includeProjects is false', async () => {
    mockCache.get.mockReturnValue({ folders: [{ id: 'f1', name: 'Work' }], count: 1 });
    const res: any = await tool.execute({ operation: 'list' } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(res.data.folders[0].name).toBe('Work');
  });

  it('get returns PARSE_ERROR when response is invalid JSON', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.execute.mockResolvedValue('not-json');
    const res: any = await tool.execute({ operation: 'get', folderId: 'f123' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('PARSE_ERROR');
  });

  it('get returns NOT_FOUND when folder id missing', async () => {
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.execute.mockResolvedValue(JSON.stringify({ folders: [] }));
    const res: any = await tool.execute({ operation: 'get', folderId: 'missing' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('NOT_FOUND');
  });
});

