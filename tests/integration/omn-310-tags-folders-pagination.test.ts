/**
 * OMN-310 regression: tags/folders queries silently ignored `limit` AND
 * `offset` against REAL OmniFocus.
 *
 * The bug: handleTagQuery never passed limit (the script enumerated every
 * tag), handleFolderQuery hardcoded limit:100, and neither read
 * compiled.offset — while BaseQuerySchema advertises both for every query
 * type. Both builders also capped BEFORE sorting, so an honored in-loop
 * limit would have returned an arbitrary subset, sorted (the memory §5 trap).
 *
 * Contract under test (mirrors OMN-309's projects pagination):
 *  - pages at offset 0/2/4 with limit 2 are disjoint, follow sort order, and
 *    jointly cover the fixture population exactly
 *  - total_count reports the full matching population on every page
 *  - truncated is true iff offset + returned < population
 *  - a repeated page is served from cache with the same rows (limit/offset
 *    participate in the cache key)
 *
 * Deterministic fixtures, all run-scoped:
 *  - 5 subfolders inside the sandbox folder (fullCleanup sweeps them)
 *  - 5 `__test-`-prefixed tags carried by one inbox task (the cleanup sweep
 *    removes `__test-` tags and tag-carrying inbox fixtures)
 * Suffixes _0.._4 sort lexicographically, so name/path-sorted pages are
 * deterministic: [_0,_1], [_2,_3], [_4].
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName, runScopedTag } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

interface Row {
  id: string;
  name: string;
}
interface ListMetadata {
  total_count?: number;
  returned_count?: number;
  truncated?: boolean;
  from_cache?: boolean;
  offset?: number;
  [key: string]: unknown;
}
interface ListResponse {
  success: boolean;
  data?: { tags?: Row[]; folders?: Row[]; items?: Row[] };
  metadata: ListMetadata;
}

const FIXTURE_COUNT = 5;
const PAGE_LIMIT = 2;
const PAGE_OFFSETS = [0, 2, 4];

d('OMN-310: tags/folders limit+offset pagination against real OmniFocus', () => {
  let client: MCPTestClient;

  const FOLDER_MARKER = runScopedName('OMN310_Fold');
  const TAG_BASE = runScopedTag('omn310');
  const tagNames = Array.from({ length: FIXTURE_COUNT }, (_, i) => `${TAG_BASE}-${i}`);

  const readFolderPage = async (offset: number): Promise<ListResponse> =>
    (await client.callTool('omnifocus_read', {
      query: {
        type: 'folders',
        filters: { name: { contains: FOLDER_MARKER } },
        limit: PAGE_LIMIT,
        offset,
      },
    })) as ListResponse;

  const readTagPage = async (offset: number): Promise<ListResponse> =>
    (await client.callTool('omnifocus_read', {
      query: {
        type: 'tags',
        filters: { name: { contains: TAG_BASE } },
        limit: PAGE_LIMIT,
        offset,
      },
    })) as ListResponse;

  const rowsOf = (r: ListResponse): Row[] => r.data?.tags ?? r.data?.folders ?? r.data?.items ?? [];

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    // 5 subfolders inside the sandbox folder
    for (let i = 0; i < FIXTURE_COUNT; i++) {
      const resp = (await client.callTool('omnifocus_write', {
        mutation: {
          operation: 'create_folder',
          data: { name: `${FOLDER_MARKER}_${i}`, parentFolder: SANDBOX_FOLDER_NAME },
        },
      })) as { success: boolean };
      expect(resp.success).toBe(true);
    }

    // 5 run-scoped __test- tags, carried by one inbox fixture task
    const taskResp = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: { name: runScopedName('OMN310_TagCarrier'), tags: tagNames },
      },
    })) as { success: boolean };
    expect(taskResp.success).toBe(true);
  }, 180000);

  afterAll(async () => {
    await fullCleanup();
    await client.thoroughCleanup();
  });

  describe.each([
    ['folders', (offset: number) => readFolderPage(offset)],
    ['tags', (offset: number) => readTagPage(offset)],
  ] as const)('%s', (_label, readPage) => {
    it('pages are disjoint, sorted, and jointly cover the population exactly', async () => {
      const pages: ListResponse[] = [];
      for (const offset of PAGE_OFFSETS) pages.push(await readPage(offset));

      for (const page of pages) {
        expect(page.success).toBe(true);
        expect(page.metadata.total_count).toBe(FIXTURE_COUNT);
      }

      const namesPerPage = pages.map((p) => rowsOf(p).map((r) => r.name));
      expect(namesPerPage.map((names) => names.length)).toEqual([2, 2, 1]);

      // Pre-fix, limit was ignored (tags: all rows; folders: 100-cap) and every
      // offset returned the same rows — disjoint coverage is the regression assertion.
      const union = namesPerPage.flat();
      expect(new Set(union).size).toBe(FIXTURE_COUNT);
      // Pages follow sort order end-to-end: _0.._4 in sequence.
      expect(union).toEqual([...union].sort((a, b) => a.localeCompare(b)));
    }, 120000);

    it('truncated marks non-final pages only; metadata.offset is surfaced', async () => {
      const first = await readPage(0);
      const last = await readPage(4);

      expect(first.metadata.offset).toBe(0);
      expect(first.metadata.truncated).toBe(true); // 0 + 2 < 5
      expect(last.metadata.offset).toBe(4);
      expect(last.metadata.truncated).toBeUndefined(); // 4 + 1 = 5 → final page
    }, 120000);

    it('serves a repeated page from cache with the same rows', async () => {
      const fresh = await readPage(2);
      const repeat = await readPage(2);

      expect(repeat.metadata.from_cache).toBe(true);
      expect(rowsOf(repeat).map((r) => r.name)).toEqual(rowsOf(fresh).map((r) => r.name));
    }, 120000);
  });
});
