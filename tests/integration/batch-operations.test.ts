/**
 * Integration tests for batch operations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BatchCreateTool } from '../../src/tools/batch/BatchCreateTool.js';
import { CacheManager } from '../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation.js';

describe('Batch Operations Integration', () => {
  let tool: BatchCreateTool;
  let cache: CacheManager;
  const createdIds: Array<{ id: string; type: 'project' | 'task' }> = [];

  beforeAll(() => {
    cache = new CacheManager();
    tool = new BatchCreateTool(cache);
  });

  afterAll(async () => {
    // Cleanup: Delete all created items in reverse order
    const omni = new OmniAutomation();
    for (let i = createdIds.length - 1; i >= 0; i--) {
      const item = createdIds[i];
      try {
        if (item.type === 'project') {
          const script = `
            (() => {
              const app = Application('OmniFocus');
              const doc = app.defaultDocument();
              const projects = doc.flattenedProjects();
              for (let i = 0; i < projects.length; i++) {
                if (projects[i].id() === '${item.id}') {
                  doc.delete(projects[i]);
                  return JSON.stringify({ success: true });
                }
              }
              return JSON.stringify({ error: true, message: 'Project not found' });
            })();
          `;
          await omni.executeJson(script);
        } else {
          const script = `
            (() => {
              const app = Application('OmniFocus');
              const doc = app.defaultDocument();
              const tasks = doc.flattenedTasks();
              for (let i = 0; i < tasks.length; i++) {
                if (tasks[i].id() === '${item.id}') {
                  doc.delete(tasks[i]);
                  return JSON.stringify({ success: true });
                }
              }
              return JSON.stringify({ error: true, message: 'Task not found' });
            })();
          `;
          await omni.executeJson(script);
        }
      } catch (e) {
        console.error(`Failed to cleanup ${item.type} ${item.id}:`, e);
      }
    }
  });

  it('should create a simple project', async () => {
    const result = await tool.execute({
      items: [
        {
          tempId: 'proj1',
          type: 'project',
          name: 'Test Batch Project',
          note: 'Integration test project',
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('data');
    const data = (result as { data: { success: boolean; created: number; results: Array<{ realId: string; type: string }> } }).data;
    expect(data.success).toBe(true);
    expect(data.created).toBe(1);
    expect(data.results[0].realId).toBeTruthy();

    // Track for cleanup
    if (data.results[0].realId) {
      createdIds.push({ id: data.results[0].realId, type: 'project' });
    }
  }, 30000);

  it('should create project with task', async () => {
    const result = await tool.execute({
      items: [
        {
          tempId: 'proj2',
          type: 'project',
          name: 'Test Project with Tasks',
          note: 'Has child tasks',
        },
        {
          tempId: 'task1',
          type: 'task',
          name: 'Child Task',
          parentTempId: 'proj2',
          dueDate: '2025-10-15',
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    expect(result).toHaveProperty('success', true);
    const data = (result as { data: { success: boolean; created: number; results: Array<{ realId: string; type: string }> } }).data;
    expect(data.created).toBe(2);
    expect(data.results).toHaveLength(2);

    // Track for cleanup (tasks first, then project)
    for (const item of data.results.reverse()) {
      if (item.realId) {
        createdIds.push({ id: item.realId, type: item.type as 'project' | 'task' });
      }
    }
  }, 30000);

  it('should create nested tasks (task with subtask)', async () => {
    const result = await tool.execute({
      items: [
        {
          tempId: 'proj3',
          type: 'project',
          name: 'Test Nested Tasks',
        },
        {
          tempId: 'task2',
          type: 'task',
          name: 'Parent Task',
          parentTempId: 'proj3',
        },
        {
          tempId: 'task3',
          type: 'task',
          name: 'Subtask',
          parentTempId: 'task2',
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    expect(result).toHaveProperty('success', true);
    const data = (result as { data: { success: boolean; created: number; results: Array<{ realId: string; type: string }> } }).data;
    expect(data.created).toBe(3);

    // Track for cleanup
    for (const item of data.results.reverse()) {
      if (item.realId) {
        createdIds.push({ id: item.realId, type: item.type as 'project' | 'task' });
      }
    }
  }, 30000);

  it('should handle duplicate project names gracefully', async () => {
    const projectName = 'Test Duplicate Project ' + Date.now();

    // Create first project
    const result1 = await tool.execute({
      items: [
        {
          tempId: 'proj4',
          type: 'project',
          name: projectName,
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    const data1 = (result1 as { data: { results: Array<{ realId: string }> } }).data;
    if (data1.results[0].realId) {
      createdIds.push({ id: data1.results[0].realId, type: 'project' });
    }

    // Try to create duplicate
    const result2 = await tool.execute({
      items: [
        {
          tempId: 'proj5',
          type: 'project',
          name: projectName,
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    const data2 = (result2 as { data: { success: boolean; failed: number } }).data;
    expect(data2.success).toBe(false);
    expect(data2.failed).toBe(1);
  }, 30000);

  it('should return tempId to realId mapping', async () => {
    const result = await tool.execute({
      items: [
        {
          tempId: 'proj6',
          type: 'project',
          name: 'Test Mapping Project',
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    expect(result).toHaveProperty('data.mapping');
    const data = (result as { data: { mapping: Record<string, string>; results: Array<{ realId: string }> } }).data;
    expect(data.mapping).toHaveProperty('proj6');
    expect(data.mapping.proj6).toBeTruthy();

    if (data.results[0].realId) {
      createdIds.push({ id: data.results[0].realId, type: 'project' });
    }
  }, 30000);

  it('should stop on error when configured', async () => {
    const result = await tool.execute({
      items: [
        {
          tempId: 'proj7',
          type: 'project',
          name: 'Valid Project',
        },
        {
          tempId: 'task4',
          type: 'task',
          name: 'Task with missing parent',
          parentTempId: 'nonexistent',
        },
        {
          tempId: 'proj8',
          type: 'project',
          name: 'Should Not Be Created',
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    const data = (result as { data: { created: number; failed: number; results: Array<{ realId: string | null; type: string }> } }).data;
    // Should have validation error before creating anything
    expect(data.created).toBeLessThan(3);
    expect(data.failed).toBeGreaterThan(0);

    // Cleanup any created items
    for (const item of data.results.reverse()) {
      if (item.realId) {
        createdIds.push({ id: item.realId, type: item.type as 'project' | 'task' });
      }
    }
  }, 30000);

  it('should validate circular dependencies', async () => {
    const result = await tool.execute({
      items: [
        {
          tempId: 'task5',
          type: 'task',
          name: 'Task A',
          parentTempId: 'task6',
        },
        {
          tempId: 'task6',
          type: 'task',
          name: 'Task B',
          parentTempId: 'task5',
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    // Should return error for circular dependency
    expect(result).toHaveProperty('success', false);
    const data = result as { error?: string; code?: string };
    expect(data.code).toBe('VALIDATION_ERROR');
  }, 30000);

  it('should handle tasks with dates and metadata', async () => {
    const result = await tool.execute({
      items: [
        {
          tempId: 'proj9',
          type: 'project',
          name: 'Test Metadata Project',
        },
        {
          tempId: 'task7',
          type: 'task',
          name: 'Task with Full Metadata',
          parentTempId: 'proj9',
          dueDate: '2025-10-20 17:00',
          deferDate: '2025-10-10 08:00',
          estimatedMinutes: '60',
          flagged: true,
          tags: ['test', 'integration'],
          note: 'Test task with all fields',
        },
      ],
      createSequentially: 'true',
      atomicOperation: 'false',
      returnMapping: 'true',
      stopOnError: 'true',
    });

    expect(result).toHaveProperty('success', true);
    const data = (result as { data: { created: number; results: Array<{ realId: string; type: string }> } }).data;
    expect(data.created).toBe(2);

    // Cleanup
    for (const item of data.results.reverse()) {
      if (item.realId) {
        createdIds.push({ id: item.realId, type: item.type as 'project' | 'task' });
      }
    }
  }, 30000);
});