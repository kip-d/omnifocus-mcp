import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_SCHEMA,
  TABLE_HEADER,
  TABLE_SEPARATOR,
  formatConformanceCell,
  parseConformanceCell,
  renderRow,
  insertRow,
  parseRows,
  conformanceFromArtifact,
  checkDeviation,
  type RunRow,
  type ConformanceArtifact,
} from '../../../scripts/lib/suite-timing.js';

const emptyLog = `# Suite Timing Log\n\n${TABLE_HEADER}\n${TABLE_SEPARATOR}\n`;

function row(overrides: Partial<RunRow> = {}): RunRow {
  return {
    date: '2026-06-13',
    build: 'abc1234',
    integrationWallS: 529,
    integrationTests: 159,
    conformance: [{ model: 'llama3.1:8b', scorePct: 100, elapsedS: 31.2, loadS: 8.1 }],
    conformanceTotalS: 55,
    notes: '',
    ...overrides,
  };
}

describe('formatConformanceCell / parseConformanceCell round-trip', () => {
  it('round-trips a measured multi-model run', () => {
    const models = [
      { model: 'llama3.1:8b', scorePct: 100, elapsedS: 31.2, loadS: 8.1 },
      { model: 'qwen2.5:7b', scorePct: 84, elapsedS: 41.8, loadS: 7.0 },
    ];
    const parsed = parseConformanceCell(formatConformanceCell(models));
    expect(parsed).toEqual(models);
  });

  it('round-trips a pre-instrumentation seed (elapsed/load unknown)', () => {
    const models = [{ model: 'llama3.1:8b', scorePct: 100, elapsedS: null, loadS: null }];
    const parsed = parseConformanceCell(formatConformanceCell(models));
    expect(parsed).toEqual(models);
  });

  it('treats the em-dash sentinel as no models', () => {
    expect(parseConformanceCell('—')).toEqual([]);
    expect(formatConformanceCell([])).toBe('—');
  });
});

describe('renderRow', () => {
  it('renders a single pipe-delimited line with the right cell count', () => {
    const line = renderRow(row());
    // 7 columns → 8 pipes
    expect(line.match(/\|/g)?.length).toBe(8);
    expect(line).toContain('2026-06-13');
    expect(line).toContain('529s');
    expect(line).toContain('llama3.1:8b 100% 31.2s/8.1s');
  });

  it('renders "—" for absent suites', () => {
    const line = renderRow(
      row({ integrationWallS: null, integrationTests: null, conformance: [], conformanceTotalS: null }),
    );
    expect(line).toContain('| — |');
  });

  it('never lets a note break the table (pipes are replaced)', () => {
    const line = renderRow(row({ notes: 'has | a | pipe' }));
    // exactly the 8 structural pipes, none from the note
    expect(line.match(/\|/g)?.length).toBe(8);
    expect(line).toContain('has / a / pipe');
  });
});

describe('insertRow', () => {
  it('inserts newest-first directly under the separator', () => {
    const withOne = insertRow(emptyLog, row({ date: '2026-06-13', build: 'old' }));
    const withTwo = insertRow(withOne, row({ date: '2026-06-14', build: 'new' }));
    const rows = parseRows(withTwo);
    expect(rows.map((r) => r.build)).toEqual(['new', 'old']);
  });

  it('throws when the table separator is missing', () => {
    expect(() => insertRow('# no table here\n', row())).toThrow(/separator/);
  });
});

describe('parseRows round-trip', () => {
  it('parses back what renderRow wrote', () => {
    const original = row({
      conformance: [
        { model: 'llama3.1:8b', scorePct: 100, elapsedS: 31.2, loadS: 8.1 },
        { model: 'qwen2.5:7b', scorePct: 84, elapsedS: 41.8, loadS: 7.0 },
      ],
      notes: 'post-merge baseline',
    });
    const parsed = parseRows(insertRow(emptyLog, original));
    expect(parsed).toEqual([original]);
  });

  it('skips the header and separator lines', () => {
    expect(parseRows(emptyLog)).toEqual([]);
  });
});

describe('conformanceFromArtifact', () => {
  it('converts ms→s with one decimal and carries scores', () => {
    const art: ConformanceArtifact = {
      schema: ARTIFACT_SCHEMA,
      ollama: { startedByUs: true, startMs: 2000 },
      totalWallMs: 55400,
      models: [
        {
          model: 'llama3.1:8b',
          available: true,
          passed: 19,
          cases: 19,
          scorePct: 100,
          elapsedMs: 31234,
          loadMs: 8120,
          caseExecMs: 23114,
        },
      ],
    };
    const out = conformanceFromArtifact(art);
    expect(out.conformanceTotalS).toBe(55.4);
    expect(out.conformance[0]).toEqual({ model: 'llama3.1:8b', scorePct: 100, elapsedS: 31.2, loadS: 8.1 });
  });

  it('passes through nulls for an unavailable model', () => {
    const art: ConformanceArtifact = {
      schema: ARTIFACT_SCHEMA,
      ollama: { startedByUs: false, startMs: 0 },
      totalWallMs: 1000,
      models: [
        {
          model: 'ghost:7b',
          available: false,
          passed: 0,
          cases: 19,
          scorePct: null,
          elapsedMs: null,
          loadMs: null,
          caseExecMs: null,
        },
      ],
    };
    expect(conformanceFromArtifact(art).conformance[0]).toEqual({
      model: 'ghost:7b',
      scorePct: null,
      elapsedS: null,
      loadS: null,
    });
  });
});

describe('checkDeviation', () => {
  const baselineRows = (vals: number[]): RunRow[] =>
    vals.map((v, i) =>
      row({ date: `2026-06-${10 + i}`, integrationWallS: v, conformance: [], conformanceTotalS: null }),
    );

  it('passes when the newest is within tolerance of the prior median', () => {
    // newest 540, prior median 530 → +1.9%
    const rows = [
      row({ integrationWallS: 540, conformance: [], conformanceTotalS: null }),
      ...baselineRows([530, 520, 540]),
    ];
    const res = checkDeviation(rows, { thresholdPct: 25 });
    expect(res.ok).toBe(true);
    expect(res.findings).toEqual([]);
  });

  it('flags a slow regression beyond threshold', () => {
    // newest 800, prior median 530 → +51%
    const rows = [
      row({ integrationWallS: 800, conformance: [], conformanceTotalS: null }),
      ...baselineRows([530, 520, 540]),
    ];
    const res = checkDeviation(rows, { thresholdPct: 25 });
    expect(res.ok).toBe(false);
    expect(res.findings[0]).toMatchObject({ metric: 'integration_wall_s', latest: 800, deltaPct: 51 });
  });

  it('flags a faster outlier too (signed delta)', () => {
    const rows = [
      row({ integrationWallS: 300, conformance: [], conformanceTotalS: null }),
      ...baselineRows([530, 520, 540]),
    ];
    const res = checkDeviation(rows, { thresholdPct: 25 });
    expect(res.ok).toBe(false);
    expect(res.findings[0].deltaPct).toBeLessThan(0);
  });

  it('skips metrics with no prior history rather than failing', () => {
    const res = checkDeviation([row()], { thresholdPct: 25 });
    expect(res.ok).toBe(true);
    expect(res.skipped).toContain('integration_wall_s');
  });

  it('keys per-model conformance elapsed independently', () => {
    const mk = (llamaElapsed: number): RunRow =>
      row({
        integrationWallS: null,
        conformance: [{ model: 'llama3.1:8b', scorePct: 100, elapsedS: llamaElapsed, loadS: 8 }],
        conformanceTotalS: null,
      });
    const rows = [mk(60), mk(31), mk(30), mk(32)]; // newest 60 vs median 31 → +94%
    const res = checkDeviation(rows, { thresholdPct: 25 });
    expect(res.findings.some((f) => f.metric === 'conformance_elapsed_s[llama3.1:8b]')).toBe(true);
  });

  it('does not compare a suite that was not run this time (null latest)', () => {
    const rows = [
      row({ integrationWallS: null, conformance: [], conformanceTotalS: null }),
      ...baselineRows([530, 520, 540]),
    ];
    const res = checkDeviation(rows, { thresholdPct: 25 });
    expect(res.ok).toBe(true);
    expect(res.findings).toEqual([]);
  });
});
