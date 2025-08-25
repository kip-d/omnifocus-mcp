import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerspectivesToolV2 } from '../../../src/tools/perspectives/PerspectivesToolV2.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js');
vi.mock('../../../src/omnifocus/OmniAutomation.js');
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('PerspectivesToolV2', () => {
  let tool: PerspectivesToolV2;
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(() => null),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn((script, params) => `built script with params: ${JSON.stringify(params)}`),
      execute: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new PerspectivesToolV2(mockCache);
    (tool as any).omniAutomation = mockOmniAutomation;
  });

  describe('list operation', () => {
    it('should list perspectives with default parameters', async () => {
      const mockResult = {
        perspectives: [
          { name: 'Inbox', isBuiltIn: true },
          { name: 'Projects', isBuiltIn: true },
          { name: 'Custom View', isBuiltIn: false }
        ],
        metadata: { count: 3 }
      };

      mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.execute({ operation: 'list' });

      expect(result.success).toBe(true);
      expect(result.data.perspectives).toHaveLength(3);
      // The tool should sort perspectives by name
      const names = result.data.perspectives.map((p: any) => p.name);
      // Sorting happens in the tool, so we should see alphabetical order
      expect(names).toEqual(['Custom View', 'Inbox', 'Projects']);
      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
    });

    it('should include filter rules when requested', async () => {
      const mockResult = {
        perspectives: [
          { 
            name: 'Flagged', 
            isBuiltIn: true,
            filterRules: { flagged: true }
          }
        ],
        metadata: { count: 1 }
      };

      mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ 
        operation: 'list',
        includeFilterRules: true 
      });

      expect(result.success).toBe(true);
      expect(result.data.perspectives[0].filterRules).toBeDefined();
      expect(result.data.perspectives[0].filterRules.flagged).toBe(true);
    });

    it('should handle script execution errors', async () => {
      mockOmniAutomation.execute.mockRejectedValue(new Error('Script failed'));

      const result = await tool.executeValidated({ operation: 'list' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNKNOWN_ERROR');
      expect(result.error.message).toBe('Script failed');
    });
  });

  describe('query operation', () => {
    it('should query a specific perspective', async () => {
      const mockResult = {
        success: true,
        perspectiveName: 'Today',
        perspectiveType: 'builtin',
        tasks: [
          { id: 'task1', name: 'Task 1', completed: false },
          { id: 'task2', name: 'Task 2', completed: false }
        ],
        count: 2
      };

      mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ 
        operation: 'query',
        perspectiveName: 'Today',
        limit: 50
      });

      expect(result.success).toBe(true);
      expect(result.data.perspectiveName).toBe('Today');
      expect(result.data.tasks).toHaveLength(2);
      expect(mockCache.set).toHaveBeenCalled(); // Should cache results
    });

    it('should return error when perspectiveName is missing', async () => {
      const result = await tool.executeValidated({ 
        operation: 'query'
        // Missing perspectiveName
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_PARAMETER');
      expect(result.error.message).toContain('perspectiveName is required');
    });

    it('should use cached results when available', async () => {
      const cachedResult = {
        success: true,
        data: {
          perspectiveName: 'Cached',
          tasks: []
        }
      };

      mockCache.get.mockReturnValue(cachedResult);

      const result = await tool.executeValidated({ 
        operation: 'query',
        perspectiveName: 'Cached'
      });

      expect(result).toBe(cachedResult);
      expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
    });

    it('should handle perspective not found', async () => {
      const mockResult = {
        success: false,
        error: 'Perspective "NonExistent" not found'
      };

      mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ 
        operation: 'query',
        perspectiveName: 'NonExistent'
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PERSPECTIVE_NOT_FOUND');
      expect(result.error.message).toContain('NonExistent');
    });
  });

  describe('invalid operation', () => {
    it('should return error for invalid operation', async () => {
      const result = await tool.executeValidated({ 
        operation: 'invalid' as any
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_OPERATION');
    });
  });
});