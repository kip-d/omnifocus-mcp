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
      executeJson: vi.fn(),
    };
    
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new QueryTasksToolV2(mockCache);
    (tool as any).omniAutomation = mockOmniAutomation;
  });

  describe('basic functionality', () => {
    it('should query tasks with mode all', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        tasks: [],
        summary: { total: 0 }
      });

      const result = await tool.executeValidated({ 
        mode: 'all',
        completed: false, 
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.data.tasks).toBeDefined();
      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
    });

    it('should handle search mode', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        tasks: [],
        summary: { total: 0 }
      });

      const result = await tool.executeValidated({ 
        mode: 'search',
        search: 'test',
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe('search');
    });

    it('should handle overdue mode', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        tasks: [],
        summary: { total: 0 }
      });

      const result = await tool.executeValidated({ 
        mode: 'overdue',
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe('overdue');
    });
  });

  describe('caching behavior', () => {
    it('should use cache when available for overdue mode', async () => {
      const cachedData = {
        tasks: [{ id: 'task1', name: 'Cached Task' }],
        summary: { total: 1 }
      };
      mockCache.get.mockReturnValue(cachedData);

      const result = await tool.executeValidated({ 
        mode: 'overdue',
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.metadata.from_cache).toBe(true);
      expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
    });

    it('should set cache after fetching for overdue mode', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        tasks: [],
        summary: { total: 0 }
      });

      await tool.executeValidated({ 
        mode: 'overdue',
        limit: 10
      });

      expect(mockCache.set).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle script execution errors', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Script failed' , details: 'Test error' });

      const result = await tool.executeValidated({ 
        mode: 'all',
        limit: 10
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to get tasks');
    });

    it('should require search term for search mode', async () => {
      const result = await tool.executeValidated({ 
        mode: 'search'
        // Missing search term
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EXECUTION_ERROR');
      expect(result.error.message).toContain('Search mode requires a search term');
    });
  });
});