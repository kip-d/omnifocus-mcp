/**
 * OMN-309 regression: projects queries silently ignored `offset` against REAL
 * OmniFocus.
 *
 * The bug: handleProjectQuery never read compiled.offset — it was absent from
 * the buildFilteredProjectsScript options (the builder had no offset support at
 * all) AND from the cache key, so every page returned page 1, and a cache hit
 * made the no-op invisible (`from_cache: true` serving page 1 to offset 100).
 *
 * Contract under test (mirrors the tasks-side OMN-154 count honesty):
 *  - pages at offset 0/2/4 with limit 2 are disjoint and jointly cover the
 *    fixture population exactly
 *  - total_count reports the full matching population on every page
 *  - truncated is true iff offset + returned < population (absent on the
 *    final page)
 *  - repeating a page query serves it from cache WITH the same rows — offset
 *    participates in the cache key
 *
 * Deterministic fixture: 5 projects inside the sandbox folder, named with a
 * run-unique marker; every query filters on that marker so assertions are
 * stable across any live OmniFocus state. Pages rely on OmniJS
 * flattenedProjects iteration order being stable across queries in one run,
 * which holds for an unchanged database.
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
interface ProjectsMetadata {
  total_count?: number;
  returned_count?: number;
  truncated?: boolean;
  from_cache?: boolean;
  [key: string]: unknown;
}
interface ProjectsReadResponse {
  success: boolean;
  data?: { projects?: ProjectRow[] };
  metadata: ProjectsMetadata;
}
interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}

const FIXTURE_COUNT = 5;
const PAGE_LIMIT = 2;

d('OMN-309: projects offset pagination against real OmniFocus', () => {
  let client: MCPTestClient;

  // Shared run-unique marker: creation names and the query filter use the SAME
  // string, so the matching population is exactly our 5 fixtures.
  const MARKER = runScopedName('OMN309_Page');
  let fixtureIds: string[];

  const readPage = async (offset: number): Promise<ProjectsReadResponse> =>
    (await client.callTool('omnifocus_read', {
      query: {
        type: 'projects',
        filters: { name: { contains: MARKER } },
        fields: ['id', 'name'],
        limit: PAGE_LIMIT,
        offset,
      },
    })) as ProjectsReadResponse;

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    const response = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: Array.from({ length: FIXTURE_COUNT }, (_, i) => ({
          operation: 'create' as const,
          target: 'project' as const,
          data: {
            tempId: `proj${i}`,
            name: `${MARKER}_${i}`,
            folder: SANDBOX_FOLDER_NAME,
          },
        })),
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    expect(response.success).toBe(true);
    const mapping = response.data.tempIdMapping ?? {};
    fixtureIds = Array.from({ length: FIXTURE_COUNT }, (_, i) => mapping[`proj${i}`]);
    for (const id of fixtureIds) expect(id).toBeTruthy();
  }, 180000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  it('pages are disjoint and jointly cover the population exactly', async () => {
    const pages = [await readPage(0), await readPage(2), await readPage(4)];

    for (const page of pages) {
      expect(page.success).toBe(true);
      expect(page.metadata.total_count).toBe(FIXTURE_COUNT);
    }

    const rowsPerPage = pages.map((p) => (p.data?.projects ?? []).map((r) => r.id));
    expect(rowsPerPage.map((rows) => rows.length)).toEqual([2, 2, 1]);

    // Pre-fix, every page returned page 1 — disjointness is the regression assertion.
    const union = new Set(rowsPerPage.flat());
    expect(union.size).toBe(FIXTURE_COUNT);
    expect([...union].sort()).toEqual([...fixtureIds].sort());
  }, 120000);

  it('truncated is set on non-final pages and absent on the final page', async () => {
    const first = await readPage(0);
    const last = await readPage(4);

    // offset 0: 0 + 2 < 5 → truncated
    expect(first.metadata.truncated).toBe(true);
    // offset 4: 4 + 1 = 5 → final page, not truncated
    expect(last.metadata.truncated).toBeUndefined();
  }, 120000);

  it('serves a repeated page from cache with the same rows (offset in cache key)', async () => {
    const fresh = await readPage(2);
    const repeat = await readPage(2);

    expect(repeat.metadata.from_cache).toBe(true);
    expect((repeat.data?.projects ?? []).map((r) => r.id)).toEqual((fresh.data?.projects ?? []).map((r) => r.id));
  }, 120000);
});
