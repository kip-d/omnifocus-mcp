/**
 * OMN-311 regression: projects queries silently accepted-and-dropped `sort`
 * against REAL OmniFocus.
 *
 * Contract under test:
 *  - sort name desc: pages (limit 2, offsets 0/2/4) follow reverse-name order
 *    end to end and jointly cover the fixture population exactly
 *  - sort dueDate asc with the sort key NOT in `fields`: order still correct
 *    (sort values read from the raw project object — the OMN-305 trap is
 *    deliberately not replicated on the projects side)
 *  - a fixture without a dueDate sorts LAST under dueDate asc (null-last)
 *  - metadata.sort_applied: true on sorted queries
 *  - sort on tags queries is rejected loudly (always name-sorted by design)
 *
 * Deterministic fixture: 5 projects inside the sandbox folder, run-unique
 * names with _0.._4 suffixes; _0.._3 carry ascending due dates, _4 has none.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

interface ProjectRow {
  id: string;
  name: string;
}
interface ProjectsReadResponse {
  success: boolean;
  data?: { projects?: ProjectRow[] };
  metadata: { sort_applied?: boolean; total_count?: number; [key: string]: unknown };
}
interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}

const FIXTURE_COUNT = 5;

d('OMN-311: projects sort against real OmniFocus', () => {
  let client: MCPTestClient;

  const MARKER = runScopedName('OMN311_Sort');
  const names = Array.from({ length: FIXTURE_COUNT }, (_, i) => `${MARKER}_${i}`);

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    const response = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: names.map((name, i) => ({
          operation: 'create' as const,
          target: 'project' as const,
          data: {
            tempId: `proj${i}`,
            name,
            folder: SANDBOX_FOLDER_NAME,
            // _0.._3 ascending due dates; _4 deliberately date-less (null-last probe)
            ...(i < 4 ? { dueDate: `2026-09-0${i + 1} 17:00` } : {}),
          },
        })),
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    expect(response.success).toBe(true);
  }, 180000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it('name desc pages follow reverse-name order and cover the population', async () => {
    const pages: ProjectsReadResponse[] = [];
    for (const offset of [0, 2, 4]) {
      pages.push(
        (await client.callTool('omnifocus_read', {
          query: {
            type: 'projects',
            filters: { name: { contains: MARKER } },
            sort: [{ field: 'name', direction: 'desc' }],
            fields: ['id', 'name'],
            limit: 2,
            offset,
          },
        })) as ProjectsReadResponse,
      );
    }

    for (const page of pages) {
      expect(page.success).toBe(true);
      expect(page.metadata.sort_applied).toBe(true);
      expect(page.metadata.total_count).toBe(FIXTURE_COUNT);
    }

    const gathered = pages.flatMap((p) => (p.data?.projects ?? []).map((r) => r.name));
    // Pre-fix, sort was dropped (DB order) — exact reverse-name order across
    // page boundaries is the regression assertion.
    expect(gathered).toEqual([...names].reverse());
  }, 120000);

  it('dueDate asc sorts correctly with the sort key NOT in fields; date-less project lands last', async () => {
    const result = (await client.callTool('omnifocus_read', {
      query: {
        type: 'projects',
        filters: { name: { contains: MARKER } },
        sort: [{ field: 'dueDate', direction: 'asc' }],
        fields: ['id', 'name'], // dueDate deliberately absent (OMN-305 immunity)
        limit: 25,
      },
    })) as ProjectsReadResponse;

    expect(result.success).toBe(true);
    const gathered = (result.data?.projects ?? []).map((r) => r.name);
    // _0.._3 by ascending due date, then the date-less _4 last.
    expect(gathered).toEqual(names);
  }, 120000);

  it('rejects sort on tags queries with guidance', async () => {
    await expect(
      client.callTool('omnifocus_read', {
        query: { type: 'tags', sort: [{ field: 'name', direction: 'desc' }] },
      }),
    ).rejects.toThrow(/sorted/i);
  }, 60000);
});
