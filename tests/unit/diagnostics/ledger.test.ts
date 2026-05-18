// tests/unit/diagnostics/ledger.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadLedger, recordDiagnosis, isKnown } from '../../../src/diagnostics/ledger.js';

describe('seen-patterns ledger', () => {
  it('round-trips and recognizes a known fingerprint', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'omn37led-')), 'diagnosed-patterns.json');
    let ledger = loadLedger(path); // missing file → empty
    expect(isKnown(ledger, 'fp1')).toBe(false);
    ledger = recordDiagnosis(ledger, path, {
      fingerprint: 'fp1',
      classification: 'SCHEMA_DRIFT',
      linearIssueId: 'OMN-99',
    });
    expect(isKnown(loadLedger(path), 'fp1')).toBe(true);
    expect(loadLedger(path).entries['fp1'].linearIssueId).toBe('OMN-99');
  });

  it('preserves the original diagnosedAt across a later update (linearIssueId attach)', () => {
    // diagnosedAt = "when first diagnosed"; a subsequent update (e.g. attaching a
    // linearIssueId after auto-filing) must NOT reset it to the update-run time.
    // NON-VACUOUS: the second recordDiagnosis is called with a LATER `now`. Under the old
    // unconditional `diagnosedAt: now.toISOString()` behavior this assertion fails (the
    // timestamp would advance to the second `now`); it only holds because recordDiagnosis
    // now honors an already-present diagnosedAt.
    const path = join(mkdtempSync(join(tmpdir(), 'omn37led2-')), 'diagnosed-patterns.json');
    const firstNow = new Date('2026-05-10T08:00:00.000Z');
    const laterNow = new Date('2026-05-18T17:30:00.000Z');

    let ledger = recordDiagnosis(
      loadLedger(path),
      path,
      { fingerprint: 'fpX', classification: 'SCHEMA_DRIFT' },
      firstNow,
    );
    const firstStamp = loadLedger(path).entries['fpX'].diagnosedAt;
    expect(firstStamp).toBe(firstNow.toISOString());

    // Simulate the Phase-4 update path: spread the existing entry (carries diagnosedAt) + add issue id.
    const existing = ledger.entries['fpX'];
    ledger = recordDiagnosis(ledger, path, { ...existing, linearIssueId: 'OMN-77' }, laterNow);

    const updated = loadLedger(path).entries['fpX'];
    expect(updated.linearIssueId).toBe('OMN-77'); // update applied
    expect(updated.diagnosedAt).toBe(firstStamp); // ...but original timestamp preserved
    expect(updated.diagnosedAt).not.toBe(laterNow.toISOString());
  });
});
