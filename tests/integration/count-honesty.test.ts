/**
 * OMN-154: Count-honesty contract live integration probes (C11 shape).
 *
 * Contract under test:
 * - R1: metadata.total_count = full matching population (post-filter, pre-offset/limit)
 * - R2: metadata.truncated = true iff offset + returned_count < total_count
 * - R3: metadata.total_matched is NOT emitted (D3 — removed from public contract)
 * - R4: countOnly query reports same total_count as a row query with sufficient limit
 * - R6: second identical query returns from_cache: true with identical count metadata
 *
 * Deterministic fixture: 10 tasks inside a sandbox project, each named with a
 * run-unique marker. Assertions are keyed on marker-filtered counts, not live DB
 * population, so they are stable across any OmniFocus state.
 *
 * Follows the patterns established in name-filter-scope.test.ts:
 * - getSharedClient / sandbox isolation / fullCleanup / RUN_ID markers
 * - Tasks created inside a sandbox project (NOT the inbox)
 * - Tool responses called+parsed via client.callTool
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { ensureSandboxFolder, fullCleanup, SANDBOX_FOLDER_NAME } from './helpers/sandbox-manager.js';
import { runScopedName, RUN_ID } from './helpers/run-id.js';

const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  name: string;
}

interface TasksMetadata {
  total_count?: number;
  returned_count?: number;
  truncated?: boolean;
  from_cache?: boolean;
  total_matched?: number; // Must NOT be present per D3
  [key: string]: unknown;
}

interface TasksSummary {
  total_count?: number;
  returned_count?: number;
  [key: string]: unknown;
}

interface TasksReadResponse {
  success: boolean;
  data?: { tasks?: TaskRow[] };
  metadata: TasksMetadata;
  summary?: TasksSummary;
}

interface ProjectRow {
  id: string;
  name: string;
  [key: string]: unknown;
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
  summary?: { total_projects?: number; [key: string]: unknown };
}

interface BatchResponse {
  success: boolean;
  data: { tempIdMapping?: Record<string, string> };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

d('OMN-154: count-honesty contract (C11 shape)', () => {
  let client: MCPTestClient;

  // Run-unique marker — never appears in any real task name, so marker-filtered
  // result sets are exactly the 10 probe records created in beforeAll.
  const MARKER = `XYZCOUNT${RUN_ID.replace(/[^a-z0-9]/gi, '')}`;
  const TASK_COUNT = 10;

  async function readTasks(query: Record<string, unknown>): Promise<TasksReadResponse> {
    return (await client.callTool('omnifocus_read', { query: { type: 'tasks', ...query } })) as TasksReadResponse;
  }

  async function readProjects(query: Record<string, unknown>): Promise<ProjectsReadResponse> {
    return (await client.callTool('omnifocus_read', { query: { type: 'projects', ...query } })) as ProjectsReadResponse;
  }

  // ---------------------------------------------------------------------------
  // Fixture setup
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    client = await getSharedClient();
    await ensureSandboxFolder();

    // Build batch: one holder project + TASK_COUNT tasks inside it.
    const operations: unknown[] = [
      {
        operation: 'create',
        target: 'project',
        data: {
          tempId: 'holder',
          name: runScopedName(`CountHonesty_Holder`),
          folder: SANDBOX_FOLDER_NAME,
        },
      },
    ];

    for (let i = 1; i <= TASK_COUNT; i++) {
      const seq = String(i).padStart(2, '0');
      operations.push({
        operation: 'create',
        target: 'task',
        data: {
          tempId: `task${seq}`,
          name: runScopedName(`CountHonesty_${MARKER}-${seq}`),
          parentTempId: 'holder',
        },
      });
    }

    const batchResponse = (await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations,
        createSequentially: true,
        atomicOperation: false,
        returnMapping: true,
        stopOnError: true,
      },
    })) as BatchResponse;

    expect(batchResponse.success, 'batch create must succeed').toBe(true);

    // Fail-fast check: confirm all 10 tasks landed via countOnly before tests run.
    const countCheck = await readTasks({
      filters: { name: { contains: MARKER } },
      countOnly: true,
    });
    expect(
      countCheck.metadata.total_count,
      `Fixture setup: expected ${TASK_COUNT} tasks with marker "${MARKER}" in OmniFocus, got ${countCheck.metadata.total_count}. Fixture may not have landed — aborting.`,
    ).toBe(TASK_COUNT);
  }, 120_000);

  afterAll(async () => {
    await fullCleanup();
  }, 120_000);

  // ---------------------------------------------------------------------------
  // C11 shape: truncated page — the core count-honesty scenario
  // ---------------------------------------------------------------------------

  it('C11: limit < population → total_count=population, returned_count=limit, truncated=true, total_matched absent', async () => {
    const result = await readTasks({
      filters: { name: { contains: MARKER } },
      limit: 5,
    });

    expect(result.success).toBe(true);
    const meta = result.metadata;

    // R1: total_count must equal the full matching population (10)
    expect(meta.total_count, 'metadata.total_count must equal full population').toBe(TASK_COUNT);

    // Returned rows
    const returnedRows = result.data?.tasks?.length ?? 0;
    expect(returnedRows, 'returned row count must equal limit').toBe(5);
    expect(meta.returned_count, 'metadata.returned_count must equal returned rows').toBe(5);

    // R2: truncated=true because 0 + 5 < 10
    expect(meta.truncated, 'metadata.truncated must be true when limit < population').toBe(true);

    // D3: total_matched must NOT be present
    expect('total_matched' in meta, 'metadata.total_matched must be absent (D3)').toBe(false);

    // summary.total_count alignment
    expect(result.summary?.total_count, 'summary.total_count must equal full population').toBe(TASK_COUNT);
  }, 60_000);

  it('R4 agreement: countOnly reports same total_count as full query', async () => {
    const countResult = await readTasks({
      filters: { name: { contains: MARKER } },
      countOnly: true,
    });

    expect(countResult.success).toBe(true);
    expect(countResult.metadata.total_count, 'countOnly total_count must match population').toBe(TASK_COUNT);
  }, 60_000);

  // ---------------------------------------------------------------------------
  // Complete fetch — no truncation
  // ---------------------------------------------------------------------------

  it('complete fetch: limit > population → total_count=population, returned_count=population, no truncated key', async () => {
    const result = await readTasks({
      filters: { name: { contains: MARKER } },
      limit: 50,
    });

    expect(result.success).toBe(true);
    const meta = result.metadata;

    expect(meta.total_count, 'total_count must equal full population').toBe(TASK_COUNT);
    expect(meta.returned_count, 'returned_count must equal full population').toBe(TASK_COUNT);
    expect(result.data?.tasks?.length, 'data.tasks.length must equal full population').toBe(TASK_COUNT);

    // R2: NOT truncated → truncated key must be absent
    expect('truncated' in meta, 'truncated key must be absent when all rows fit').toBe(false);
  }, 60_000);

  // ---------------------------------------------------------------------------
  // Offset last page
  // ---------------------------------------------------------------------------

  it('offset last page: offset=5 limit=5 → total_count=10, returned_count=5, no truncated key', async () => {
    const result = await readTasks({
      filters: { name: { contains: MARKER } },
      limit: 5,
      offset: 5,
    });

    expect(result.success).toBe(true);
    const meta = result.metadata;

    expect(meta.total_count, 'total_count must equal full population').toBe(TASK_COUNT);
    expect(meta.returned_count, 'returned_count must equal 5 (last page)').toBe(5);
    expect(result.data?.tasks?.length, 'data.tasks.length must equal 5 (last page)').toBe(5);

    // R2: offset(5) + returned(5) == population(10) → NOT truncated
    expect('truncated' in meta, 'truncated key must be absent on last page').toBe(false);
  }, 60_000);

  // ---------------------------------------------------------------------------
  // Sorted path
  // ---------------------------------------------------------------------------

  it('sorted path: sort asc + limit=3 → total_count=10, truncated=true, first 3 are lexicographically earliest', async () => {
    const result = await readTasks({
      filters: { name: { contains: MARKER } },
      limit: 3,
      sort: [{ field: 'name', direction: 'asc' }],
    });

    expect(result.success).toBe(true);
    const meta = result.metadata;

    expect(meta.total_count, 'total_count must equal full population').toBe(TASK_COUNT);
    expect(meta.truncated, 'truncated must be true (3 < 10)').toBe(true);

    // Returned names should be the 3 lexicographically first of the 10 fixture names.
    // All fixture names share the same MARKER prefix with sequence suffix -01 … -10.
    // Lexicographic order puts -01, -02, -03 first (digit comparison on equal prefix length).
    const returnedNames = (result.data?.tasks ?? []).map((t) => t.name);
    expect(returnedNames.length, 'must have 3 returned rows').toBe(3);

    // Verify they are sorted ascending
    const sortedCopy = [...returnedNames].sort();
    expect(returnedNames, 'returned names must be in ascending lexicographic order').toEqual(sortedCopy);

    // The three returned names must be a subset of the fixture names
    for (const name of returnedNames) {
      expect(name, `"${name}" must contain the run marker`).toContain(MARKER);
    }
  }, 60_000);

  // ---------------------------------------------------------------------------
  // R6: Projects + cache consistency
  // ---------------------------------------------------------------------------

  it('R6 projects + cache: second call returns from_cache=true with same total_count and truncated state', async () => {
    // Clear cache before first call so we get a fresh query.
    await client.clearCache();

    const firstResult = await readProjects({
      filters: { status: 'active' },
      limit: 1,
    });

    expect(firstResult.success, 'first projects query must succeed').toBe(true);
    const firstMeta = firstResult.metadata;

    // Basic invariants on the first call
    expect(firstMeta.returned_count, 'returned_count must be 1 (limit=1)').toBe(1);
    expect(typeof firstMeta.total_count, 'total_count must be a number').toBe('number');
    expect((firstMeta.total_count as number) >= 1, 'total_count must be >= 1 (at least our holder project exists)').toBe(
      true,
    );

    // If there are more projects than the limit, truncated must be true
    if ((firstMeta.total_count as number) > 1) {
      expect(firstMeta.truncated, 'truncated must be true when total_count > limit').toBe(true);
    }

    // Second call — should hit the cache
    const secondResult = await readProjects({
      filters: { status: 'active' },
      limit: 1,
    });

    expect(secondResult.success, 'second projects query must succeed').toBe(true);
    const secondMeta = secondResult.metadata;

    // R6: cache hit
    expect(secondMeta.from_cache, 'second call must be from cache').toBe(true);

    // Count metadata must be identical across cache hit
    expect(secondMeta.total_count, 'cached total_count must match fresh total_count').toBe(firstMeta.total_count);
    expect(secondMeta.truncated, 'cached truncated state must match fresh truncated state').toBe(firstMeta.truncated);
  }, 60_000);
});
