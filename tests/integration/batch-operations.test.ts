/**
 * Integration tests for batch operations using unified API
 *
 * These tests require real OmniFocus access and must be run with:
 * VITEST_ALLOW_JXA=1 npx vitest tests/integration/batch-operations.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation.js';

// Only run on macOS with OmniFocus and real JXA enabled
const RUN_INTEGRATION_TESTS =
  process.env.DISABLE_INTEGRATION_TESTS !== 'true' &&
  process.platform === 'darwin' &&
  process.env.VITEST_ALLOW_JXA === '1';

const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('Batch Operations Integration (Unified API)', () => {
  let client: MCPTestClient;
  const createdIds: Array<{ id: string; type: 'project' | 'task' }> = [];
  const timestamp = Date.now();

  beforeAll(async () => {
    client = await getSharedClient();
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

    await client.thoroughCleanup();
  });

  it('should create a simple project', async () => {
    const response = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'project',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj1',
              name: `TestBatch_Simple_${timestamp}`,
              note: 'Integration test project',
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    expect(response).toHaveProperty('success', true);
    expect(response).toHaveProperty('data');
    const result = (response as { data: { success: boolean; created: number; results: Array<{ realId: string; type: string }> } }).data;

    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    expect(result.results[0].realId).toBeTruthy();

    // Track for cleanup
    if (result.results[0].realId) {
      createdIds.push({ id: result.results[0].realId, type: 'project' });
    }
  }, 30000);

  it('should create project with task', async () => {
    const response = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj2',
              name: `TestBatch_ProjectWithTasks_${timestamp}`,
              note: 'Has child tasks',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task1',
              name: `TestBatch_ChildTask_${timestamp}`,
              parentTempId: 'proj2',
              dueDate: '2025-10-15',
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    expect(response).toHaveProperty('success', true);
    const result = (response as { data: { success: boolean; created: number; results: Array<{ realId: string; type: string }> } }).data;
    expect(result.created).toBe(2);
    expect(result.results).toHaveLength(2);

    // Track for cleanup (tasks first, then project)
    for (const item of result.results.reverse()) {
      if (item.realId) {
        createdIds.push({ id: item.realId, type: item.type as 'project' | 'task' });
      }
    }
  }, 30000);

  it('should create nested tasks (task with subtask)', async () => {
    const response = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj3',
              name: `TestBatch_NestedTasks_${timestamp}`,
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task2',
              name: `TestBatch_ParentTask_${timestamp}`,
              parentTempId: 'proj3',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task3',
              name: `TestBatch_Subtask_${timestamp}`,
              parentTempId: 'task2',
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    expect(response).toHaveProperty('success', true);
    const result = (response as { data: { success: boolean; created: number; results: Array<{ realId: string; type: string }> } }).data;
    expect(result.created).toBe(3);

    // Track for cleanup
    for (const item of result.results.reverse()) {
      if (item.realId) {
        createdIds.push({ id: item.realId, type: item.type as 'project' | 'task' });
      }
    }
  }, 30000);

  it('should handle duplicate project names gracefully', async () => {
    const projectName = 'Test Duplicate Project ' + Date.now();

    // Create first project
    const result1 = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'project',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj4',
              name: projectName,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    const data1 = (result1 as { data: { results: Array<{ realId: string }> } }).data;
    if (data1.results[0].realId) {
      createdIds.push({ id: data1.results[0].realId, type: 'project' });
    }

    // Try to create duplicate
    const result2 = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'project',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj5',
              name: projectName,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    const data2 = (result2 as { data: { success: boolean; failed: number } }).data;
    expect(data2.success).toBe(false);
    expect(data2.failed).toBe(1);
  }, 30000);

  it('should return tempId to realId mapping', async () => {
    const response = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'project',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj6',
              name: `TestBatch_Mapping_${timestamp}`,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    expect(response).toHaveProperty('data.mapping');
    const result = (response as { data: { mapping: Record<string, string>; results: Array<{ realId: string }> } }).data;
    expect(result.mapping).toHaveProperty('proj6');
    expect(result.mapping.proj6).toBeTruthy();

    if (result.results[0].realId) {
      createdIds.push({ id: result.results[0].realId, type: 'project' });
    }
  }, 30000);

  it('should stop on error when configured', async () => {
    const response = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj7',
              name: `TestBatch_ValidProject_${timestamp}`,
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task4',
              name: `TestBatch_MissingParent_${timestamp}`,
              parentTempId: 'nonexistent',
            },
          },
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj8',
              name: `TestBatch_ShouldNotCreate_${timestamp}`,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    // Should return error for missing parent
    expect(response).toHaveProperty('success', false);
    const errorResponse = response as { error?: { code: string; message: string; details?: unknown } };
    expect(errorResponse.error?.code).toBe('VALIDATION_ERROR');
    expect(errorResponse.error?.message).toContain('nonexistent');
  }, 30000);

  it('should validate circular dependencies', async () => {
    const response = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task5',
              name: `TestBatch_CircularA_${timestamp}`,
              parentTempId: 'task6',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task6',
              name: `TestBatch_CircularB_${timestamp}`,
              parentTempId: 'task5',
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    // Should return error for circular dependency
    expect(response).toHaveProperty('success', false);
    const errorResponse = response as { error?: { code: string; message: string } };
    expect(errorResponse.error?.code).toBe('VALIDATION_ERROR');
    expect(errorResponse.error?.message).toContain('Circular');
  }, 30000);

  it('should handle tasks with dates and metadata', async () => {
    const response = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj9',
              name: `TestBatch_Metadata_${timestamp}`,
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task7',
              name: `TestBatch_FullMetadata_${timestamp}`,
              parentTempId: 'proj9',
              dueDate: '2025-10-20 17:00',
              deferDate: '2025-10-10 08:00',
              estimatedMinutes: 60,
              flagged: true,
              tags: ['test', 'integration'],
              note: 'Test task with all fields',
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    expect(response).toHaveProperty('success', true);
    const result = (response as { data: { created: number; results: Array<{ realId: string; type: string }> } }).data;
    expect(result.created).toBe(2);

    // Cleanup
    for (const item of result.results.reverse()) {
      if (item.realId) {
        createdIds.push({ id: item.realId, type: item.type as 'project' | 'task' });
      }
    }
  }, 30000);
});
