/**
 * OMN-156 regression: projects OR must REJECT with steering (not silently
 * return all-projects), completed:false must exclude done projects, and
 * mode:'flagged' must compose with OR (not be silently ignored).
 *
 * C18 shape: `{type:'projects', filters:{OR:[...]}}` returned 10 match-all
 * rows before this PR — the OR was silently dropped and the query widened to
 * the whole projects database.
 *
 * Mode+OR composition (V6): `mode:'flagged'` was augmented AFTER the OR
 * early-return in buildAST, so the flagged constraint never reached the
 * compiled script and unflagged tasks leaked in.
 *
 * Read-only — no fixtures, no sandbox, no cleanup.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('OMN-156: projects OR rejects with steering; completed:false and mode+OR compose', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = await getSharedClient();
  });

  it('C18: projects OR rejects with steering (not silent match-all)', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'projects',
          filters: {
            OR: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }],
          },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/not supported on projects/i);

    // Also assert the steering text is present (filters.name alternative is mentioned)
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'projects',
          filters: {
            OR: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }],
          },
          limit: 10,
        },
      }),
    ).rejects.toThrow(/filters\.name/);
  }, 30000);

  it('projects completed:false is effective — all returned rows are active or on-hold', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'projects',
        filters: { completed: false },
        limit: 50,
        fields: ['id', 'name', 'status'],
      },
    })) as { success: boolean; data?: { projects?: Array<{ id: string; name: string; status: string }> } };

    expect(result.success).toBe(true);

    const projects = result.data?.projects ?? [];
    if (projects.length === 0) {
      console.warn('projects completed:false returned 0 rows — fixture-independent but unexpected on real DB');
      return;
    }

    // Status values from warm-projects-cache: 'active' | 'onHold' | 'done' | 'dropped'
    // completed:false should exclude 'done' and 'dropped'
    const allowed = new Set(['active', 'onHold', 'on_hold', 'on-hold']);
    for (const project of projects) {
      expect(
        allowed.has(project.status),
        `project "${project.name}" (id: ${project.id}) has status "${project.status}" — expected active or onHold`,
      ).toBe(true);
    }
  }, 60000);

  it('mode:flagged + OR composition — returned tasks all have flagged:true', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        mode: 'flagged',
        filters: {
          OR: [{ name: { contains: 'a' } }, { name: { contains: 'e' } }],
        },
        limit: 50,
        fields: ['id', 'name', 'flagged'],
      },
    })) as { success: boolean; data?: { tasks?: Array<{ id: string; name: string; flagged: boolean }> } };

    expect(result.success).toBe(true);

    const tasks = result.data?.tasks ?? [];
    if (tasks.length === 0) {
      console.warn(
        'mode:flagged + OR returned 0 rows — acceptable if no flagged tasks match names containing "a" or "e"',
      );
      return;
    }

    for (const task of tasks) {
      expect(
        task.flagged,
        `task "${task.name}" (id: ${task.id}) has flagged=${String(task.flagged)} — mode:'flagged' must exclude unflagged tasks`,
      ).toBe(true);
    }
  }, 60000);
});
