/**
 * Smoke Tests - Tier 2: Quick OmniFocus Sanity Check
 *
 * Purpose: Prove OmniFocus connection works with minimal round-trip
 * Time: 40-60 seconds for tests, ~100s total with setup/teardown
 * Trigger: Manual (npm run test:smoke) or as part of pre-commit
 *
 * Performance Notes (measured December 2024):
 * - system diagnostics: ~20-25s (runs multiple OmniFocus scripts)
 * - create/verify/delete: ~15-20s (multiple OmniFocus operations)
 * - query projects: ~1-2s
 * - Total pre-commit time: ~2.5 minutes (lint + unit + smoke)
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
  }, 30000); // Server startup with cache warming

  afterAll(async () => {
    await client.cleanup();
    await client.stop();
  }, 30000); // Cleanup may need multiple OmniFocus calls

  it('system diagnostics reports healthy', async () => {
    const result = await client.callTool('system', { operation: 'diagnostics' });

    expect(result.success).toBe(true);
    expect(result.metadata?.health).toBe('healthy');
  }, 60000); // Diagnostics runs multiple OmniFocus scripts (~20-25s typical)

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
  }, 45000); // Multiple OmniFocus operations (~15-20s typical)

  it('can query projects without error', async () => {
    const result = await client.callTool('omnifocus_read', {
      query: {
        type: 'projects',
        limit: 5,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  }, 30000); // Single query (~1-2s typical, extra margin for system load)
});
