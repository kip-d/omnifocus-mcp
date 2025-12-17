import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FoldersTool } from '../../../../src/tools/folders/FoldersTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

vi.mock('../../../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

describe('FoldersTool (Query Operations)', () => {
  let tool: FoldersTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() };
    mockOmni = { buildScript: vi.fn(), execute: vi.fn(), executeJson: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new FoldersTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
    (tool as any).execJson = vi.fn();
  });

  it('list uses cache when includeProjects is false', async () => {
    mockCache.get.mockReturnValue([{ id: 'f1', name: 'Work' }]);
    const res: any = await tool.execute({ operation: 'list' } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(res.data.folders[0].name).toBe('Work');
  });

  it('get returns GET_FAILED when script execution fails', async () => {
    mockCache.get.mockReturnValue(null);
    (tool as any).execJson.mockResolvedValue({ success: false, error: 'Script failed' });
    const res: any = await tool.execute({ operation: 'get', folderId: 'f123' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('GET_FAILED');
  });

  it('get returns NOT_FOUND when folder id missing', async () => {
    (tool as any).execJson.mockResolvedValue({
      success: true,
      data: { items: [] }, // Empty result - no matching folder
    });
    const res: any = await tool.execute({ operation: 'get', folderId: 'missing' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('NOT_FOUND');
  });
});
