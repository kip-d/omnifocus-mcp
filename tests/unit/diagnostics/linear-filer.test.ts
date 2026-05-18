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
