// tests/unit/diagnostics/linear-filer.test.ts
import { it, expect, vi } from 'vitest';
import { fileDriftIssues } from '../../../src/diagnostics/linear-filer.js';

const cluster = (fp: string, cls: string) => ({
  fingerprint: fp,
  tool: 't',
  classification: cls,
  suggestedFix: 'fix',
  firstSeen: '',
  lastSeen: '',
  count: 5,
});

it('files ONLY SCHEMA_DRIFT, never judgment/no-op classes', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue('OMN-1'),
  };
  await fileDriftIssues(
    [cluster('a', 'SCHEMA_DRIFT'), cluster('b', 'DESCRIPTION_GAP'), cluster('c', 'COERCION_MISSING')],
    { client, perRunLimit: 3, capThreshold: 230 },
  );
  expect(client.createIssue).toHaveBeenCalledTimes(1);
});

it('trips the cap guard at >= capThreshold and creates nothing', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(230),
    searchByLabelAndBody: vi.fn(),
    createIssue: vi.fn(),
  };
  const r = await fileDriftIssues([cluster('a', 'SCHEMA_DRIFT')], { client, perRunLimit: 3, capThreshold: 230 });
  expect(client.createIssue).not.toHaveBeenCalled();
  expect(r.capGuardTripped).toBe(true);
});

it('dedups against an existing issue with the same fingerprint in body', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue(['OMN-7']),
    createIssue: vi.fn(),
  };
  await fileDriftIssues([cluster('dup', 'SCHEMA_DRIFT')], { client, perRunLimit: 3, capThreshold: 230 });
  expect(client.createIssue).not.toHaveBeenCalled();
  // Assert the dedup search actually ran with the right label + fingerprint. Without this,
  // a bug that skips searchByLabelAndBody entirely (treating dedup as always-true) would
  // pass silently — createIssue would also not be called for the wrong reason.
  expect(client.searchByLabelAndBody).toHaveBeenCalledWith('omn-37-auto', 'dup');
});

it('caps creations at perRunLimit', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue('OMN-X'),
  };
  await fileDriftIssues(
    [
      cluster('a', 'SCHEMA_DRIFT'),
      cluster('b', 'SCHEMA_DRIFT'),
      cluster('c', 'SCHEMA_DRIFT'),
      cluster('d', 'SCHEMA_DRIFT'),
    ],
    { client, perRunLimit: 3, capThreshold: 230 },
  );
  expect(client.createIssue).toHaveBeenCalledTimes(3);
});

it('isolates a mid-loop createIssue failure: records it in failed[], continues, does NOT throw', async () => {
  // 3 eligible SCHEMA_DRIFT clusters, perRunLimit high enough for all 3. createIssue resolves
  // for cluster 1, REJECTS for cluster 2, resolves for cluster 3.
  //
  // NON-VACUOUS: if the per-cluster try/catch were removed, the cluster-2 rejection would
  // propagate out of fileDriftIssues — the `await expect(...).resolves` below would fail
  // (it would reject), cluster 3's createIssue would never be attempted (call count 2 not 3),
  // and `created` would never be returned to the caller (silent loss of cluster 1). Each of
  // the three assertions independently bites if the isolation is gone.
  const createIssue = vi
    .fn()
    .mockResolvedValueOnce('OMN-101') // cluster 1 ok
    .mockRejectedValueOnce(new Error('Linear 500: rate limited')) // cluster 2 fails
    .mockResolvedValueOnce('OMN-103'); // cluster 3 ok (proves loop continued past the failure)
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue([]),
    createIssue,
  };

  const result = await fileDriftIssues(
    [cluster('c1', 'SCHEMA_DRIFT'), cluster('c2', 'SCHEMA_DRIFT'), cluster('c3', 'SCHEMA_DRIFT')],
    { client, perRunLimit: 5, capThreshold: 230 },
  );

  // Did NOT throw (we got a result) and cluster 3 WAS still attempted after cluster 2 failed
  expect(createIssue).toHaveBeenCalledTimes(3);
  // Successes carry their fingerprints
  expect(result.created).toEqual([
    { fingerprint: 'c1', id: 'OMN-101' },
    { fingerprint: 'c3', id: 'OMN-103' },
  ]);
  // The failed cluster is recorded with its error message — caller can surface FILE_FAILED
  expect(result.failed).toEqual([{ fingerprint: 'c2', error: 'Linear 500: rate limited' }]);
  expect(result.capGuardTripped).toBe(false);
});

it('returns failed:[] when nothing fails (always present)', async () => {
  const client = {
    openIssueCount: vi.fn().mockResolvedValue(10),
    searchByLabelAndBody: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue('OMN-1'),
  };
  const r = await fileDriftIssues([cluster('a', 'SCHEMA_DRIFT')], { client, perRunLimit: 3, capThreshold: 230 });
  expect(r.failed).toEqual([]);
});
