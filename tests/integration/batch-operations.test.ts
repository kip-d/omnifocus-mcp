/**
 * Integration tests for batch operations using unified API
 *
 * Uses the test sandbox for isolation:
 * - Projects created in __MCP_TEST_SANDBOX__ folder
 * - Tags prefixed with __test-
 * - Cleanup via TestWriteClient
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME, TEST_TAG_PREFIX } from './helpers/sandbox-manager.js';

// Only run on macOS with OmniFocus
const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';

const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

/**
 * Response shape from routeToBatch() (flat format):
 *
 * Success:
 *   { success: true, data: { operation, summary, results: FlatBatchResult[], tempIdMapping? }, metadata }
 *
 * Each result item:
 *   { operation: 'create'|'update'|'complete'|'delete', success, id, name?, tempId?, type?, changes?, error? }
 *
 * Error items (from catch blocks) are also in results[] with success: false.
 */

// Helper type for flat batch result items
interface FlatBatchResult {
  operation: string;
  success: boolean;
  id: string | null;
  name?: string;
  tempId?: string;
  type?: string;
  changes?: string[];
  error?: string;
}

// Helper type for the batch response format
interface BatchResponse {
  success: boolean;
  data: {
    operation: string;
    summary: { created: number; updated: number; completed: number; deleted: number; errors: number };
    results: FlatBatchResult[];
    tempIdMapping?: Record<string, string>;
  };
  metadata: {
    operation: string;
    timestamp: string;
    query_time_ms?: number;
  };
}

d('Batch Operations Integration (Unified API)', () => {
  let client: MCPTestClient;
  const timestamp = Date.now();

  beforeAll(async () => {
    client = await getSharedClient();
    // Ensure sandbox folder exists
    await ensureSandboxFolder();
  });

  afterAll(async () => {
    // Cleanup all test data via sandbox manager
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it('should create a simple project in sandbox', async () => {
    const response = (await client.callTool('omnifocus_write', {
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
              folder: SANDBOX_FOLDER_NAME,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    expect(response).toHaveProperty('success', true);
    expect(response.data.summary.created).toBe(1);

    // Flat results: first item is the created project
    const createResult = response.data.results[0];
    expect(createResult.success).toBe(true);
    expect(createResult.operation).toBe('create');
    expect(createResult.id).toBeTruthy();
  }, 30000);

  it('should create project with task in sandbox', async () => {
    const response = (await client.callTool('omnifocus_write', {
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
              folder: SANDBOX_FOLDER_NAME,
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
    })) as BatchResponse;

    expect(response).toHaveProperty('success', true);
    expect(response.data.summary.created).toBe(2);
    // Flat results: 2 create items
    expect(response.data.results.filter((r) => r.operation === 'create')).toHaveLength(2);
  }, 30000);

  it('should create nested tasks (task with subtask) in sandbox', async () => {
    const response = (await client.callTool('omnifocus_write', {
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
              folder: SANDBOX_FOLDER_NAME,
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
    })) as BatchResponse;

    expect(response).toHaveProperty('success', true);
    expect(response.data.summary.created).toBe(3);
  }, 60000); // Nested task operations may take longer due to validation

  it('should allow duplicate project names (OmniFocus behavior)', async () => {
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
              folder: SANDBOX_FOLDER_NAME,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    });

    expect(result1).toHaveProperty('success', true);

    // OmniFocus allows duplicate project names (projects are identified by ID, not name)
    const result2 = (await client.callTool('omnifocus_write', {
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
              folder: SANDBOX_FOLDER_NAME,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    // Duplicate project names are allowed in OmniFocus
    expect(result2).toHaveProperty('success', true);
    expect(result2.data.summary.created).toBe(1);
  }, 30000);

  it('should return tempId to realId mapping', async () => {
    const response = (await client.callTool('omnifocus_write', {
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
              folder: SANDBOX_FOLDER_NAME,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    // tempIdMapping is at the top level of data (single copy, not duplicated in metadata)
    expect(response.data).toHaveProperty('tempIdMapping');
    expect(response.data.tempIdMapping).toHaveProperty('proj6');
    expect(response.data.tempIdMapping!.proj6).toBeTruthy();
  }, 30000);

  it('should stop on error when configured', async () => {
    const response = (await client.callTool('omnifocus_write', {
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
              folder: SANDBOX_FOLDER_NAME,
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
              folder: SANDBOX_FOLDER_NAME,
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    // routeToBatch detects validation error and propagates it
    expect(response).toHaveProperty('success', false);
    expect(response.data.summary.errors).toBeGreaterThan(0);

    // Error items are in the flat results array with success: false
    const errorResults = response.data.results.filter((r) => r.success === false);
    expect(errorResults.length).toBeGreaterThan(0);
    expect(errorResults[0].error).toContain('nonexistent');
  }, 30000);

  it('should validate circular dependencies', async () => {
    const response = (await client.callTool('omnifocus_write', {
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
    })) as BatchResponse;

    // routeToBatch detects validation error and propagates it
    expect(response).toHaveProperty('success', false);
    expect(response.data.summary.errors).toBeGreaterThan(0);

    // Error items are in the flat results array with success: false
    const errorResults = response.data.results.filter((r) => r.success === false);
    expect(errorResults.length).toBeGreaterThan(0);
    expect(errorResults[0].error).toContain('Circular');
  }, 30000);

  it('should handle tasks with dates and metadata in sandbox', async () => {
    const response = (await client.callTool('omnifocus_write', {
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
              folder: SANDBOX_FOLDER_NAME,
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
              tags: [`${TEST_TAG_PREFIX}batch`, `${TEST_TAG_PREFIX}integration`],
              note: 'Test task with all fields',
            },
          },
        ],
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    expect(response).toHaveProperty('success', true);
    expect(response.data.summary.created).toBe(2);
  }, 30000);
});
