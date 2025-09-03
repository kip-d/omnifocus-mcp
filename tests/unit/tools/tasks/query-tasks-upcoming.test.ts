import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryTasksToolV2 } from '../../../../src/tools/tasks/QueryTasksToolV2';
import { CacheManager } from '../../../../src/cache/CacheManager';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation';

vi.mock('../../../../src/cache/CacheManager');
vi.mock('../../../../src/omnifocus/OmniAutomation');
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

describe('QueryTasksToolV2 upcoming mode', () => {
  let tool: QueryTasksToolV2;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn().mockReturnValue(null), set: vi.fn(), invalidate: vi.fn() };
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new QueryTasksToolV2(mockCache);
    mockOmni = { execute: vi.fn(), buildScript: vi.fn() };
    (tool as any).omniAutomation = mockOmni;
  });

  it('returns from cache when available', async () => {
    mockCache.get.mockReturnValue({ tasks: [{ id: 'c1', name: 'Cached upcoming' }] });
    const res: any = await tool.execute({ mode: 'upcoming', limit: 5 });
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(res.metadata.mode).toBe('upcoming');
    expect(res.metadata.days_ahead).toBe(7); // default
  });

  it('propagates SCRIPT_ERROR with suggestion on failure', async () => {
    mockOmni.execute.mockResolvedValue({ error: true, message: 'boom' });
    const res: any = await tool.execute({ mode: 'upcoming', limit: 5, daysAhead: 10 });
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('SCRIPT_ERROR');
    expect(res.error.suggestion).toMatch(/reducing the days_ahead/i);
  });

  it('returns success and sets metadata on normal execution', async () => {
    mockOmni.execute.mockResolvedValue({ tasks: [{ id: 'u1', name: 'Soon' }] });
    const res: any = await tool.execute({ mode: 'upcoming', limit: 3, daysAhead: 3 });
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(false);
    expect(res.metadata.mode).toBe('upcoming');
    expect(res.metadata.days_ahead).toBe(3);
    expect(res.data.tasks[0].id).toBe('u1');
  });
});

