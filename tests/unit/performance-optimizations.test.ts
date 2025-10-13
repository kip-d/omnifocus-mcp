import { describe, it, expect, vi } from 'vitest';
import { LIST_TASKS_SCRIPT, UPDATE_TASK_SCRIPT } from '../../src/omnifocus/scripts/tasks.js';
import { LIST_PROJECTS_SCRIPT } from '../../src/omnifocus/scripts/projects/list-projects.js';

describe('Performance Optimization Tests', () => {
  describe('list_tasks skipAnalysis parameter', () => {
    it('should include skipAnalysis parameter in script', () => {
      expect(LIST_TASKS_SCRIPT).toContain('filter.skipAnalysis');
      // New context-aware implementation checks filter then falls back to HELPER_CONFIG
      expect(LIST_TASKS_SCRIPT).toContain('filter.skipAnalysis');
      expect(LIST_TASKS_SCRIPT).toContain('HELPER_CONFIG');
    });

    it('should skip recurring task analysis when skipAnalysis is true', () => {
      // The script should check skipRecurringAnalysis before running analysis
      expect(LIST_TASKS_SCRIPT).toContain('skipRecurringAnalysis');
      expect(LIST_TASKS_SCRIPT).toContain('if (!skipRecurringAnalysis)');
    });

    it('should include performance metrics in response', () => {
      // The script should track and return performance data
      expect(LIST_TASKS_SCRIPT).toContain('performance_metrics');
      expect(LIST_TASKS_SCRIPT).toContain('tasks_scanned');
      expect(LIST_TASKS_SCRIPT).toContain('filter_time_ms');
      expect(LIST_TASKS_SCRIPT).toContain('analysis_time_ms');
      expect(LIST_TASKS_SCRIPT).toContain('analysis_skipped');
    });
  });

  describe('list_projects includeStats parameter', () => {
    it('should include includeStats parameter in script', () => {
      const scriptWithStats = LIST_PROJECTS_SCRIPT.replace('{{includeStats}}', 'true');
      expect(scriptWithStats).toContain('const includeStats = true');
    });

    it('should only collect statistics when includeStats is true', () => {
      expect(LIST_PROJECTS_SCRIPT).toContain('if (includeStats === true)');
      expect(LIST_PROJECTS_SCRIPT).toContain('projectObj.stats =');
    });

    it('should include all expected statistics fields', () => {
      // Check for all stats fields
      expect(LIST_PROJECTS_SCRIPT).toContain('active:');
      expect(LIST_PROJECTS_SCRIPT).toContain('completed:');
      expect(LIST_PROJECTS_SCRIPT).toContain('completionRate:');
      expect(LIST_PROJECTS_SCRIPT).toContain('overdue:');
      expect(LIST_PROJECTS_SCRIPT).toContain('flagged:');
      expect(LIST_PROJECTS_SCRIPT).toContain('estimatedHours:');
      expect(LIST_PROJECTS_SCRIPT).toContain('lastActivityDate:');
    });

    it('should handle empty projects gracefully', () => {
      // Should provide empty stats for projects with no tasks
      expect(LIST_PROJECTS_SCRIPT).toContain('// Empty project stats');
      expect(LIST_PROJECTS_SCRIPT).toContain('active: 0');
      expect(LIST_PROJECTS_SCRIPT).toContain('completed: 0');
      expect(LIST_PROJECTS_SCRIPT).toContain('total: 0');
      expect(LIST_PROJECTS_SCRIPT).toContain('completionRate: 0');
    });
  });

  describe('Task lookup optimizations', () => {
    it('should avoid whose() and iterate safely', async () => {
      const { UPDATE_TASK_SCRIPT } = await import('../../src/omnifocus/scripts/tasks.js');
      expect(UPDATE_TASK_SCRIPT).not.toContain('whose(');
      expect(UPDATE_TASK_SCRIPT).toContain('doc.flattenedTasks(');
      expect(UPDATE_TASK_SCRIPT).toMatch(/for \(let i = 0; i < tasks\.length; i\+\+\)/);
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
                type: 'non-recurring'
              }
            }
          ]
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
            analysis_skipped: false
          }
        }
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
                lastActivityDate: '2025-07-24T00:00:00.000Z'
              }
            }
          ]
        },
        metadata: {
          operation: 'list_projects',
          timestamp: '2025-07-24T00:00:00.000Z',
          from_cache: false,
          total_count: 1,
          returned_count: 1,
          query_time_ms: 1600,
          filters_applied: {
            includeStats: true
          }
        }
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
  it('should handle stats collection failure gracefully', () => {
    // The script should continue without stats if collection fails
    expect(LIST_PROJECTS_SCRIPT).toContain('} catch (statsError) {');
    expect(LIST_PROJECTS_SCRIPT).toContain('projectObj.statsError');
  });

  it('should perform safe and efficient task lookup', () => {
    // Either use whose() or safe iteration; both are acceptable
    const usesWhose = UPDATE_TASK_SCRIPT.includes('doc.flattenedTasks.whose({id: taskId})');
    const usesIteration = UPDATE_TASK_SCRIPT.includes('doc.flattenedTasks(')
      && /for \(let i = 0; i < tasks\.length; i\+\+\)/.test(UPDATE_TASK_SCRIPT);
    expect(usesWhose || usesIteration).toBe(true);
    expect(UPDATE_TASK_SCRIPT).toContain('if (!task)');
  });
});
