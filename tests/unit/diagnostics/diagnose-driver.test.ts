// tests/unit/diagnostics/diagnose-driver.test.ts
import { it, expect, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDiagnosis } from '../../../scripts/diagnose-failures.js';
import { loadLedger } from '../../../src/diagnostics/ledger.js';
import { z } from 'zod';

it('deterministically classifies a coercion-gap cluster without invoking the agent', async () => {
  const agentRunner = vi.fn();
  const sink = vi.fn();
  await runDiagnosis({
    records: (() => {
      const base = {
        tool: 'omnifocus_x',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'Expected number, received string',
        inputArgs: { limit: '5' },
        schemaDescription: 'test',
      };
      return [
        { ...base, timestamp: '2026-05-16T10:00:00.000Z' },
        { ...base, timestamp: '2026-05-17T10:00:00.000Z' },
        { ...base, timestamp: '2026-05-18T10:00:00.000Z' },
      ];
    })(),
    registry: [
      {
        name: 'omnifocus_x',
        getInputSchema: () => ({ type: 'object', properties: { limit: { type: 'number' } } }),
        zodSchema: z.object({ limit: z.number() }),
      },
    ],
    ledgerPath: join(mkdtempSync(join(tmpdir(), 'omn37-drv-')), 'ledger.json'),
    now: new Date('2026-05-18T12:00:00Z'),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc: sink,
    agentRunner,
  });
  // The agent is bypassed because the cluster was resolved DETERMINISTICALLY
  // (advertised limit:number vs Zod z.number() rejecting the string '5' → COERCION_GAP),
  // not because there was nothing to classify.
  expect(agentRunner).not.toHaveBeenCalled();
  expect(sink).toHaveBeenCalledOnce();
  const md = sink.mock.calls[0][0] as string;

  // Assert the actual classified table row is present — NOT the static legend.
  // The legend line for COERCION_MISSING does not contain the tool name, so a line
  // carrying BOTH 'omnifocus_x' and 'COERCION_MISSING' can only be the data row.
  const classifiedRow = md
    .split('\n')
    .find((line) => line.includes('omnifocus_x') && line.includes('COERCION_MISSING'));
  expect(classifiedRow, `expected a triage table row classifying omnifocus_x as COERCION_MISSING\n${md}`).toBeDefined();
  expect(classifiedRow).toMatch(/^\|.*\|.*\|/); // it is a markdown table row
});

// ---------------------------------------------------------------------------
// Task 15 — --create-issues wiring tests
// ---------------------------------------------------------------------------

/** Build 3 records spanning >= 2 days for a given tool+error pattern. */
function makeRecords(tool: string, errorMessage: string) {
  const base = {
    tool,
    errorType: 'VALIDATION_ERROR' as const,
    errorMessage,
    inputArgs: {},
    schemaDescription: 'test',
  };
  return [
    { ...base, timestamp: '2026-05-16T10:00:00.000Z' },
    { ...base, timestamp: '2026-05-17T10:00:00.000Z' },
    { ...base, timestamp: '2026-05-18T10:00:00.000Z' },
  ];
}

/** Registry entry that yields SCHEMA_DRIFT (REQUIRED_MISMATCH): advertised marks 'mode' required, Zod
 *  marks it optional → REQUIRED_MISMATCH → deterministicClassification returns SCHEMA_DRIFT. */
const SCHEMA_DRIFT_ENTRY = {
  name: 'omnifocus_sd',
  getInputSchema: () => ({
    type: 'object',
    required: ['mode'],
    properties: { mode: { type: 'string' } },
  }),
  zodSchema: z.object({ mode: z.string().optional() }),
};

/** Registry entry that yields COERCION_MISSING (COERCION_GAP): advertised says number, Zod rejects '5'. */
const COERCION_MISSING_ENTRY = {
  name: 'omnifocus_cm',
  getInputSchema: () => ({ type: 'object', properties: { limit: { type: 'number' } } }),
  zodSchema: z.object({ limit: z.number() }),
};

it('does NOT invoke linearFiler when createIssues is false (default)', async () => {
  // NON-VACUOUS: the cluster would be SCHEMA_DRIFT-classified (the filer should handle it if wired),
  // but createIssues is not set, so the filer must never be called. Removing the createIssues
  // guard from runDiagnosis would cause this test to FAIL (filer would be called once).
  const filer = vi.fn().mockResolvedValue({ created: [], failed: [], capGuardTripped: false });
  const sink = vi.fn();
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'omn37-t15a-')), 'ledger.json');

  await runDiagnosis({
    records: makeRecords('omnifocus_sd', 'Required field mode is missing'),
    registry: [SCHEMA_DRIFT_ENTRY],
    ledgerPath,
    now: new Date('2026-05-18T12:00:00Z'),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc: sink,
    linearFiler: filer,
    // createIssues deliberately omitted (defaults to false)
  });

  expect(filer).not.toHaveBeenCalled();
  expect(sink).toHaveBeenCalledOnce();
});

it('handles createIssues=true with NO linearFiler (the standalone-CLI path) without throwing', async () => {
  // This is the exact state the standalone CLI puts runDiagnosis in: --create-issues was
  // passed (createIssues===true) but there is no linearFiler available in a plain Node
  // process (MCP graphql action is Claude-runtime-only). runDiagnosis MUST treat the
  // absent filer as a safe no-op: no throw, no filing attempt, triage doc still written.
  //
  // NON-VACUOUS: the records produce a real SCHEMA_DRIFT cluster (omnifocus_sd: advertised
  // 'mode' required vs Zod optional → REQUIRED_MISMATCH → SCHEMA_DRIFT). If runDiagnosis
  // were changed to assume/require a filer whenever createIssues is true (e.g.
  // `await linearFiler(...)` guarded only by `if (createIssues)`), this call would throw
  // "linearFiler is not a function" on that cluster and the assertions below would fail.
  // The SCHEMA_DRIFT cluster is what makes the filer-would-have-been-invoked path live.
  const sink = vi.fn();
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'omn37-t15d-')), 'ledger.json');

  await expect(
    runDiagnosis({
      records: makeRecords('omnifocus_sd', 'Required field mode is missing'),
      registry: [SCHEMA_DRIFT_ENTRY],
      ledgerPath,
      now: new Date('2026-05-18T12:00:00Z'),
      thresholds: { minOccurrences: 3, minSpanDays: 2 },
      writeTriageDoc: sink,
      createIssues: true,
      // linearFiler intentionally undefined — mirrors the standalone CLI runtime
    }),
  ).resolves.toBeUndefined();

  // Triage doc still written despite createIssues with no filer
  expect(sink).toHaveBeenCalledOnce();
  const md = sink.mock.calls[0][0] as string;
  // The SCHEMA_DRIFT row is present (proves a fileable cluster existed — non-vacuous),
  // and NO CAP_GUARD_TRIPPED row was appended (filer never ran, so no cap result).
  expect(md).toContain('SCHEMA_DRIFT');
  const dataSection = md.slice(0, md.indexOf('## Legend') >= 0 ? md.indexOf('## Legend') : md.length);
  expect(dataSection).not.toContain('CAP_GUARD_TRIPPED');
});

it('passes ONLY SCHEMA_DRIFT clusters to filer, writes returned issue ID to ledger', async () => {
  // NON-VACUOUS proof:
  // — If the class filter in runDiagnosis were removed, the filer would also receive the
  //   omnifocus_cm cluster (COERCION_MISSING), making createIssue called 2× instead of 1×.
  // — If ledger update for linearIssueId were missing, the ledger assertion would fail.
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'omn37-t15b-')), 'ledger.json');
  const sink = vi.fn();

  // Filer mock: inspect the clusters passed in and return a created entry using the REAL
  // fingerprint that runDiagnosis computes (so the ledger update can find it by key).
  const filer = vi.fn().mockImplementation((clusters: Array<{ fingerprint: string; classification: string }>) =>
    Promise.resolve({
      created: clusters
        .filter((c) => c.classification === 'SCHEMA_DRIFT')
        .slice(0, 1)
        .map((c) => ({ fingerprint: c.fingerprint, id: 'OMN-42' })),
      failed: [],
      capGuardTripped: false,
    }),
  );

  // We need to know what fingerprint runDiagnosis will assign to the omnifocus_sd cluster.
  // The fingerprint is derived from tool+normalizedError in clustering.ts. To keep the test
  // stable, we instead verify that the filer was called with exactly one cluster whose
  // classification is SCHEMA_DRIFT, and that the ledger records a linearIssueId matching
  // the fingerprint returned in the filer's created array.
  await runDiagnosis({
    records: [
      ...makeRecords('omnifocus_sd', 'Required field mode is missing'),
      ...makeRecords('omnifocus_cm', 'Expected number, received string'),
    ],
    registry: [SCHEMA_DRIFT_ENTRY, COERCION_MISSING_ENTRY],
    ledgerPath,
    now: new Date('2026-05-18T12:00:00Z'),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc: sink,
    linearFiler: filer,
    createIssues: true,
  });

  // Filer called exactly once
  expect(filer).toHaveBeenCalledTimes(1);
  // Only SCHEMA_DRIFT cluster passed to filer (not COERCION_MISSING)
  const [passedClusters] = filer.mock.calls[0] as [Array<{ classification: string }>];
  expect(passedClusters).toHaveLength(1);
  expect(passedClusters[0].classification).toBe('SCHEMA_DRIFT');

  // Ledger entry for the fingerprint returned by filer carries the issue ID
  const ledger = loadLedger(ledgerPath);
  const sdEntry = Object.values(ledger.entries).find((e) => e.linearIssueId === 'OMN-42');
  expect(sdEntry).toBeDefined();
  expect(sdEntry?.linearIssueId).toBe('OMN-42');
});

it('partial filer failure: still ledgers the success, appends a FILE_FAILED triage row', async () => {
  // Two distinct SCHEMA_DRIFT clusters. The filer "creates" the first and "fails" the second.
  //
  // NON-VACUOUS: the filer returns BOTH created:[1 entry] AND failed:[1 entry]. If runDiagnosis
  // skipped the ledger update whenever failed[] is non-empty (the silent-divergence bug this fix
  // prevents), the ledger assertion would find no linearIssueId → fail. If the FILE_FAILED append
  // were missing, the triage-doc assertion (data section, before the legend) would fail. The
  // success-fingerprint is taken from the clusters runDiagnosis actually passes, so it is a real
  // ledger key, not a hardcoded guess.
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'omn37-t15e-')), 'ledger.json');
  const sink = vi.fn();

  const SECOND_SD_ENTRY = {
    name: 'omnifocus_sd2',
    getInputSchema: () => ({ type: 'object', required: ['mode'], properties: { mode: { type: 'string' } } }),
    zodSchema: z.object({ mode: z.string().optional() }),
  };

  const filer = vi.fn().mockImplementation((clusters: Array<{ fingerprint: string; classification: string }>) => {
    const sd = clusters.filter((c) => c.classification === 'SCHEMA_DRIFT');
    return Promise.resolve({
      created: sd.slice(0, 1).map((c) => ({ fingerprint: c.fingerprint, id: 'OMN-77' })),
      failed: sd.slice(1, 2).map((c) => ({ fingerprint: c.fingerprint, error: 'Linear 503 unavailable' })),
      capGuardTripped: false,
    });
  });

  await runDiagnosis({
    records: [
      ...makeRecords('omnifocus_sd', 'Required field mode is missing'),
      ...makeRecords('omnifocus_sd2', 'Required field mode is missing'),
    ],
    registry: [SCHEMA_DRIFT_ENTRY, SECOND_SD_ENTRY],
    ledgerPath,
    now: new Date('2026-05-18T12:00:00Z'),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc: sink,
    linearFiler: filer,
    createIssues: true,
  });

  // The successfully-created issue id IS in the ledger despite a sibling failure
  const ledger = loadLedger(ledgerPath);
  const success = Object.values(ledger.entries).find((e) => e.linearIssueId === 'OMN-77');
  expect(success, 'success must be ledgered even when another cluster failed to file').toBeDefined();

  // A FILE_FAILED row is present in the data section (before the legend — not the legend entry)
  expect(sink).toHaveBeenCalledOnce();
  const md = sink.mock.calls[0][0] as string;
  const dataSection = md.slice(0, md.indexOf('## Legend') >= 0 ? md.indexOf('## Legend') : md.length);
  expect(dataSection, `expected a FILE_FAILED row in the data section of:\n${md}`).toContain('FILE_FAILED');
});

it('appends CAP_GUARD_TRIPPED row to triage doc when filer returns capGuardTripped', async () => {
  // NON-VACUOUS analysis:
  // The static legend in renderTriageDoc already contains a "| CAP_GUARD_TRIPPED | ..." line, so
  // checking for that line alone would be vacuously true even before any Phase-4 wiring.
  // To make this test bite, we verify:
  //   (a) the filer is called (fails if createIssues wiring is missing)
  //   (b) the triage doc data-section (everything before "## Legend") contains a CAP_GUARD_TRIPPED
  //       occurrence — that occurrence CANNOT come from the legend since we check before it.
  //
  // If the CAP_GUARD_TRIPPED-append logic is removed from runDiagnosis:
  //   — The filer IS still called (a passes), but the data section has no CAP_GUARD_TRIPPED line → (b) fails.
  // If the createIssues wiring is missing entirely:
  //   — The filer is never called → (a) fails immediately.
  const sink = vi.fn();
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'omn37-t15c-')), 'ledger.json');

  const filer = vi.fn().mockResolvedValue({ created: [], failed: [], capGuardTripped: true });

  await runDiagnosis({
    records: makeRecords('omnifocus_sd', 'Required field mode is missing'),
    registry: [SCHEMA_DRIFT_ENTRY],
    ledgerPath,
    now: new Date('2026-05-18T12:00:00Z'),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc: sink,
    linearFiler: filer,
    createIssues: true,
  });

  // (a) Filer must have been called — fails if wiring is absent
  expect(filer).toHaveBeenCalledOnce();

  expect(sink).toHaveBeenCalledOnce();
  const md = sink.mock.calls[0][0] as string;

  // (b) The data-section (before "## Legend") must contain CAP_GUARD_TRIPPED.
  //     The legend is AFTER this section, so any match here cannot be the legend.
  const dataSectionEnd = md.indexOf('## Legend');
  const dataSection = dataSectionEnd >= 0 ? md.slice(0, dataSectionEnd) : md;
  expect(dataSection, `expected CAP_GUARD_TRIPPED in the data table (before legend) of:\n${md}`).toContain(
    'CAP_GUARD_TRIPPED',
  );
});
