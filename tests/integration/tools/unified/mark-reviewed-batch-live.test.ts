/**
 * OMN-256 / OMN-286 — batch mark_reviewed live /verify against real OmniFocus.
 *
 * This is the layer the unit tests structurally cannot reach: the per-op unit
 * test runs the generated OmniJS via vm.runInNewContext and never goes through
 * the real dispatch path's sandbox guard. This probe exercises the FULL path
 * end-to-end against a real OmniFocus DB.
 *
 * Three angles:
 *   1. Happy path (guarded server): batch-mark two REAL sandbox projects
 *      reviewed via projectIds[] → both succeed, metadata.projects_updated === 2,
 *      lastReviewDate persists on read-back.
 *   2. Continue-on-error partition (UNGUARDED server — the production contract):
 *      batch [realId, bogusId] → the batch does NOT abort; realId lands in
 *      results.successful, bogusId in results.failed, projects_updated === 1.
 *      This is the honest count fix (de691ce3) proven live.
 *   3. Guard masks not-found (guarded server — OMN-286 documented behavior):
 *      the same [realId, bogusId] batch on a GUARDED server is rejected whole
 *      by the sandbox pre-flight before the script runs — the identical
 *      guard-masks-not-found property create-paths already documents for
 *      single-op creates. Confirms production (guard off) is the only place
 *      the continue-on-error contract is meant to hold, per OMN-286.
 *
 * Sandbox conventions: projects created in __MCP_TEST_SANDBOX__, run-scoped
 * names, deleted in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { expectOk } from '../../helpers/expect-ok.js';
import { SANDBOX_FOLDER_NAME, ensureSandboxFolder } from '../../helpers/sandbox-manager.js';
import { runScopedName } from '../../helpers/run-id.js';
import { UnifiedTestServer } from '../../helpers/unified-test-server.js';

const BOGUS_PROJECT_ID = 'omn256-nonexistent-project-id-000';

describe('Batch mark_reviewed live (OMN-256 / OMN-286)', () => {
  let server: UnifiedTestServer;
  const createdProjectIds: string[] = [];

  async function createSandboxProject(label: string): Promise<string> {
    const res = await server.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'project',
        data: { name: runScopedName(`OMN256_${label}_${Date.now()}`), folder: SANDBOX_FOLDER_NAME },
      },
    });
    expectOk(res, `create sandbox project ${label}`);
    const id = res.data?.project?.id ?? res.data?.project?.projectId ?? res.data?.id;
    expect(id, `created project id (${label})`).toBeTruthy();
    createdProjectIds.push(id);
    return id;
  }

  beforeAll(async () => {
    server = await UnifiedTestServer.start();
    await ensureSandboxFolder();
  }, 60000);

  afterAll(async () => {
    for (const id of createdProjectIds) {
      try {
        await server.callTool('omnifocus_write', {
          mutation: { operation: 'delete', target: 'project', target_id: id },
        });
      } catch {
        /* best-effort cleanup */
      }
    }
    server?.kill();
  });

  // ── 1. Happy path: batch-mark two real projects reviewed ──────────────────
  it('marks two real sandbox projects reviewed in one call; projects_updated === 2', async () => {
    const idA = await createSandboxProject('A');
    const idB = await createSandboxProject('B');

    const res = await server.callTool('omnifocus_analyze', {
      analysis: { type: 'manage_reviews', params: { operation: 'mark_reviewed', projectIds: [idA, idB] } },
    });
    expectOk(res, 'batch mark_reviewed two projects');

    // Honest count (de691ce3): both succeeded, so projects_updated === 2.
    expect(res.metadata.projects_updated).toBe(2);
    const summary = res.data?.batch?.results?.summary;
    expect(summary?.successful_count).toBe(2);
    expect(summary?.failed_count).toBe(0);

    // Read back: both projects now carry a lastReviewDate.
    const readRes = await server.callTool('omnifocus_read', {
      query: { type: 'projects', filters: { folder: SANDBOX_FOLDER_NAME }, fields: ['id', 'lastReviewDate'] },
    });
    expectOk(readRes, 'read back lastReviewDate');
    const projects: Array<{ id: string; lastReviewDate?: string }> = readRes.data?.projects ?? [];
    for (const id of [idA, idB]) {
      const p = projects.find((x) => x.id === id);
      expect(p?.lastReviewDate, `lastReviewDate persisted for ${id}`).toBeTruthy();
    }
  }, 120000);

  // ── 2. Continue-on-error partition on an UNGUARDED server (prod contract) ──
  it('unguarded: a not-found id partitions into failed[] instead of aborting; projects_updated === 1', async () => {
    const idC = await createSandboxProject('C');

    // The sandbox guard's pre-flight masks the script-level not-found handling
    // on a guarded server (OMN-286) — exactly as create-paths documents for
    // single-op creates. So the continue-on-error contract, which is a
    // PRODUCTION property (guard off), is verified on an unguarded server.
    const unguarded = await UnifiedTestServer.start({ guarded: false });
    let res: any;
    try {
      res = await unguarded.callTool('omnifocus_analyze', {
        analysis: {
          type: 'manage_reviews',
          params: { operation: 'mark_reviewed', projectIds: [idC, BOGUS_PROJECT_ID] },
        },
      });
    } finally {
      unguarded.kill();
    }

    expectOk(res, 'unguarded batch mark_reviewed mixed');
    const results = res.data?.batch?.results;
    expect(results?.successful?.map((r: { projectId: string }) => r.projectId)).toContain(idC);
    expect(results?.failed?.map((r: { projectId: string }) => r.projectId)).toContain(BOGUS_PROJECT_ID);
    // The honest count: one real success, not two requested.
    expect(res.metadata.projects_updated).toBe(1);
    expect(results?.summary?.successful_count).toBe(1);
    expect(results?.summary?.failed_count).toBe(1);
  }, 120000);

  // ── 3. Guard masks not-found on a GUARDED server (OMN-286 documented) ──────
  it('guarded: a not-found id in the batch is rejected whole by the sandbox pre-flight (OMN-286)', async () => {
    const idD = await createSandboxProject('D');

    // On the guarded main server, the pre-flight (Promise.all over
    // validateProjectInSandbox) treats the not-found id as out-of-sandbox and
    // rejects the ENTIRE batch before the continue-on-error script runs. This
    // is the OMN-286 behavior — test-mode only; production (test 2) partitions.
    const res = await server.callTool('omnifocus_analyze', {
      analysis: {
        type: 'manage_reviews',
        params: { operation: 'mark_reviewed', projectIds: [idD, BOGUS_PROJECT_ID] },
      },
    });
    expect(res.success, `guarded mixed batch should be rejected whole: ${JSON.stringify(res).slice(0, 300)}`).toBe(
      false,
    );
    expect(JSON.stringify(res.error ?? res.metadata)).toMatch(/sandbox|not found|guard/i);
  }, 120000);
});
