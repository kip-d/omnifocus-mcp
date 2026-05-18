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
});
