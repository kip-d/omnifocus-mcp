/**
 * OMN-171 (S3) flips C18: projects OR now RETURNS THE UNION of its branches
 * (it rejected with steering through OMN-156/OMN-161 S1). completed:false must
 * still exclude done/dropped projects, and mode:'flagged' must compose with OR.
 *
 * C18 history: `{type:'projects', filters:{OR:[...]}}` returned 10 match-all
 * rows pre-OMN-156 (OR silently dropped → whole-DB widening), then rejected
 * with steering (OMN-156), and now compiles to `orBranches` (OMN-171).
 *
 * Mode+OR composition (V6): `mode:'flagged'` was augmented AFTER the OR
 * early-return in buildAST, so the flagged constraint never reached the
 * compiled script and unflagged tasks leaked in.
 *
 * Read-only — no fixtures, no sandbox, no cleanup. Data-agnostic: probe
 * substrings are derived from live project names, not hardcoded.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

type ProjRow = { id: string; name: string; status?: string };
type ProjResult = { success: boolean; data?: { projects?: ProjRow[] } };

/** Derive a stable lowercase probe substring (≤4 chars) from a project name. */
const probeOf = (name: string): string => name.trim().slice(0, 4).toLowerCase();

d('OMN-171: projects OR returns the union of branches; completed:false and mode+OR compose', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = await getSharedClient();
  });

  it('C18 (OMN-171): projects OR returns the union of its branches (was reject)', async () => {
    // Derive data-agnostic probe substrings from live project names.
    const all = (await client.callTool('omnifocus_read', {
      query: { type: 'projects', filters: {}, limit: 50, fields: ['id', 'name'] },
    })) as ProjResult;
    const projects = all.data?.projects ?? [];
    if (projects.length < 2) {
      console.warn('projects OR union test: <2 projects in vault — skipping (data-agnostic)');
      return;
    }
    const s1 = probeOf(projects[0].name);
    // pick a second probe from a project whose name does NOT contain s1 (distinct branch)
    const other = projects.find((p) => !p.name.toLowerCase().includes(s1)) ?? projects[1];
    const s2 = probeOf(other.name);

    const orResult = (await client.callTool('omnifocus_read', {
      query: {
        type: 'projects',
        filters: { OR: [{ name: { contains: s1 } }, { name: { contains: s2 } }] },
        limit: 100,
        fields: ['id', 'name'],
      },
    })) as ProjResult;

    expect(orResult.success).toBe(true);
    const got = orResult.data?.projects ?? [];
    // Every returned project matches at least one branch (no match-all widening).
    for (const p of got) {
      const n = p.name.toLowerCase();
      expect(
        n.includes(s1) || n.includes(s2),
        `project "${p.name}" matched neither OR branch ("${s1}" / "${s2}") — OR widened to match-all`,
      ).toBe(true);
    }

    // Union ⊇ each single-branch result (OR is a superset of either alternative).
    const single = (await client.callTool('omnifocus_read', {
      query: { type: 'projects', filters: { name: { contains: s1 } }, limit: 100, fields: ['id', 'name'] },
    })) as ProjResult;
    const singleCount = single.data?.projects?.length ?? 0;
    expect(got.length).toBeGreaterThanOrEqual(singleCount);
  }, 60000);

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
    expect(result.data?.projects, 'envelope missing data.projects').toBeDefined();

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
    expect(result.data?.tasks, 'envelope missing data.tasks').toBeDefined();

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
