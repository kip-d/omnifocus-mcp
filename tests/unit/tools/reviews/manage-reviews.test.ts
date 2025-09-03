import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageReviewsTool } from '../../../../src/tools/reviews/ManageReviewsTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation.js';

// Mocks
vi.mock('../../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn()
}));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('ManageReviewsTool', () => {
  let mockCache: any;
  let mockOmni: any;
  let tool: ManageReviewsTool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    mockOmni = {
      buildScript: vi.fn(),
      execute: vi.fn(),
    };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new ManageReviewsTool(mockCache as any);
    (tool as any).omniAutomation = mockOmni;
  });

  function makeProjects() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date(now.getTime()).toISOString();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    return [
      { id: 'p1', name: 'Overdue', nextReviewDate: yesterday },
      { id: 'p2', name: 'Due Today', nextReviewDate: today },
      { id: 'p3', name: 'Due Soon', nextReviewDate: soon },
      { id: 'p4', name: 'No Schedule' },
    ];
  }

  it('lists projects for review with summary buckets', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.execute.mockResolvedValue({ projects: makeProjects() });

    const res: any = await tool.executeValidated({ operation: 'list_for_review', overdue: false, daysAhead: 7 } as any);

    expect(res.success).toBe(true);
    expect(res.metadata.operation).toBe('list_for_review');
    expect(res.data.items.length).toBe(4);

    const summary = res.metadata.review_summary;
    expect(summary.total_projects).toBe(4);
    expect(summary.overdue).toBeGreaterThanOrEqual(1);
    expect(summary.due_today).toBeGreaterThanOrEqual(1);
    expect(summary.due_soon).toBeGreaterThanOrEqual(1);
    expect(summary.no_schedule).toBeGreaterThanOrEqual(1);
  });

  it('returns cached response when available', async () => {
    const cached = { success: true, data: { items: [] }, metadata: { operation: 'list_for_review' } };
    mockCache.get.mockReturnValue(cached);

    const res: any = await tool.executeValidated({ operation: 'list_for_review', overdue: false, daysAhead: 7 } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.from_cache).toBe(true);
    expect(mockOmni.execute).not.toHaveBeenCalled();
  });

  it('handles null result from script', async () => {
    mockCache.get.mockReturnValue(null);
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.execute.mockResolvedValue(null);

    const res: any = await tool.executeValidated({ operation: 'list_for_review', overdue: false, daysAhead: 7 } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('NULL_RESULT');
  });

  it('marks project as reviewed and invalidates caches', async () => {
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.execute.mockResolvedValue({ ok: true, id: 'p1' });

    const res: any = await tool.executeValidated({ operation: 'mark_reviewed', projectId: 'p1', updateNextReviewDate: true } as any);
    expect(res.success).toBe(true);
    expect(res.metadata.operation).toBe('mark_reviewed');
    expect(res.metadata.reviewed_id).toBe('p1');
    expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    expect(mockCache.invalidate).toHaveBeenCalledWith('reviews');
  });

  it('set_schedule updates multiple projects and invalidates caches', async () => {
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.execute.mockResolvedValue({ updated: 2 });

    const res: any = await tool.executeValidated({
      operation: 'set_schedule',
      projectIds: ['a', 'b'],
      reviewInterval: { unit: 'week', steps: 1, fixed: false },
      nextReviewDate: '2025-01-01',
    } as any);

    expect(res.success).toBe(true);
    expect(res.metadata.operation).toBe('set_schedule');
    expect(res.metadata.projects_updated).toBe(2);
    expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    expect(mockCache.invalidate).toHaveBeenCalledWith('reviews');
  });

  it('clear_schedule clears schedules and invalidates caches', async () => {
    mockOmni.buildScript.mockReturnValue('script');
    mockOmni.execute.mockResolvedValue({ ok: true });

    const res: any = await tool.executeValidated({
      operation: 'clear_schedule',
      projectIds: ['x', 'y'],
    } as any);

    expect(res.success).toBe(true);
    expect(res.metadata.operation).toBe('clear_schedule');
    expect(res.metadata.projects_updated).toBe(2);
    expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    expect(mockCache.invalidate).toHaveBeenCalledWith('reviews');
  });
});

