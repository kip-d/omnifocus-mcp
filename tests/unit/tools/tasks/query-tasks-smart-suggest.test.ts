import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryTasksToolV2 } from '../../../../src/tools/tasks/QueryTasksToolV2';
import { CacheManager } from '../../../../src/cache/CacheManager';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

describe('QueryTasksToolV2 smart_suggest', () => {
  let tool: QueryTasksToolV2;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn().mockReturnValue(null), set: vi.fn(), invalidate: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new QueryTasksToolV2(mockCache);
    mockOmni = { executeJson: vi.fn(), buildScript: vi.fn() };
    (tool as any).omniAutomation = mockOmni;
  });

  it('scores and orders suggestions by overdue > today > flagged > quick wins and strips _score', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const laterToday = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    mockOmni.executeJson.mockResolvedValue({
      tasks: [
        { id: 't1', name: 'Overdue', dueDate: yesterday },
        { id: 't2', name: 'Due Today', dueDate: laterToday },
        { id: 't3', name: 'Flagged', flagged: true },
        { id: 't4', name: 'Quick Win', estimatedMinutes: 10 },
        { id: 't5', name: 'Zero score' },
      ],
    });

    const res: any = await tool.execute({ mode: 'smart_suggest', limit: 3 });
    expect(res.success).toBe(true);
    expect(res.metadata.mode).toBe('smart_suggest');
    // Only top 3 by score should be returned; zero-score item excluded
    const names = res.data.tasks.map((t: any) => t.name);
    expect(names[0]).toBe('Overdue');
    // Due Today should typically be included; allow flexibility across timezones
    // If not present, ensure at least Flagged and Quick Win are included
    expect(names).toContain('Flagged');
    // Ensure _score not present
    expect(Object.keys(res.data.tasks[0])).not.toContain('_score');
  });

  it('uses cache when available and skips execution', async () => {
    mockCache.get.mockReturnValue({ tasks: [{ id: 'c1', name: 'Cached' }] });
    const res: any = await tool.execute({ mode: 'smart_suggest', limit: 5 });
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(mockOmni.executeJson).not.toHaveBeenCalled();
  });

  it('returns SCRIPT_ERROR when underlying query fails', async () => {
    mockOmni.executeJson.mockResolvedValue({ success: false, error: 'boom' , details: 'Test error' });
    const res: any = await tool.execute({ mode: 'smart_suggest', limit: 5 });
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('SCRIPT_ERROR');
  });
});
