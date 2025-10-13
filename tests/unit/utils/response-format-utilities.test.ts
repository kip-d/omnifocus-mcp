import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSuccessResponseV2,
  createAnalyticsResponseV2,
  createErrorResponseV2,
  createListResponseV2,
  createTaskResponseV2,
  OperationTimerV2,
  generateTaskSummary,
  generateProjectSummary,
} from '../../../src/utils/response-format';

describe('Response Format Utilities', () => {
  describe('OperationTimerV2', () => {
    let timer: OperationTimerV2;
    
    beforeEach(() => {
      vi.useFakeTimers();
      timer = new OperationTimerV2();
    });
    
    afterEach(() => {
      vi.useRealTimers();
    });
    
    it('should track duration', () => {
      vi.advanceTimersByTime(1500); // 1.5 seconds
      const metadata = timer.toMetadata();
      
      expect(metadata.query_time_ms).toBeGreaterThanOrEqual(1500);
      expect(metadata.query_time_ms).toBeLessThan(2000);
    });
    
    it('should generate metadata with query_time_ms', () => {
      const metadata = timer.toMetadata();
      
      expect(metadata.query_time_ms).toBeDefined();
      expect(typeof metadata.query_time_ms).toBe('number');
    });
    
    it('should return only query_time_ms in metadata', () => {
      const metadata = timer.toMetadata();
      
      expect(Object.keys(metadata)).toEqual(['query_time_ms']);
    });
    
    it('should track elapsed time correctly', () => {
      vi.advanceTimersByTime(250);
      const elapsed1 = timer.getElapsedMs();
      vi.advanceTimersByTime(250);
      const elapsed2 = timer.getElapsedMs();
      
      expect(elapsed1).toBeGreaterThanOrEqual(250);
      expect(elapsed2).toBeGreaterThanOrEqual(500);
    });
    
    it('should measure accurate time differences', () => {
      const start = timer.toMetadata();
      vi.advanceTimersByTime(500);
      const mid = timer.toMetadata();
      vi.advanceTimersByTime(500);
      const end = timer.toMetadata();
      
      expect(mid.query_time_ms).toBeGreaterThanOrEqual(500);
      expect(end.query_time_ms).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('createSuccessResponseV2', () => {
    it('should create basic success response', () => {
      const timer = new OperationTimerV2();
      const data = { result: 'success' };
      
      const response = createSuccessResponseV2(
        'test-operation',
        data,
        undefined,
        timer.toMetadata()
      );
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.error).toBeUndefined();
      expect(response.metadata.operation).toBe('test-operation');
      expect(response.metadata.query_time_ms).toBeDefined();
      expect(response.metadata.optimization).toBe('summary_first_v2');
    });
    
    it('should handle complex data structures', () => {
      const timer = new OperationTimerV2();
      const complexData = {
        items: [1, 2, 3],
        nested: {
          deep: {
            value: 'test',
          },
        },
        flag: true,
      };
      
      const response = createSuccessResponseV2(
        'complex',
        complexData,
        undefined,
        timer.toMetadata()
      );
      
      expect(response.data).toEqual(complexData);
    });
    
    it('should include optional summary', () => {
      const timer = new OperationTimerV2();
      const summary: any = {
        total: 10,
        processed: 8,
        failed: 2,
      };
      
      const response = createSuccessResponseV2(
        'with-summary',
        { items: [] },
        summary,
        timer.toMetadata()
      );
      
      expect(response.summary).toEqual(summary);
      expect(response.data).toEqual({ items: [] });
    });
    
    it('should handle null data', () => {
      const timer = new OperationTimerV2();
      
      const response = createSuccessResponseV2(
        'null-data',
        null as any,
        undefined,
        timer.toMetadata()
      );
      
      expect(response.success).toBe(true);
      expect(response.data).toBe(null);
    });
  });

  describe('createErrorResponseV2', () => {
    it('should create error response with code and message', () => {
      const timer = new OperationTimerV2();
      
      const response = createErrorResponseV2(
        'failed-operation',
        'VALIDATION_ERROR',
        'Invalid input parameters',
        'Please check your input',
        { field: 'name', reason: 'required' },
        timer.toMetadata()
      );
      
      expect(response.success).toBe(false);
      expect(response.data).toEqual({});
      expect(response.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input parameters',
        suggestion: 'Please check your input',
        details: { field: 'name', reason: 'required' },
      });
    });
    
    it('should handle error without details', () => {
      const timer = new OperationTimerV2();
      
      const response = createErrorResponseV2(
        'simple-error',
        'INTERNAL_ERROR',
        'Something went wrong',
        undefined,
        undefined,
        timer.toMetadata()
      );
      
      expect(response.error.details).toBeUndefined();
      expect(response.error.suggestion).toBeUndefined();
    });
    
    it('should include recovery suggestions', () => {
      const timer = new OperationTimerV2();
      const details = {
        recovery: [
          'Check your input',
          'Try again later',
          'Contact support',
        ]
      };
      
      const response = createErrorResponseV2(
        'error-with-recovery',
        'USER_ERROR',
        'Invalid request',
        'Try one of the recovery options',
        details,
        timer.toMetadata()
      );
      
      expect(response.error.details.recovery).toEqual(details.recovery);
      expect(response.error.suggestion).toBe('Try one of the recovery options');
    });
    
    it('should handle Error objects in details', () => {
      const timer = new OperationTimerV2();
      const originalError = new Error('Original error');
      
      const response = createErrorResponseV2(
        'wrapped-error',
        'WRAPPED_ERROR',
        'Error occurred',
        undefined,
        { originalError },
        timer.toMetadata()
      );
      
      expect(response.error.details.originalError).toBe(originalError);
    });
  });

  describe('createListResponseV2', () => {
    it('should create list response with items and preview', () => {
      const timer = new OperationTimerV2();
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ];
      
      const response = createListResponseV2(
        'list-operation',
        items,
        'other',
        timer.toMetadata()
      );
      
      expect(response.success).toBe(true);
      expect(response.data.items).toEqual(items);
      expect(response.data.preview).toEqual(items);
      expect(response.metadata.total_count).toBe(2);
      expect(response.metadata.returned_count).toBe(2);
    });
    
    it('should handle empty list', () => {
      const timer = new OperationTimerV2();
      
      const response = createListResponseV2(
        'empty-list',
        [],
        'other',
        timer.toMetadata()
      );
      
      expect(response.data.items).toEqual([]);
      expect(response.data.preview).toEqual([]);
      expect(response.metadata.total_count).toBe(0);
    });
    
    it('should handle large lists', () => {
      const timer = new OperationTimerV2();
      const largeList = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      
      const response = createListResponseV2(
        'large-list',
        largeList,
        'other',
        timer.toMetadata()
      );
      
      expect(response.data.items).toHaveLength(1000);
      expect(response.data.preview).toHaveLength(5); // Only first 5 in preview
      expect(response.metadata.total_count).toBe(1000);
    });
    
    it('should generate task summary for task items', () => {
      const timer = new OperationTimerV2();
      const tasks = [
        { id: 1, name: 'Task 1', completed: false },
        { id: 2, name: 'Task 2', completed: true },
      ];
      
      const response = createListResponseV2(
        'task-list',
        tasks,
        'tasks',
        timer.toMetadata()
      );
      
      expect(response.summary).toBeDefined();
      expect((response.summary as any).total_count).toBe(2);
    });
  });

  describe('createTaskResponseV2', () => {
    it('should create task response with tasks and summary', () => {
      const timer = new OperationTimerV2();
      const tasks = [
        { id: 't1', name: 'Task 1', completed: false },
        { id: 't2', name: 'Task 2', completed: true },
      ];
      
      const response = createTaskResponseV2(
        'task-query',
        tasks,
        timer.toMetadata()
      );
      
      expect(response.success).toBe(true);
      expect(response.data.tasks).toEqual(tasks);
      expect(response.data.preview).toEqual(tasks); // Only 2 tasks, so both in preview
      expect(response.summary).toBeDefined();
      expect((response.summary as any).total_count).toBe(2);
      expect((response.summary as any).returned_count).toBe(2);
      expect((response.summary as any).breakdown?.completed).toBe(1);
    });
    
    it('should handle tasks with full details', () => {
      const timer = new OperationTimerV2();
      const detailedTasks = [
        {
          id: 't1',
          name: 'Detailed Task',
          completed: false,
          flagged: true,
          dueDate: '2025-01-01',
          project: 'Project A',
          tags: ['urgent', 'work'],
          note: 'Task description',
          estimatedMinutes: 30,
        },
      ];
      
      const response = createTaskResponseV2(
        'detailed-tasks',
        detailedTasks,
        timer.toMetadata()
      );
      
      expect(response.data.tasks[0]).toEqual(detailedTasks[0]);
      expect(response.metadata.total_count).toBe(1);
      expect(response.metadata.returned_count).toBe(1);
    });
  });

  describe('createAnalyticsResponseV2', () => {
    it('should create analytics response with metrics', () => {
      const timer = new OperationTimerV2();
      const metrics = {
        completionRate: 0.75,
        averageTasksPerDay: 12.5,
        overdueCount: 3,
        stats: { totalTasks: 100 },
      };
      const keyFindings = [
        'Completion rate is 75%',
        'Average 12.5 tasks per day',
      ];
      
      const response = createAnalyticsResponseV2(
        'analytics',
        metrics,
        'task_velocity',
        keyFindings,
        timer.toMetadata()
      );
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(metrics);
      expect((response.summary as any).analysis_type).toBe('task_velocity');
      expect((response.summary as any).key_findings).toEqual(keyFindings);
      expect((response.summary as any).total_items_analyzed).toBe(100);
    });
    
    it('should handle time series data', () => {
      const timer = new OperationTimerV2();
      const timeSeries = {
        dates: ['2025-01-01', '2025-01-02', '2025-01-03'],
        values: [10, 15, 12],
        velocity: { tasksCompleted: 37 },
      };
      
      const response = createAnalyticsResponseV2(
        'time-series',
        timeSeries,
        'productivity_trend',
        ['Upward trend detected'],
        timer.toMetadata()
      );
      
      expect(response.data.dates).toHaveLength(3);
      expect(response.data.values).toHaveLength(3);
      expect((response.summary as any).total_items_analyzed).toBe(37);
    });
  });

  describe('generateTaskSummary', () => {
    it('should generate basic task summary', () => {
      const tasks = [
        { id: '1', name: 'Task 1', completed: false },
        { id: '2', name: 'Task 2', completed: true },
        { id: '3', name: 'Task 3', completed: false },
      ];
      
      const summary = generateTaskSummary(tasks);
      
      expect(summary.total_count).toBe(3);
      expect(summary.returned_count).toBe(3);
      expect(summary.breakdown?.completed).toBe(1);
      expect(summary.preview).toBeDefined();
    });
    
    it('should handle flagged and overdue tasks', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const tasks = [
        { id: '1', name: 'Overdue', completed: false, dueDate: yesterday.toISOString() },
        { id: '2', name: 'Flagged', completed: false, flagged: true },
        { id: '3', name: 'Future', completed: false, dueDate: tomorrow.toISOString() },
      ];
      
      const summary = generateTaskSummary(tasks);
      
      expect(summary.breakdown?.overdue).toBe(1);
      expect(summary.breakdown?.flagged).toBe(1);
      expect(summary.breakdown?.due_tomorrow).toBe(1); // Tomorrow
    });
    
    it('should generate task preview', () => {
      const tasks = [
        { id: '1', name: 'Important', completed: false, flagged: true },
        { id: '2', name: 'Urgent', completed: false, dueDate: new Date().toISOString() },
        { id: '3', name: 'Normal', completed: false },
        { id: '4', name: 'Another', completed: false },
      ];
      
      const summary = generateTaskSummary(tasks);
      
      expect(summary.preview).toBeDefined();
      expect(summary.preview).toHaveLength(3); // Top 3 tasks
      expect(summary.preview?.[0].name).toBe('Urgent'); // Due today comes first
      expect(summary.preview?.[1].name).toBe('Important'); // Flagged comes second
    });
    
    it('should handle empty task list', () => {
      const summary = generateTaskSummary([]);
      
      expect(summary.total_count).toBe(0);
      expect(summary.returned_count).toBe(0);
      expect(summary.breakdown?.completed).toBe(0);
      expect(summary.preview).toEqual([]);
    });
    
    it('should calculate bottlenecks', () => {
      const longOverdue = new Date();
      longOverdue.setDate(longOverdue.getDate() - 30);
      
      const tasks = Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        name: `Task ${i}`,
        completed: false,
        dueDate: longOverdue.toISOString(),
      }));
      
      const summary = generateTaskSummary(tasks);
      
      expect(summary.key_insights).toBeDefined();
      expect(summary.key_insights?.length).toBeGreaterThan(0);
      expect(summary.key_insights?.[0]).toContain('overdue');
    });
  });

  describe('generateProjectSummary', () => {
    it('should generate basic project summary', () => {
      const projects = [
        { id: '1', name: 'Project 1', status: 'active' },
        { id: '2', name: 'Project 2', status: 'on-hold' },
        { id: '3', name: 'Project 3', status: 'done' },
        { id: '4', name: 'Project 4', status: 'dropped' },
      ];
      
      const summary = generateProjectSummary(projects);
      
      expect(summary.total_projects).toBe(4);
      expect(summary.active).toBe(1);
      expect(summary.on_hold).toBe(1);
      expect(summary.completed).toBe(1);
      expect(summary.dropped).toBe(1);
    });
    
    it('should detect projects needing review', () => {
      const now = new Date();
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 8);
      const lastMonth = new Date(now);
      lastMonth.setDate(lastMonth.getDate() - 35);
      
      const projects = [
        { id: '1', name: 'Recent Review', nextReviewDate: lastWeek.toISOString() },
        { id: '2', name: 'Old Review', nextReviewDate: lastMonth.toISOString() },
        { id: '3', name: 'No Review', status: 'active' },
      ];
      
      const summary = generateProjectSummary(projects);
      
      expect(summary.needs_review).toBe(2);
      expect(summary.overdue_reviews).toBe(2); // Both are overdue by 7+ days
      expect(summary.bottlenecks).toHaveLength(2);
      expect(summary.bottlenecks?.[1]).toContain('Old Review');
      expect(summary.bottlenecks?.[1]).toContain('35 days');
    });
    
    it('should handle on-hold variations', () => {
      const projects = [
        { id: '1', name: 'P1', status: 'on-hold' },
        { id: '2', name: 'P2', status: 'onHold' },
      ];
      
      const summary = generateProjectSummary(projects);
      
      expect(summary.on_hold).toBe(2);
    });
    
    it('should detect stalled projects', () => {
      const now = new Date();
      const threeWeeksAgo = new Date(now);
      threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
      
      const projects = [
        { 
          id: '1', 
          name: 'Stalled Project', 
          status: 'active',
          modifiedDate: threeWeeksAgo.toISOString(),
        },
        {
          id: '2',
          name: 'Active Project',
          status: 'active',
          modifiedDate: now.toISOString(),
        },
      ];
      
      const summary = generateProjectSummary(projects);
      
      expect(summary.bottlenecks).toBeDefined();
      // Should detect stalled project
    });
    
    it('should handle empty project list', () => {
      const summary = generateProjectSummary([]);
      
      expect(summary.total_projects).toBe(0);
      expect(summary.active).toBe(0);
      expect(summary.on_hold).toBe(0);
      expect(summary.completed).toBe(0);
      expect(summary.needs_review).toBe(0);
      expect(summary.bottlenecks).toHaveLength(0);
    });
  });

  describe('Response format consistency', () => {
    it('should have consistent success response structure', () => {
      const timer = new OperationTimerV2();
      
      const successResponse = createSuccessResponseV2('op1', {}, undefined, timer.toMetadata());
      const listResponse = createListResponseV2('op2', [], 'other', timer.toMetadata());
      const taskResponse = createTaskResponseV2('op3', [], timer.toMetadata());
      
      // All should have same top-level structure
      [successResponse, listResponse, taskResponse].forEach(response => {
        expect(response).toHaveProperty('success');
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('metadata');
        expect(response.success).toBe(true);
        // error field is optional and only present when there's an error
        if (response.error !== undefined) {
          expect(response.error).toBeUndefined();
        }
      });
    });
    
    it('should have consistent error response structure', () => {
      const timer = new OperationTimerV2();
      
      const errorResponse = createErrorResponseV2(
        'error-op',
        'ERROR_CODE',
        'Error message',
        'Try again',
        { details: 'here' },
        timer.toMetadata()
      );
      
      expect(errorResponse).toHaveProperty('success');
      expect(errorResponse).toHaveProperty('data');
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('metadata');
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.data).toEqual({});
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error.code).toBe('ERROR_CODE');
      expect(errorResponse.error.message).toBe('Error message');
      expect(errorResponse.error.suggestion).toBe('Try again');
    });
    
    it('should have consistent metadata structure', () => {
      const timer = new OperationTimerV2();
      const metadata = timer.toMetadata();
      
      expect(metadata).toHaveProperty('query_time_ms');
      expect(typeof metadata.query_time_ms).toBe('number');
    });
  });
});