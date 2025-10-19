import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPTestClient } from './helpers/mcp-test-client.js';

/**
 * Integration tests for OmniFocus 4.7+ features
 *
 * Tests all new features implemented in Phase 1-5:
 * - Planned dates support
 * - Mutually exclusive tags
 * - Enhanced repeats with translation layer
 * - Version detection with feature flags
 */
describe('OmniFocus 4.7+ Features Integration Tests', () => {
  let client: MCPTestClient;

  beforeEach(async () => {
    client = new MCPTestClient();
    await client.startServer();
  });

  afterEach(async () => {
    await client.quickCleanup();
    await client.stop();
  });

  describe('Planned Dates Feature', () => {
    it('should create task with planned date', async () => {
      const response = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Task with Planned Date',
        plannedDate: '2025-11-15 09:00',
        tags: ['test', 'planned-dates']
      });

      expect(response.success).toBe(true);
      expect(response.data?.task?.taskId).toBeDefined();
      expect(response.data?.task?.name).toBe('Task with Planned Date');
    });

    it('should list tasks with planned date included', async () => {
      // Create task with planned date
      const createResp = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Planned Task for Query',
        plannedDate: '2025-11-20 14:00',
        tags: ['test', 'planned-query']
      });

      console.log('Created task:', JSON.stringify({
        success: createResp.success,
        taskId: createResp.data?.task?.taskId,
        tags: createResp.data?.task?.tags
      }, null, 2));

      // Query inbox tasks (task created without project goes to inbox)
      const response = await client.callTool('tasks', {
        mode: 'inbox'
      });

      console.log('Inbox tasks:', JSON.stringify({
        success: response.success,
        count: response.data?.tasks?.length || 0,
        tasks: (response.data?.tasks || []).map((t: any) => ({
          name: t.name,
          tags: t.tags
        })).slice(0, 5)
      }, null, 2));

      expect(response.success).toBe(true);
      const plannedTasks = (response.data?.tasks || []).filter(
        (t: any) => t.tags?.includes('planned-query')
      );
      expect(plannedTasks.length).toBeGreaterThan(0);
      expect(plannedTasks[0].plannedDate).toBeDefined();
    });

    it('should update task with new planned date', async () => {
      // Create task
      const createResponse = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Task to Update Planned Date',
        plannedDate: '2025-11-15',
        tags: ['test', 'planned-update']
      });

      const taskId = createResponse.data?.task?.taskId;
      expect(taskId).toBeDefined();

      // Update planned date
      const updateResponse = await client.callTool('manage_task', {
        operation: 'update',
        taskId: taskId,
        plannedDate: '2025-12-01 10:30'
      });

      expect(updateResponse.success).toBe(true);
    });

    it('should clear planned date when set to null', async () => {
      // Create task with planned date
      const createResponse = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Task to Clear Planned Date',
        plannedDate: '2025-11-15',
        tags: ['test', 'clear-planned']
      });

      const taskId = createResponse.data?.task?.taskId;

      // Clear planned date
      const updateResponse = await client.callTool('manage_task', {
        operation: 'update',
        taskId: taskId,
        plannedDate: null
      });

      expect(updateResponse.success).toBe(true);
    });
  });

  describe('Mutually Exclusive Tags Feature', () => {
    it('should create tag hierarchy', async () => {
      // Create parent tag with unique name to avoid conflicts
      const uniqueTagName = `Priority-${Date.now()}`;
      const parentResponse = await client.callTool('tags', {
        operation: 'manage',
        action: 'create',
        tagName: uniqueTagName
      });

      expect(parentResponse.success).toBe(true);
      expect(parentResponse.data?.tagName).toBe(uniqueTagName);
    });

    it('should enable mutual exclusivity on tag', async () => {
      // Create parent tag first
      await client.callTool('tags', {
        operation: 'manage',
        action: 'create',
        tagName: 'Status-ME'
      });

      // Set mutual exclusivity
      const response = await client.callTool('tags', {
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'Status-ME',
        mutuallyExclusive: true
      });

      expect(response.success).toBe(true);
      expect(response.data?.action).toBe('set_mutual_exclusivity');
      expect(response.data?.tagName).toBe('Status-ME');
    });

    it('should disable mutual exclusivity on tag', async () => {
      // Create tag
      await client.callTool('tags', {
        operation: 'manage',
        action: 'create',
        tagName: 'Context-ME'
      });

      // First enable
      await client.callTool('tags', {
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'Context-ME',
        mutuallyExclusive: true
      });

      // Then disable
      const response = await client.callTool('tags', {
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'Context-ME',
        mutuallyExclusive: false
      });

      expect(response.success).toBe(true);
    });

    it('should include mutual exclusivity status in tag list', async () => {
      // Create tag with mutual exclusivity
      await client.callTool('tags', {
        operation: 'manage',
        action: 'create',
        tagName: 'ListME-Tag'
      });

      await client.callTool('tags', {
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'ListME-Tag',
        mutuallyExclusive: true
      });

      // List tags and verify property appears
      const response = await client.callTool('tags', {
        operation: 'list',
        sortBy: 'name',
        includeEmpty: true,
        fastMode: false,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false
      });

      expect(response.success).toBe(true);
      const meTag = (response.data?.items || []).find(
        (t: any) => t.name === 'ListME-Tag'
      );
      expect(meTag?.childrenAreMutuallyExclusive).toBe(true);
    });
  });

  describe('Enhanced Repeats Feature', () => {
    it('should create task with user-friendly repeat intent', async () => {
      const response = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Daily Standup',
        dueDate: '2025-11-17 09:00',
        repeatRule: {
          frequency: 'FREQ=DAILY',
          anchorTo: 'when-due',
          skipMissed: false
        },
        tags: ['test', 'repeats']
      });

      expect(response.success).toBe(true);
      expect(response.data?.task?.taskId).toBeDefined();
      expect(response.data?.task?.name).toBe('Daily Standup');
    });

    it('should support repeat intent with "when-marked-done" anchor', async () => {
      const response = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Review Meeting Notes',
        dueDate: '2025-11-17',
        repeatRule: {
          frequency: 'FREQ=WEEKLY;BYDAY=MO',
          anchorTo: 'when-marked-done',
          skipMissed: true
        },
        tags: ['test', 'weekly-repeat']
      });

      expect(response.success).toBe(true);
      expect(response.data?.task?.name).toBe('Review Meeting Notes');
    });

    it('should create task with end date for repeat rule', async () => {
      const response = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Limited Repeat Task',
        dueDate: '2025-11-17',
        repeatRule: {
          frequency: 'FREQ=DAILY;INTERVAL=2',
          anchorTo: 'when-due',
          skipMissed: false,
          endCondition: {
            type: 'afterDate',
            date: '2025-12-31'
          }
        },
        tags: ['test', 'limited-repeat']
      });

      expect(response.success).toBe(true);
    });

    it('should support legacy repeat format for backward compatibility', async () => {
      // Legacy format (old API)
      const response = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Legacy Repeat Task',
        dueDate: '2025-11-17',
        repeatRule: {
          unit: 'day',
          steps: 1,
          method: 'Fixed'
        },
        tags: ['test', 'legacy-repeat']
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Version Detection & Feature Flags', () => {
    it('should report version information in system tool', async () => {
      const response = await client.callTool('system', {
        operation: 'version'
      });

      expect(response.success).toBe(true);
      expect(response.metadata?.omnifocus_version).toBeDefined();
    });

    it('should support version-aware feature queries', async () => {
      // Create a task using 4.7+ features
      const response = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Version Test Task',
        plannedDate: '2025-11-20',
        repeatRule: {
          frequency: 'FREQ=WEEKLY',
          anchorTo: 'when-marked-done'
        },
        tags: ['test', 'version-detect']
      });

      // If OmniFocus 4.7+, should succeed
      // If OmniFocus 4.6.1, might fail or degrade gracefully
      if (response.success) {
        expect(response.data?.task?.taskId).toBeDefined();
      } else {
        // Graceful degradation message expected
        expect(response.error?.message).toContain(
          'OmniFocus 4.7' || 'version' || 'feature'
        );
      }
    });
  });

  describe('Combined Feature Usage', () => {
    it('should create complex task with all 4.7+ features', async () => {
      // Create task combining planned dates, repeats, and tags
      const response = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Comprehensive 4.7+ Test Task',
        dueDate: '2025-11-20 14:00',
        plannedDate: '2025-11-20 09:00',
        repeatRule: {
          frequency: 'FREQ=WEEKLY;BYDAY=WE',
          anchorTo: 'when-marked-done',
          skipMissed: true,
          endCondition: {
            type: 'afterOccurrences',
            count: 10
          }
        },
        tags: ['test', 'comprehensive', 'all-features'],
        note: 'Task testing all OmniFocus 4.7+ features'
      });

      expect(response.success).toBe(true);
      expect(response.data?.task?.taskId).toBeDefined();
      expect(response.data?.task?.name).toBe('Comprehensive 4.7+ Test Task');
    });

    it('should query tasks with all 4.7+ properties', async () => {
      // Create comprehensive task
      const createResponse = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Query Test Task',
        dueDate: '2025-11-20',
        plannedDate: '2025-11-20 10:00',
        repeatRule: {
          frequency: 'FREQ=DAILY',
          anchorTo: 'when-due'
        },
        tags: ['test', 'query-all']
      });

      expect(createResponse.success).toBe(true);

      // Query inbox tasks (task created without project goes to inbox)
      const queryResponse = await client.callTool('tasks', {
        mode: 'inbox'
      });

      expect(queryResponse.success).toBe(true);
      const testTask = (queryResponse.data?.tasks || []).find(
        (t: any) => t.tags?.includes('query-all')
      );

      expect(testTask).toBeDefined();
      expect(testTask?.plannedDate).toBeDefined();
      expect(testTask?.repetitionRule).toBeDefined();
    });
  });
});
