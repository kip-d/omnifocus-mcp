import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPTestClient } from '../helpers/mcp-test-client.js';

/**
 * P0 Priority: Filter Results Validation
 *
 * PURPOSE: Prevent bugs like #9 (text filter) and #10 (date range filter)
 * by validating that filters return ONLY matching results.
 *
 * PATTERN: query with filter → validate EVERY result matches filter
 */
describe('Filter Results Validation', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.startServer();
  }, 30000);

  afterAll(async () => {
    await client.stop();
  });

  describe('Text Filter (Bug #9 Prevention)', () => {
    it('should return ONLY tasks containing search text in name or note', async () => {
      const searchTerm = 'meeting';

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            text: { contains: searchTerm }
          },
          limit: 100
        }
      });

      // ✅ Validate response structure
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result matches filter
        data.data.tasks.forEach((task: any, index: number) => {
          const nameMatch = task.name?.toLowerCase().includes(searchTerm.toLowerCase());
          const noteMatch = task.note?.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesFilter = nameMatch || noteMatch;

          expect(matchesFilter).toBe(true);

          // If this fails, show which task and why
          if (!matchesFilter) {
            console.error(`Task ${index} doesn't match filter:`, {
              id: task.id,
              name: task.name,
              note: task.note?.substring(0, 50),
              searchTerm
            });
          }
        });
      }
    }, 60000);
  });

  describe('Date Range Filter (Bug #10 Prevention)', () => {
    it('should return ONLY tasks within specified date range', async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 7);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 7);

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            dueDate: { between: [startStr, endStr] }
          },
          limit: 100
        }
      });

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result is in range
        data.data.tasks.forEach((task: any, index: number) => {
          expect(task.dueDate).toBeDefined();

          const taskDate = task.dueDate.split('T')[0];
          const isInRange = taskDate >= startStr && taskDate <= endStr;

          expect(isInRange).toBe(true);

          // If this fails, show which task and date
          if (!isInRange) {
            console.error(`Task ${index} outside date range:`, {
              id: task.id,
              name: task.name,
              dueDate: task.dueDate,
              expected: `${startStr} to ${endStr}`
            });
          }
        });

        // ✅ Validate no tasks without due dates
        const tasksWithoutDates = data.data.tasks.filter((t: any) => !t.dueDate);
        expect(tasksWithoutDates.length).toBe(0);
      }
    }, 60000);

    it('should exclude tasks before start date', async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + 1); // Tomorrow
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 7); // Next week

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            dueDate: { between: [startStr, endStr] }
          },
          limit: 100
        }
      });

      if (data.data?.tasks?.length > 0) {
        // ✅ Validate NO tasks before start date
        data.data.tasks.forEach((task: any) => {
          const taskDate = task.dueDate.split('T')[0];
          expect(taskDate >= startStr).toBe(true);
        });
      }
    }, 60000);
  });

  describe('Tag Filter Operators (Bug #12 Extension)', () => {
    it('should return tasks with ANY of specified tags', async () => {
      const requiredTags = ['Personal', 'Work']; // Common tags likely to exist

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            tags: { any: requiredTags }
          },
          fields: ['id', 'name', 'tags'],
          limit: 50
        }
      });

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result has at least one required tag
        data.data.tasks.forEach((task: any, index: number) => {
          expect(Array.isArray(task.tags)).toBe(true);

          const hasRequiredTag = task.tags.some((tag: string) =>
            requiredTags.includes(tag)
          );

          expect(hasRequiredTag).toBe(true);

          // If this fails, show which task and tags
          if (!hasRequiredTag) {
            console.error(`Task ${index} missing required tags:`, {
              id: task.id,
              name: task.name,
              actualTags: task.tags,
              requiredTags
            });
          }
        });
      }
    }, 60000);

    it('should return tasks with ALL specified tags', async () => {
      const requiredTags = ['Personal', 'Work']; // Tasks must have both

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            tags: { all: requiredTags }
          },
          fields: ['id', 'name', 'tags'],
          limit: 50
        }
      });

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result has ALL required tags
        data.data.tasks.forEach((task: any, index: number) => {
          expect(Array.isArray(task.tags)).toBe(true);

          const hasAllTags = requiredTags.every((requiredTag: string) =>
            task.tags.includes(requiredTag)
          );

          expect(hasAllTags).toBe(true);

          // If this fails, show which task and missing tags
          if (!hasAllTags) {
            const missingTags = requiredTags.filter((tag: string) =>
              !task.tags.includes(tag)
            );
            console.error(`Task ${index} missing required tags:`, {
              id: task.id,
              name: task.name,
              actualTags: task.tags,
              requiredTags,
              missingTags
            });
          }
        });
      }
    }, 60000);

    it('should exclude tasks with specified tags (none operator)', async () => {
      const excludedTags = ['Waiting', 'Someday']; // Tasks must not have these

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            tags: { none: excludedTags }
          },
          fields: ['id', 'name', 'tags'],
          limit: 50
        }
      });

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate NO result has excluded tags
        data.data.tasks.forEach((task: any, index: number) => {
          expect(Array.isArray(task.tags)).toBe(true);

          const hasExcludedTag = task.tags.some((tag: string) =>
            excludedTags.includes(tag)
          );

          expect(hasExcludedTag).toBe(false);

          // If this fails, show which task has excluded tags
          if (hasExcludedTag) {
            const foundExcludedTags = task.tags.filter((tag: string) =>
              excludedTags.includes(tag)
            );
            console.error(`Task ${index} has excluded tags:`, {
              id: task.id,
              name: task.name,
              actualTags: task.tags,
              excludedTags,
              foundExcludedTags
            });
          }
        });
      }
    }, 60000);
  });

  describe('Combined Filters (P0-3: Complex Queries)', () => {
    it('should apply text + date filters together', async () => {
      const searchTerm = 'review'; // Common word
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 30);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 30);

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            text: { contains: searchTerm },
            dueDate: { between: [startStr, endStr] }
          },
          limit: 50
        }
      });

      expect(data.success).toBe(true);

      if (data.data?.tasks?.length > 0) {
        // ✅ Validate EVERY result matches ALL filters
        data.data.tasks.forEach((task: any) => {
          // Text filter
          const nameMatch = task.name?.toLowerCase().includes(searchTerm.toLowerCase());
          const noteMatch = task.note?.toLowerCase().includes(searchTerm.toLowerCase());
          expect(nameMatch || noteMatch).toBe(true);

          // Date range filter
          const taskDate = task.dueDate?.split('T')[0];
          expect(taskDate).toBeDefined();
          expect(taskDate >= startStr && taskDate <= endStr).toBe(true);
        });
      }
    }, 60000);
  });
});
