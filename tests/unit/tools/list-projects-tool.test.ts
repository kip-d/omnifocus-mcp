import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListProjectsTool } from '../../../src/tools/projects/ListProjectsTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';
import { Logger } from '../../../src/utils/Logger.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn()
}));
vi.mock('../../../src/utils/Logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('ListProjectsTool', () => {
  let tool: ListProjectsTool;
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
      execute: vi.fn(),
    };
    
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new ListProjectsTool(mockCache);
  });

  describe('includeStats parameter', () => {
    it('should pass includeStats to script builder', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [],
        metadata: {
          total_available: 50,
          returned_count: 0,
          limit_applied: 10
        }
      });

      await tool.execute({ 
        limit: 10,
        includeStats: true 
      });

      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
      const [[template, params]] = mockOmniAutomation.buildScript.mock.calls;
      expect(template).toContain('const filter = {{filter}}');
      expect(template).toContain('const includeStats = {{includeStats}}');
      expect(params).toEqual({
        filter: {
          includeTaskCounts: true,
          sortBy: 'name',
          sortOrder: 'asc',
          performanceMode: 'normal'
        },
        limit: 10,
        includeStats: true
      });
    });

    it('should default includeStats to false', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [],
        metadata: {}
      });

      await tool.execute({ limit: 10 });

      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
      const [[template, params]] = mockOmniAutomation.buildScript.mock.calls;
      expect(template).toContain('const filter = {{filter}}');
      expect(template).toContain('const includeStats = {{includeStats}}');
      expect(params).toEqual({
        filter: {
          includeTaskCounts: true,
          sortBy: 'name',
          sortOrder: 'asc',
          performanceMode: 'normal'
        },
        limit: 10,
        includeStats: false
      });
    });

    it('should include stats in project response when enabled', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [{
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
            lastActivityDate: '2025-07-24T00:00:00.000Z'
          }
        }],
        metadata: {
          total_available: 1,
          returned_count: 1,
          limit_applied: 10
        }
      });

      const result = await tool.execute({ includeStats: true });

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
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [{
          id: 'proj-1',
          name: 'Test Project',
          status: 'active',
          flagged: false,
          numberOfTasks: 10
          // No stats property
        }],
        metadata: {}
      });

      const result = await tool.execute({ includeStats: false });

      expect(result.data.items[0]).not.toHaveProperty('stats');
    });
  });

  describe('stats validation', () => {
    it('should handle empty project stats gracefully', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [{
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
            lastActivityDate: null
          }
        }],
        metadata: {}
      });

      const result = await tool.execute({ includeStats: true });
      const stats = result.data.items[0].stats;

      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
      expect(stats.estimatedHours).toBeNull();
      expect(stats.lastActivityDate).toBeNull();
    });

    it('should handle stats collection failure', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [{
          id: 'proj-1',
          name: 'Project with Error',
          status: 'active',
          flagged: false,
          numberOfTasks: 10,
          statsError: 'Failed to collect statistics'
        }],
        metadata: {}
      });

      const result = await tool.execute({ includeStats: true });

      expect(result.data.items[0]).toHaveProperty('statsError');
      expect(result.data.items[0]).not.toHaveProperty('stats');
    });
  });

  describe('caching behavior', () => {
    it('should include includeStats in cache key', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [],
        metadata: {}
      });

      await tool.execute({ limit: 10, includeStats: true });
      
      const setCalls = mockCache.set.mock.calls;
      expect(setCalls.length).toBeGreaterThan(0);
      const [collection, key] = setCalls[0];
      expect(collection).toBe('projects');
      expect(key).toContain('"includeStats":true');
    });

    it('should differentiate cache between includeStats values', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        projects: [],
        metadata: {}
      });

      await tool.execute({ limit: 10, includeStats: false });
      const key1 = mockCache.set.mock.calls[0][1];

      await tool.execute({ limit: 10, includeStats: true });
      const key2 = mockCache.set.mock.calls[1][1];

      expect(key1).not.toBe(key2);
    });
  });

  describe('performance impact', () => {
    it('should show query time difference with stats enabled', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      
      // Simulate faster response without stats
      mockOmniAutomation.execute.mockResolvedValueOnce({
        projects: [{ id: 'p1', name: 'Project 1', numberOfTasks: 5 }],
        metadata: { query_time_ms: 500 }
      });

      // Simulate slower response with stats
      mockOmniAutomation.execute.mockResolvedValueOnce({
        projects: [{ 
          id: 'p1', 
          name: 'Project 1', 
          numberOfTasks: 5,
          stats: { active: 3, completed: 2, total: 5, completionRate: 40 }
        }],
        metadata: { query_time_ms: 1500 }
      });

      const result1 = await tool.execute({ includeStats: false });
      
      const result2 = await tool.execute({ includeStats: true });

      expect(result2.metadata.query_time_ms).toBeGreaterThan(result1.metadata.query_time_ms);
    });
  });
});