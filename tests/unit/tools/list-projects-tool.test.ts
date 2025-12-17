import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectsTool } from '../../../src/tools/projects/ProjectsTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';
import { Logger } from '../../../src/utils/Logger.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn(),
}));
vi.mock('../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn(),
}));
vi.mock('../../../src/utils/Logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('ProjectsTool', () => {
  let tool: ProjectsTool;
  let mockCache: any;
  let mockOmniAutomation: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
    };

    mockOmniAutomation = {
      buildScript: vi.fn(),
      executeJson: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new ProjectsTool(mockCache);
    (tool as any).omniAutomation = mockOmniAutomation;
  });

  describe('details parameter', () => {
    it('should use OmniJS bridge when details is true', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [],
        metadata: {
          total_available: 0,
          returned_count: 0,
          optimization: 'omnijs_v3',
          stats_included: true,
        },
      });

      const result = await tool.executeValidated({
        operation: 'list',
        limit: 10,
        details: true,
      });

      // v3 implementation uses executeJson directly with generated script string
      expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
      const [[scriptString]] = mockOmniAutomation.executeJson.mock.calls;
      // Script string should contain OmniJS bridge pattern
      expect(scriptString).toContain('evaluateJavascript');
      expect(result.success).toBe(true);
    });

    it('should default details to false for performance', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [],
        metadata: {},
      });

      const result = await tool.executeValidated({ operation: 'list', limit: 10 });

      // v3 implementation uses executeJson directly with generated script string
      expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should include stats in project response when details enabled', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [
          {
            id: 'proj-1',
            name: 'Test Project',
            status: 'active',
            flagged: false,
            numberOfTasks: 10,
            stats: {
              active: 7,
              completed: 3,
              total: 10,
              completionRate: 30,
              overdue: 2,
              flagged: 1,
              estimatedHours: '5.5',
              lastActivityDate: '2025-07-24T00:00:00.000Z',
            },
          },
        ],
        metadata: {
          total_available: 1,
          returned_count: 1,
          limit_applied: 10,
        },
      });

      const result = await tool.executeValidated({ operation: 'list', includeStats: true });

      expect(result.data.items[0]).toHaveProperty('stats');
      expect(result.data.items[0].stats).toHaveProperty('active', 7);
      expect(result.data.items[0].stats).toHaveProperty('completed', 3);
      expect(result.data.items[0].stats).toHaveProperty('completionRate', 30);
      expect(result.data.items[0].stats).toHaveProperty('overdue', 2);
      expect(result.data.items[0].stats).toHaveProperty('flagged', 1);
      expect(result.data.items[0].stats).toHaveProperty('estimatedHours', '5.5');
      expect(result.data.items[0].stats).toHaveProperty('lastActivityDate');
    });

    it('should not include stats when disabled', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [
          {
            id: 'proj-1',
            name: 'Test Project',
            status: 'active',
            flagged: false,
            numberOfTasks: 10,
            // No stats property
          },
        ],
        metadata: {},
      });

      const result = await tool.executeValidated({ operation: 'list', includeStats: false });

      expect(result.data.items[0]).not.toHaveProperty('stats');
    });
  });

  describe('stats validation', () => {
    it('should handle empty project stats gracefully', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [
          {
            id: 'proj-1',
            name: 'Empty Project',
            status: 'active',
            flagged: false,
            numberOfTasks: 0,
            stats: {
              active: 0,
              completed: 0,
              total: 0,
              completionRate: 0,
              overdue: 0,
              flagged: 0,
              estimatedHours: null,
              lastActivityDate: null,
            },
          },
        ],
        metadata: {},
      });

      const result = await tool.executeValidated({ operation: 'list', details: true });
      const stats = result.data.items[0].stats;

      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
      expect(stats.estimatedHours).toBeNull();
      expect(stats.lastActivityDate).toBeNull();
    });

    it('should handle stats collection failure', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [
          {
            id: 'proj-1',
            name: 'Project with Error',
            status: 'active',
            flagged: false,
            numberOfTasks: 10,
            statsError: 'Failed to collect statistics',
          },
        ],
        metadata: {},
      });

      const result = await tool.executeValidated({ operation: 'list', details: true });

      expect(result.data.items[0]).toHaveProperty('statsError');
      expect(result.data.items[0]).not.toHaveProperty('stats');
    });
  });

  describe('caching behavior', () => {
    it('should include filter in cache key', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [],
        metadata: {},
      });

      await tool.executeValidated({ operation: 'list', limit: 10, details: true });

      const setCalls = mockCache.set.mock.calls;
      expect(setCalls.length).toBeGreaterThan(0);
      const [collection, key] = setCalls[0];
      expect(collection).toBe('projects');
      expect(key).toContain('limit');
    });

    it('should differentiate cache between different filters', async () => {
      mockCache.get.mockReturnValue(null);
      // v3 script returns { projects: [...], metadata: {...} } directly
      mockOmniAutomation.executeJson.mockResolvedValue({
        projects: [],
        metadata: {},
      });

      await tool.executeValidated({ operation: 'list', limit: 10 });
      const key1 = mockCache.set.mock.calls[0][1];

      await tool.executeValidated({ operation: 'list', limit: 20 });
      const key2 = mockCache.set.mock.calls[1][1];

      expect(key1).not.toBe(key2);
    });
  });

  describe('performance impact', () => {
    it('should show query time in metadata', async () => {
      mockCache.get.mockReturnValue(null);

      // v3 script returns { projects: [...], metadata: {...} } directly
      // Simulate faster response without stats
      mockOmniAutomation.executeJson.mockResolvedValueOnce({
        projects: [{ id: 'p1', name: 'Project 1', numberOfTasks: 5 }],
        metadata: { query_time_ms: 500 },
      });

      // Simulate slower response with stats
      mockOmniAutomation.executeJson.mockResolvedValueOnce({
        projects: [
          {
            id: 'p1',
            name: 'Project 1',
            numberOfTasks: 5,
            stats: { active: 3, completed: 2, total: 5, completionRate: 40 },
          },
        ],
        metadata: { query_time_ms: 1500 },
      });

      const result1 = await tool.executeValidated({ operation: 'list', details: false });

      const result2 = await tool.executeValidated({ operation: 'list', details: true });

      // Both results should have query_time_ms
      expect(result1.metadata.query_time_ms).toBeDefined();
      expect(result2.metadata.query_time_ms).toBeDefined();
    });
  });
});
