import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternAnalysisToolV2 } from '../../../../src/tools/analytics/PatternAnalysisToolV2.js';
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

describe('PatternAnalysisToolV2', () => {
  let mockCache: any;
  let mockOmni: any;
  let tool: PatternAnalysisToolV2;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    mockOmni = {
      executeJson: vi.fn(),
    };
    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmni);
    tool = new PatternAnalysisToolV2(mockCache as any);
    // Ensure the tool uses our mock
    (tool as any).omniAutomation = mockOmni;
  });

  function sampleData() {
    const now = new Date();
    const past = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000); // 40d ago
    const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    return {
      tasks: [
        // duplicate-ish names across different projects
        { id: 't1', name: 'Email Client Proposal', project: 'Work', projectId: 'p1', tags: ['work'], status: 'available', completed: false, flagged: false, createdDate: past.toISOString(), dueDate: yesterday.toISOString() },
        { id: 't2', name: 'email client proposal', project: 'Side', projectId: 'p2', tags: [], status: 'available', completed: false, flagged: false, createdDate: past.toISOString() },
        // waiting pattern via name
        { id: 't3', name: 'Waiting for Bob to send data', project: 'Work', projectId: 'p1', tags: [], status: 'blocked', completed: false, flagged: false, createdDate: past.toISOString() },
        // next action clarity issues
        { id: 't4', name: 'Think about marketing plan and milestones', project: 'Work', projectId: 'p1', tags: [], status: 'available', completed: false, flagged: true },
        // due soon to populate deadline buckets
        { id: 't5', name: 'Finish report', project: 'Work', projectId: 'p1', tags: [], status: 'available', completed: false, flagged: false, dueDate: tomorrow.toISOString() },
        // estimated/completed (for estimation bias paths)
        { id: 't6', name: 'Quick fix', project: 'Side', projectId: 'p2', tags: [], status: 'available', completed: true, flagged: false, completionDate: now.toISOString(), estimatedMinutes: 30 },
      ],
      projects: [
        { id: 'p1', name: 'Work', status: 'active', taskCount: 10, availableTaskCount: 5, modificationDate: past.toISOString(), lastReviewDate: past.toISOString(), nextReviewDate: yesterday.toISOString() },
        { id: 'p2', name: 'Side', status: 'active', taskCount: 3, availableTaskCount: 3 }, // never reviewed
        { id: 'p3', name: 'Done Project', status: 'done', taskCount: 0, availableTaskCount: 0 },
      ],
      tags: [
        { id: 'tag1', name: 'work', taskCount: 1 },
        { id: 'tag2', name: 'errands', taskCount: 0 }, // unused
        { id: 'tag3', name: 'errand', taskCount: 1 }, // synonym-ish to errands
      ],
    };
  }

  it('analyzes selected patterns and returns analytics response', async () => {
    mockOmni.executeJson.mockResolvedValue(sampleData());

    const result: any = await tool.executeValidated({
      patterns: ['duplicates', 'tag_audit', 'deadline_health', 'waiting_for', 'review_gaps', 'next_actions'],
      options: {
        duplicateSimilarityThreshold: 0.6,
        includeCompleted: true,
        maxTasks: 500,
      },
    } as any);

    expect(result.success).toBe(true);
    expect(result.metadata.operation).toBe('analyze_patterns');
    expect(result.metadata.from_cache).toBe(false);
    expect(result.data).toBeDefined();

    // Spot-check key findings
    expect(result.data.duplicates).toBeDefined();
    expect(result.data.duplicates.count).toBeGreaterThanOrEqual(1);
    expect(result.data.tag_audit).toBeDefined();
    expect(result.data.deadline_health).toBeDefined();
    expect(result.data.waiting_for).toBeDefined();
    expect(result.data.review_gaps).toBeDefined();
    expect(result.data.next_actions).toBeDefined();
  });

  it('expands patterns=all and parses stringified options (including double-encoded JSON)', async () => {
    const data = sampleData();
    // Return a JSON string to exercise string parsing branch in fetchSlimmedData
    mockOmni.executeJson.mockResolvedValue(JSON.stringify(data));

    const stringified = JSON.stringify({ similarity_threshold: '0.75', include_completed: 'true', max_tasks: '2000' });
    const doubleEncoded = JSON.stringify(stringified);

    const result: any = await tool.executeValidated({
      patterns: ['all'],
      options: doubleEncoded,
    } as any);

    expect(result.success).toBe(true);
    // Should include multiple pattern keys due to expansion
    const keys = Object.keys(result.data);
    expect(keys).toContain('duplicates');
    expect(keys).toContain('dormant_projects');
    expect(keys).toContain('tag_audit');
    expect(keys).toContain('deadline_health');
  });

  it('throws on missing data from OmniAutomation (handled upstream by BaseTool)', async () => {
    mockOmni.executeJson.mockResolvedValue(null);

    await expect(tool.executeValidated({
      patterns: ['duplicates'],
      options: {},
    } as any)).rejects.toBeTruthy();
  });
});

