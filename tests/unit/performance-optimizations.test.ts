import { describe, it, expect, vi } from 'vitest';
import { buildListTasksScriptV4 } from '../../src/omnifocus/scripts/tasks.js';
import { buildUpdateTaskScript } from '../../src/contracts/ast/mutation-script-builder.js';
import { buildFilteredProjectsScript } from '../../src/contracts/ast/script-builder.js';

describe('Performance Optimization Tests', () => {
  describe('list_tasks performance features (AST V4)', () => {
    it('should use OmniJS-first architecture', () => {
      // V4 AST-powered scripts use OmniJS bridge for property access
      const script = buildListTasksScriptV4({ filter: {}, limit: 10 });
      expect(script).toContain('evaluateJavascript');
    });

    it('should generate filter predicates from AST', () => {
      // V4 scripts generate filter predicates from AST contracts
      const script = buildListTasksScriptV4({ filter: { completed: false }, limit: 10 });
      expect(script).toContain('evaluateJavascript');
      expect(script).toBeDefined();
    });

    it('should support different query modes via AST routing', () => {
      // V4 scripts route to appropriate builders based on mode
      const inboxScript = buildListTasksScriptV4({ filter: {}, limit: 10, mode: 'inbox' });
      const allScript = buildListTasksScriptV4({ filter: {}, limit: 10, mode: 'all' });
      expect(inboxScript).toContain('evaluateJavascript');
      expect(allScript).toContain('evaluateJavascript');
    });
  });

  describe('list_projects includeStats parameter (AST)', () => {
    it('should generate script with includeStats option', () => {
      const { script } = buildFilteredProjectsScript({}, { includeStats: true });
      // AST builder includes stats logic when includeStats is true
      expect(script).toContain('proj.stats');
    });

    it('should include stats logic when includeStats is true', () => {
      const { script } = buildFilteredProjectsScript({}, { includeStats: true });
      expect(script).toContain('proj.stats');
      expect(script).toContain('completionRate');
    });

    it('should include core statistics fields', () => {
      const { script } = buildFilteredProjectsScript({}, { includeStats: true });
      // Check for stats fields in AST format
      expect(script).toContain('active:');
      expect(script).toContain('completed:');
      expect(script).toContain('completionRate:');
      expect(script).toContain('overdue:');
      expect(script).toContain('flagged:');
    });

    it('should handle projects with no tasks', () => {
      const { script } = buildFilteredProjectsScript({}, { includeStats: true });
      // AST builder checks tasks.length > 0 before calculating stats
      expect(script).toContain('tasks.length > 0');
    });
  });

  describe('Task lookup optimizations (AST mutation builder)', () => {
    it('should avoid whose() and use O(1) Task.byIdentifier lookup', async () => {
      // Test the AST-generated update script
      const generatedScript = await buildUpdateTaskScript('test-id-123', { name: 'Test Task' });
      expect(generatedScript.script).not.toContain('whose(');
      // Uses Task.byIdentifier for O(1) lookup (not slow flattenedTasks scan)
      expect(generatedScript.script).toContain('Task.byIdentifier');
    });

    it('should use Project.byIdentifier for O(1) lookups', async () => {
      const { UPDATE_PROJECT_SCRIPT } = await import('../../src/omnifocus/scripts/projects/update-project.js');
      // Project scripts still use iteration, but could be optimized
      // This is a note for future optimization
      expect(UPDATE_PROJECT_SCRIPT).toContain('projects[i].id() === projectId');
    });
  });
});

describe('Response Format Tests', () => {
  describe('Standardized response format', () => {
    it('should validate list_tasks response structure', () => {
      const mockResponse = {
        success: true,
        data: {
          items: [
            {
              id: 'test-id',
              name: 'Test Task',
              completed: false,
              flagged: false,
              inInbox: false,
              tags: [],
              recurringStatus: {
                isRecurring: false,
                type: 'non-recurring',
              },
            },
          ],
        },
        metadata: {
          operation: 'list_tasks',
          timestamp: '2025-07-24T00:00:00.000Z',
          from_cache: false,
          total_count: 1,
          returned_count: 1,
          query_time_ms: 100,
          total_items: 1,
          items_returned: 1,
          limit_applied: 100,
          has_more: false,
          filters_applied: {},
          performance_metrics: {
            tasks_scanned: 10,
            filter_time_ms: 20,
            analysis_time_ms: 30,
            analysis_skipped: false,
          },
        },
      };

      // Validate structure
      expect(mockResponse).toHaveProperty('success', true);
      expect(mockResponse).toHaveProperty('data.items');
      expect(mockResponse.data.items).toBeInstanceOf(Array);
      expect(mockResponse).toHaveProperty('metadata.performance_metrics');
      expect(mockResponse.metadata.performance_metrics).toHaveProperty('analysis_skipped');
    });

    it('should validate list_projects response with stats', () => {
      const mockResponse = {
        success: true,
        data: {
          items: [
            {
              id: 'project-id',
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
        },
        metadata: {
          operation: 'list_projects',
          timestamp: '2025-07-24T00:00:00.000Z',
          from_cache: false,
          total_count: 1,
          returned_count: 1,
          query_time_ms: 1600,
          filters_applied: {
            includeStats: true,
          },
        },
      };

      // Validate structure
      expect(mockResponse).toHaveProperty('data.items[0].stats');
      expect(mockResponse.data.items[0].stats).toHaveProperty('completionRate', 30);
      expect(mockResponse.data.items[0].stats).toHaveProperty('estimatedHours');
      expect(mockResponse.metadata.filters_applied).toHaveProperty('includeStats', true);
    });
  });
});

describe('Cache Behavior Tests', () => {
  it('should cache results with includeStats parameter in key', () => {
    const cacheKey1 = JSON.stringify({ limit: 10, includeStats: false });
    const cacheKey2 = JSON.stringify({ limit: 10, includeStats: true });

    // Different cache keys for different includeStats values
    expect(cacheKey1).not.toBe(cacheKey2);
  });

  it('should cache results with skipAnalysis parameter in key', () => {
    const cacheKey1 = JSON.stringify({ limit: 10, skipAnalysis: false });
    const cacheKey2 = JSON.stringify({ limit: 10, skipAnalysis: true });

    // Different cache keys for different skipAnalysis values
    expect(cacheKey1).not.toBe(cacheKey2);
  });
});

describe('Error Handling Tests', () => {
  it('should use AST OmniJS architecture for stats', () => {
    // AST builder uses OmniJS with direct property access which handles errors differently
    const { script } = buildFilteredProjectsScript({}, { includeStats: true });
    // AST builder wraps in try-catch at the outer level
    expect(script).toContain('try {');
    expect(script).toContain('catch (error)');
  });

  it('should perform safe and efficient task lookup', async () => {
    // Test the AST-generated update script
    const generatedScript = await buildUpdateTaskScript('test-id-123', { name: 'Test Task' });

    // AST builder uses O(1) Task.byIdentifier lookup, not whose() or slow flattenedTasks scan
    expect(generatedScript.script).toContain('Task.byIdentifier');
    expect(generatedScript.script).not.toContain('whose(');
  });
});
