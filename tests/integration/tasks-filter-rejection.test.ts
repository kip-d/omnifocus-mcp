/**
 * OMN-162/OMN-166 regression: tasks-side folder and status:'on_hold' were
 * silently inert (folder: 2306/2306 match-all live-verified 2026-06-12;
 * OR-branch variant widened to match-all). Now they must REJECT with steering.
 *
 * Read-only — no fixtures, no sandbox, no cleanup.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('OMN-162/OMN-166: tasks-side folder/on_hold rejection; projects regression', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = await getSharedClient();
  });

  it('folder base: tasks filters.folder rejects with steering', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { folder: 'Bills' },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/not supported on tasks or export/i);

    // Steering must mention projectId as the alternative
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { folder: 'Bills' },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/projectId/);
  }, 30000);

  it('folder OR variant: OR containing folder rejects (was live match-all)', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { OR: [{ folder: 'Bills' }, { flagged: true }] },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/not supported on tasks or export/i);
  }, 30000);

  it('on_hold: tasks filters.status on_hold rejects with steering', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { status: 'on_hold' },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/on-hold is a project status/i);
  }, 30000);

  it('projects regression: folder filter still works on projects query', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'projects',
        filters: { folder: 'Bills' },
        limit: 5,
      },
    })) as { success: boolean; data?: { projects?: unknown[] }; metadata?: unknown };

    expect(result.success).toBe(true);
    expect(result.data, 'envelope missing data').toBeDefined();
    expect(result.data?.projects, 'envelope missing data.projects').toBeDefined();
  }, 30000);

  it('control: tasks flagged filter succeeds', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { flagged: true },
        limit: 1,
      },
    })) as { success: boolean; data?: { tasks?: unknown[] } };

    expect(result.success).toBe(true);
    expect(result.data?.tasks, 'envelope missing data.tasks').toBeDefined();
  }, 30000);
});
