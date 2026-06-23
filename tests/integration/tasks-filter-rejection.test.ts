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

d('OMN-167: tasks-side folder implemented; on_hold rejection; projects regression', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = await getSharedClient();
  });

  it('folder base: tasks filters.folder now resolves (OMN-167 — was OMN-162 reject)', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { folder: 'Bills' },
        limit: 10,
      },
    })) as { success: boolean; data?: { tasks?: unknown[] } };

    // The flip from reject → working query: must succeed and return a tasks array
    // (0 rows is fine if no project sits under a "Bills" folder).
    expect(result.success).toBe(true);
    expect(result.data?.tasks, 'envelope missing data.tasks').toBeDefined();
  }, 30000);

  it('folder OR variant: OR containing folder now resolves (OMN-167)', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { OR: [{ folder: 'Bills' }, { flagged: true }] },
        limit: 10,
      },
    })) as { success: boolean; data?: { tasks?: unknown[] } };

    expect(result.success).toBe(true);
    expect(result.data?.tasks, 'envelope missing data.tasks').toBeDefined();
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

  // OMN-172 (S4): a terminal status inside an OR branch was silently unsatisfiable
  // (dropped==false AND (dropped==true OR ...)). Now rejects with steering.
  it('terminal OR branch: {OR:[{status:dropped},{flagged}]} rejects with steering', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { OR: [{ status: 'dropped' }, { flagged: true }] },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/top level/i);
  }, 30000);

  it('terminal OR branch (completed sibling): {OR:[{status:completed},{flagged}]} rejects', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { OR: [{ status: 'completed' }, { flagged: true }] },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/completed/i);
  }, 30000);

  it('control: top-level status:dropped + OR branch succeeds (base lifts exclusion)', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { status: 'dropped', OR: [{ status: 'dropped' }, { flagged: true }] },
        limit: 1,
      },
    })) as { success: boolean; data?: { tasks?: unknown[] } };

    expect(result.success).toBe(true);
    expect(result.data?.tasks, 'envelope missing data.tasks').toBeDefined();
  }, 30000);
});
