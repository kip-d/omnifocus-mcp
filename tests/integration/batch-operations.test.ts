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
 * Response shape from routeToBatch():
 *
 * Success:
 *   { success: true, data: { operation, summary, results: { created: [OmniFocusWriteTool batch handler response], ... }, tempIdMapping }, metadata }
 *
 * Error (validation failure in creates):
 *   { success: false, data: { operation, summary, results: { ..., errors: [OmniFocusWriteTool batch handler error response] } }, metadata }
 *
 * The OmniFocusWriteTool batch handler response nested inside results.created[0] has its own shape:
 *   { success: true, data: { success, created, failed, totalItems, results: [{ tempId, realId, success, type }], mapping }, metadata }
 */

// Helper type for the new batch response format
interface BatchResponse {
  success: boolean;
  data: {
    operation: string;
    summary: { created: number; updated: number; completed: number; deleted: number; errors: number };
    results: {
      created: Array<{
        success: boolean;
        data: {
          success: boolean;
          created: number;
          failed: number;
          totalItems: number;
          results: Array<{ tempId: string; realId: string; success: boolean; type: string }>;
          mapping: Record<string, string>;
        };
        metadata: Record<string, unknown>;
      }>;
      updated: unknown[];
      completed: unknown[];
      deleted: unknown[];
      errors: Array<{
        success: boolean;
        error?: { code: string; message: string; suggestion?: string; details?: unknown };
        [key: string]: unknown;
      }>;
    };
    tempIdMapping?: Record<string, string>;
  };
  metadata: {
    operation: string;
    timestamp: string;
    tempIdMapping?: Record<string, string>;
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

    // OmniFocusWriteTool batch handler result is nested inside results.created[0]
    const createResult = response.data.results.created[0];
    expect(createResult.success).toBe(true);
    expect(createResult.data.results[0].realId).toBeTruthy();
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
    // The inner OmniFocusWriteTool batch handler response has the individual item results
    expect(response.data.results.created[0].data.results).toHaveLength(2);
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

    // tempIdMapping is at the top level of data (merged from OmniFocusWriteTool batch handler)
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

    // routeToBatch detects OmniFocusWriteTool batch handler's validation error and propagates it
    expect(response).toHaveProperty('success', false);
    expect(response.data.summary.errors).toBeGreaterThan(0);

    // The validation error from OmniFocusWriteTool batch handler is in results.errors
    const errorResult = response.data.results.errors[0];
    expect(errorResult.error?.code).toBe('VALIDATION_ERROR');
    expect(errorResult.error?.message).toContain('nonexistent');
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

    // routeToBatch detects OmniFocusWriteTool batch handler's validation error and propagates it
    expect(response).toHaveProperty('success', false);
    expect(response.data.summary.errors).toBeGreaterThan(0);

    // The circular dependency error from OmniFocusWriteTool batch handler is in results.errors
    const errorResult = response.data.results.errors[0];
    expect(errorResult.error?.code).toBe('VALIDATION_ERROR');
    expect(errorResult.error?.message).toContain('Circular');
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
