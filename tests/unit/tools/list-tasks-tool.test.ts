import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryTasksToolV2 } from '../../../src/tools/tasks/QueryTasksToolV2.js';
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

describe('QueryTasksToolV2', () => {
  let tool: QueryTasksToolV2;
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

    tool = new QueryTasksToolV2(mockCache);
  });

  describe('skipAnalysis parameter', () => {
    it('should pass skipAnalysis to script builder', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        tasks: [],
        metadata: {
          performance_metrics: {
            tasks_scanned: 100,
            filter_time_ms: 50,
            analysis_time_ms: 0,
            analysis_skipped: true
          }
        }
      });

      await tool.execute({ 
        mode: 'list',
        completed: false, 
        limit: 10,
        skipAnalysis: true 
      });

      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
      const [[template, params]] = mockOmniAutomation.buildScript.mock.calls;
      expect(template).toContain('const filter = {{filter}}');
      expect(params).toEqual({
        filter: { 
          completed: false,
          includeDetails: false,  // Daily-first default
          limit: 10,
          skipAnalysis: true,
          offset: 0,
          sortOrder: 'asc'
        }
      });
    });

    it('should include analysis_skipped in performance metrics', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        tasks: [],
        metadata: {
          performance_metrics: {
            tasks_scanned: 50,
            filter_time_ms: 20,
            analysis_time_ms: 0,
            analysis_skipped: true
          }
        }
      });

      const result = await tool.execute({ 
        mode: 'list',
        skipAnalysis: true 
      });

      expect(result.metadata.performance_metrics).toHaveProperty('analysis_skipped', true);
      expect(result.metadata.performance_metrics.analysis_time_ms).toBe(0);
    });

    it('should default skipAnalysis to true for daily-first performance', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        tasks: [],
        metadata: {
          performance_metrics: {
            tasks_scanned: 100,
            filter_time_ms: 50,
            analysis_time_ms: 0,  // No analysis time when skipped by default
            analysis_skipped: true  // Daily-first default
          }
        }
      });

      await tool.execute({ 
        completed: false 
      });

      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
      const [[template, params]] = mockOmniAutomation.buildScript.mock.calls;
      expect(template).toContain('const filter = {{filter}}');
      expect(params).toEqual({
        filter: { 
          completed: false,
          includeDetails: false,  // Daily-first default
          limit: 25,  // Daily-first limit
          skipAnalysis: true,  // Daily-first default
          offset: 0,
          sortOrder: 'asc'
        }
      });
    });
  });

  describe('performance metrics', () => {
    it('should include detailed performance metrics in response', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        tasks: [
          { id: '1', name: 'Task 1', completed: false }
        ],
        metadata: {
          performance_metrics: {
            tasks_scanned: 250,
            filter_time_ms: 75,
            analysis_time_ms: 200,
            analysis_skipped: false
          }
        }
      });

      const result = await tool.execute({ mode: 'list', limit: 10 });

      expect(result.metadata).toHaveProperty('performance_metrics');
      expect(result.metadata.performance_metrics).toEqual({
        tasks_scanned: 250,
        filter_time_ms: 75,
        analysis_time_ms: 200,
        analysis_skipped: false
      });
    });

    it('should show performance improvement with skipAnalysis', async () => {
      // First call without skipAnalysis
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValueOnce({
        tasks: [],
        metadata: {
          performance_metrics: {
            tasks_scanned: 100,
            filter_time_ms: 50,
            analysis_time_ms: 300,
            analysis_skipped: false
          }
        }
      });

      const result1 = await tool.execute({ mode: 'list', limit: 10, skipAnalysis: false });
      const totalTime1 = result1.metadata.performance_metrics.filter_time_ms + 
                        result1.metadata.performance_metrics.analysis_time_ms;

      // Second call with skipAnalysis
      mockOmniAutomation.execute.mockResolvedValueOnce({
        tasks: [],
        metadata: {
          performance_metrics: {
            tasks_scanned: 100,
            filter_time_ms: 50,
            analysis_time_ms: 0,
            analysis_skipped: true
          }
        }
      });

      const result2 = await tool.execute({ mode: 'list', limit: 10, skipAnalysis: true });
      const totalTime2 = result2.metadata.performance_metrics.filter_time_ms + 
                        result2.metadata.performance_metrics.analysis_time_ms;

      // Verify performance improvement
      expect(totalTime2).toBeLessThan(totalTime1);
      expect(result2.metadata.performance_metrics.analysis_skipped).toBe(true);
    });
  });

  describe('caching behavior', () => {
    it('should not include skipAnalysis in cache key', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        tasks: [],
        metadata: {}
      });

      // Call with skipAnalysis: true
      await tool.execute({ mode: 'list', limit: 10, skipAnalysis: true });
      
      // Check cache key does not include skipAnalysis (it's excluded from filter)
      const setCalls = mockCache.set.mock.calls;
      expect(setCalls.length).toBeGreaterThan(0);
      const [collection, key] = setCalls[0];
      expect(collection).toBe('tasks');
      expect(key).not.toContain('skipAnalysis');
    });

    it('should skip cache when skipAnalysis is true', async () => {
      // Set up cached response
      const cachedResponse = {
        data: { items: [{ id: '1', name: 'Cached task' }] },
        metadata: { from_cache: true }
      };
      
      // First call with skipAnalysis: false uses cache
      mockCache.get.mockReturnValueOnce(cachedResponse);
      const result1 = await tool.execute({ mode: 'list', limit: 10, skipAnalysis: false });
      expect(mockOmniAutomation.execute).not.toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();
      mockCache.get.mockReturnValueOnce(cachedResponse);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        tasks: [],
        metadata: {}
      });

      // Second call with skipAnalysis: true bypasses cache
      const result2 = await tool.execute({ mode: 'list', limit: 10, skipAnalysis: true });
      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockOmniAutomation.execute).toHaveBeenCalled();
    });
  });
});