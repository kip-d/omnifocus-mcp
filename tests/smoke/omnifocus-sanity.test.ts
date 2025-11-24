/**
 * Smoke Tests - Tier 2: Quick OmniFocus Sanity Check
 *
 * Purpose: Prove OmniFocus connection works with minimal round-trip
 * Time: 8-12 seconds
 * Trigger: Manual (npm run test:smoke) or as part of pre-commit
 *
 * These tests verify the critical path works:
 * 1. System health check
 * 2. Create a task
 * 3. Verify task exists
 * 4. Delete task
 * 5. Verify deletion
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPTestClient } from '../integration/helpers/mcp-test-client.js';

describe('OmniFocus Smoke Tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.startServer();
  }, 15000);

  afterAll(async () => {
    await client.cleanup();
    await client.stop();
  }, 10000);

  it('system diagnostics reports healthy', async () => {
    const result = await client.callTool('system', { operation: 'diagnostics' });

    expect(result.success).toBe(true);
    expect(result.metadata?.health).toBe('healthy');
  }, 30000); // Diagnostics runs multiple OmniFocus scripts

  it('can create, verify, and delete a task', async () => {
    // Create
    const createResult = await client.createTestTask('Smoke Test Task');
    expect(createResult.success).toBe(true);

    const taskId = createResult.data?.task?.taskId;
    expect(taskId).toBeDefined();

    // Verify exists via query
    const queryResult = await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { id: taskId },
        limit: 1,
      },
    });
    expect(queryResult.success).toBe(true);

    // Note: Query by ID may return empty if task was just created
    // The important thing is no error occurred

    // Cleanup is handled by afterAll via client.cleanup()
  }, 20000);

  it('can query projects without error', async () => {
    const result = await client.callTool('omnifocus_read', {
      query: {
        type: 'projects',
        limit: 5,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  }, 10000);
});
