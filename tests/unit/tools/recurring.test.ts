import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecurringTasksTool } from '../../../src/tools/recurring/RecurringTasksTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn()
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('Recurring Tools', () => {
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn(),
      executeJson: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);
  });

  describe('RecurringTasksTool - Analyze Operation', () => {
    let tool: RecurringTasksTool;

    beforeEach(() => {
      tool = new RecurringTasksTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('recurring_tasks');
        expect(tool.description).toContain('Analyze recurring tasks and patterns');
        expect(tool.description).toContain('operation=\"analyze\"');
      });

      it('should use default options when not specified', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          tasks: [],
          summary: { total: 0, active: 0 },
        });

        const result = await tool.execute({ operation: 'analyze' });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { options: { activeOnly: true, includeCompleted: false, includeDropped: false, includeHistory: false, sortBy: 'dueDate' } }
        );
        expect(result.tasks).toEqual([]);
        expect(result.summary).toEqual({ total: 0, active: 0 });
      });

      it('should override default options when specified', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          tasks: [],
          summary: { total: 0, active: 0 },
        });

        const result = await tool.execute({
          activeOnly: false,
          includeCompleted: true,
          includeDropped: true,
          includeHistory: true,
          sortBy: 'frequency',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { options: { activeOnly: false, includeCompleted: true, includeDropped: true, includeHistory: true, sortBy: 'frequency' } }
        );
      });
    });

    describe('caching behavior', () => {
      it('should return cached result when available', async () => {
        const cachedData = {
          tasks: [{ id: '1', name: 'Cached Task' }],
          summary: { total: 1, active: 1 },
          metadata: { timestamp: '2025-01-01T00:00:00Z', options: {} },
        };
        
        mockCache.get.mockReturnValue(cachedData);

        const result = await tool.execute({ operation: 'analyze' });

        expect(mockCache.get).toHaveBeenCalledWith('analytics', 'recurring_{"activeOnly":true,"includeCompleted":false,"includeDropped":false,"includeHistory":false,"sortBy":"dueDate"}');
        expect(result).toEqual(cachedData);
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should cache result when not cached', async () => {
        const scriptResult = {
          tasks: [{ id: '1', name: 'New Task' }],
          summary: { total: 1, active: 1 },
        };
        
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

        const result = await tool.execute({ operation: 'analyze' });

        expect(mockCache.set).toHaveBeenCalledWith('analytics', 'recurring_{"activeOnly":true,"includeCompleted":false,"includeDropped":false,"includeHistory":false,"sortBy":"dueDate"}', {
          tasks: scriptResult.tasks,
          summary: scriptResult.summary,
          metadata: {
            timestamp: expect.any(String),
            options: { activeOnly: true, includeCompleted: false, includeDropped: false, includeHistory: false, sortBy: 'dueDate' },
          },
        });
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
         mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Script failed', details: 'Test error' });

        const result = await tool.execute({ operation: 'analyze' });

        expect(result.error).toBe(true);
        expect(result.message).toContain('Script failed');
        expect(mockCache.set).not.toHaveBeenCalled();
      });

      it('should handle execution exceptions', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockRejectedValue(new Error('Execution failed'));

        const result = await tool.execute({ operation: 'analyze' });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Execution failed');
      });
    });
  });

  describe('RecurringTasksTool - Patterns Operation', () => {
    let tool: RecurringTasksTool;

    beforeEach(() => {
      tool = new RecurringTasksTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('recurring_tasks');
        expect(tool.description).toContain('Analyze recurring tasks and patterns');
      });

      it('should execute with default parameters', async () => {
        mockCache.get.mockReturnValue(null); // Ensure cache is empty
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          totalRecurring: 0,
          patterns: [],
          byProject: [],
          mostCommon: null,
        });

        const result = await tool.execute({ operation: 'patterns' });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { options: { activeOnly: true, includeCompleted: false, includeDropped: false } }
        );
        expect(result.patterns).toEqual([]);
        expect(result.totalRecurring).toBe(0);
      });

      it('should override default parameters when specified', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          patterns: [],
          summary: { total: 0 },
        });

        const result = await tool.execute({
          operation: 'patterns',
          activeOnly: false,
          includeCompleted: true,
          includeDropped: true,
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { options: { activeOnly: false, includeCompleted: true, includeDropped: true } }
        );
      });
    });

    describe('caching behavior', () => {
      it('should return cached result when available', async () => {
        const cachedData = {
          patterns: [{ id: '1', pattern: 'daily' }],
          summary: { total: 1 },
          metadata: { timestamp: '2025-01-01T00:00:00Z', options: {} },
        };
        
        mockCache.get.mockReturnValue(cachedData);

        const result = await tool.execute({ operation: 'analyze' });

        expect(mockCache.get).toHaveBeenCalledWith('analytics', 'recurring_patterns_{"activeOnly":true,"includeCompleted":false,"includeDropped":false}');
        expect(result).toEqual(cachedData);
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should cache result when not cached', async () => {
        const scriptResult = {
          totalRecurring: 1,
          patterns: [{ id: '1', pattern: 'daily' }],
          byProject: [],
          mostCommon: { pattern: 'daily', count: 1 },
        };
        
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

        const result = await tool.execute({ operation: 'analyze' });

        expect(mockCache.set).toHaveBeenCalledWith('analytics', 'recurring_patterns_{"activeOnly":true,"includeCompleted":false,"includeDropped":false}', {
          totalRecurring: scriptResult.totalRecurring,
          patterns: scriptResult.patterns,
          byProject: scriptResult.byProject,
          insights: expect.any(Array),
          metadata: {
            timestamp: expect.any(String),
            options: { activeOnly: true, includeCompleted: false, includeDropped: false },
          },
        });
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors', async () => {
        mockCache.get.mockReturnValue(null);
         mockOmniAutomation.buildScript.mockReturnValue('test script');
         mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Pattern analysis failed', details: 'Test error' });

        const result = await tool.execute({ operation: 'analyze' });

        expect(result.error).toBe(true);
        expect(result.message).toContain('Pattern analysis failed');
        expect(mockCache.set).not.toHaveBeenCalled();
      });

      it('should handle execution exceptions', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockRejectedValue(new Error('Pattern analysis failed'));

        const result = await tool.execute({ operation: 'analyze' });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Pattern analysis failed');
      });
    });
  });
});
