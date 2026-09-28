/**
 * OMN-332 regression: read date filters are LOCAL whole days, inclusive, end to end.
 *
 * The bug: `new Date("YYYY-MM-DD")` in the generated OmniJS is UTC midnight while
 * writes are local time, so for a US-Eastern user between ["…-10-01","…-10-31"] ended
 * at Oct 30 20:00 local and missed a task due Oct 31 at 17:00. Unit tests pin the
 * compiled bounds; this pins the behavior through the real bridge (JXA → OmniJS),
 * which is where a Date-construction quirk would hide.
 *
 * Contract (Kip, 2026-09-28, option A): a date-only bound is a whole local day,
 * inclusive; a "YYYY-MM-DD HH:mm" bound is that exact local instant. Probe tasks sit
 * just inside and just outside each day edge, so every assertion discriminates.
 *
 * Tasks live in a sandbox-folder project; cleanup is the suite-level teardown sweep.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName, RUN_ID } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

interface TasksReadResponse {
  success: boolean;
  data?: { tasks?: Array<{ id: string }> };
  metadata?: { total_count?: number };
}
interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}

// Local due times straddling the Oct 1–31 edges (all written as local time).
const PROBES = {
  sep30Late: '2026-09-30 23:30', // just before the start day
  oct1Early: '2026-10-01 00:30', // just inside the start day
  oct31At17: '2026-10-31 17:00', // the ticket's case: default due time on the end day
  nov1Early: '2026-11-01 00:30', // just after the end day
} as const;
type Probe = keyof typeof PROBES;

d('OMN-332: read date filters are local whole days, inclusive (live bridge)', () => {
  let client: MCPTestClient;
  const MARKER = `XYZLOCALDAY${RUN_ID.replace(/[^a-z0-9]/gi, '')}`;
  const ids = {} as Record<Probe, string>;

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    const response = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: { tempId: 'holder', name: runScopedName('LocalDay_Holder'), folder: SANDBOX_FOLDER_NAME },
          },
          ...(Object.keys(PROBES) as Probe[]).map((probe) => ({
            operation: 'create',
            target: 'task',
            data: {
              tempId: probe,
              name: runScopedName(`LocalDay_${probe}_${MARKER}`),
              dueDate: PROBES[probe],
              parentTempId: 'holder',
            },
          })),
        ],
        returnMapping: true,
      },
    })) as BatchResponse;

    expect(response.success).toBe(true);
    const mapping = response.data.tempIdMapping ?? {};
    for (const probe of Object.keys(PROBES) as Probe[]) {
      ids[probe] = mapping[probe];
      expect(ids[probe]).toBeTruthy();
    }
  }, 120000);

  async function matching(dueDate: Record<string, unknown>): Promise<Probe[]> {
    const response = (await client.callTool('omnifocus_read', {
      query: { type: 'tasks', filters: { text: { contains: MARKER }, dueDate }, fields: ['id'], limit: 10 },
    })) as TasksReadResponse;
    expect(response.success).toBe(true);
    const returned = new Set((response.data?.tasks ?? []).map((t) => t.id));
    return (Object.keys(PROBES) as Probe[]).filter((probe) => returned.has(ids[probe])).sort();
  }

  it('between covers both named days fully — includes Oct 31 17:00, excludes the neighbors', async () => {
    expect(await matching({ between: ['2026-10-01', '2026-10-31'] })).toEqual(['oct1Early', 'oct31At17']);
  });

  it('before a date includes that whole day', async () => {
    expect(await matching({ before: '2026-10-31' })).toEqual(['oct1Early', 'oct31At17', 'sep30Late']);
  });

  it('after a date starts at 00:00 local on that day', async () => {
    expect(await matching({ after: '2026-10-01' })).toEqual(['nov1Early', 'oct1Early', 'oct31At17']);
  });

  it('an HH:mm bound is the exact local instant', async () => {
    expect(await matching({ before: '2026-10-31 16:59' })).toEqual(['oct1Early', 'sep30Late']);
    expect(await matching({ before: '2026-10-31 17:00' })).toEqual(['oct1Early', 'oct31At17', 'sep30Late']);
  });

  it('countOnly agrees with the row path for a date-only range', async () => {
    const response = (await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { text: { contains: MARKER }, dueDate: { between: ['2026-10-01', '2026-10-31'] } },
        countOnly: true,
      },
    })) as TasksReadResponse;
    expect(response.success).toBe(true);
    expect(response.metadata?.total_count).toBe(2);
  });

  it('a value that is not YYYY-MM-DD[ HH:mm] is rejected, never spliced', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { text: { contains: MARKER }, dueDate: { before: '2026-01-01") || true || ("' } },
        },
      }),
    ).rejects.toMatchObject({ code: -32602 });
  });
});
