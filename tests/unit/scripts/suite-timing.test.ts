import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_SCHEMA,
  conformanceFromArtifact,
  median,
  buildIntegrationRecord,
  buildConformanceRecord,
  serializeRun,
  parseRuns,
  checkRecordDeviation,
  type EnvStatus,
  type RunRecord,
  type ConformanceArtifact,
} from '../../../scripts/lib/suite-timing.js';

const env = (loadPerCpu = 0.25, memUsedPct = 40): EnvStatus => ({
  loadAvg1: loadPerCpu * 24,
  cpuCount: 24,
  loadPerCpu,
  memUsedPct,
});

function intRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return buildIntegrationRecord({
    build: 'abc1234',
    ts: '2026-06-14T16:00:00-04:00',
    wallMs: 1_291_000,
    totalTests: 166,
    env: env(),
    ...overrides,
  });
}

describe('buildIntegrationRecord', () => {
  it('tags suite=integration and derives perTestMs from wall ÷ tests', () => {
    const r = intRecord({ wallMs: 1_660_000, totalTests: 166 });
    expect(r.suite).toBe('integration');
    expect(r.perTestMs).toBe(10000); // 1_660_000 / 166
    expect(r.wallMs).toBe(1_660_000);
    expect(r.totalTests).toBe(166);
  });

  it('leaves perTestMs null when the test count is zero or missing (no divide-by-zero)', () => {
    expect(intRecord({ totalTests: 0 }).perTestMs).toBeNull();
    expect(
      buildIntegrationRecord({ build: 'b', ts: 't', wallMs: 5, totalTests: null, env: env() }).perTestMs,
    ).toBeNull();
  });

  it('carries the captured environment status through verbatim', () => {
    const r = intRecord({ env: env(0.75, 88) });
    expect(r.env).toEqual({ loadAvg1: 18, cpuCount: 24, loadPerCpu: 0.75, memUsedPct: 88 });
  });
});

describe('buildConformanceRecord', () => {
  it('tags suite=conformance and carries the model breakdown + total', () => {
    const r = buildConformanceRecord({
      build: 'abc1234',
      ts: '2026-06-14T16:00:00-04:00',
      env: env(),
      conformance: [{ model: 'llama3.1:8b', scorePct: 100, elapsedS: 16, loadS: 2 }],
      conformanceTotalS: 45.2,
    });
    expect(r.suite).toBe('conformance');
    expect(r.conformanceTotalS).toBe(45.2);
    expect(r.conformance?.[0].model).toBe('llama3.1:8b');
    expect(r.totalTests).toBeNull();
    expect(r.perTestMs).toBeNull();
  });
});

describe('serializeRun / parseRuns round-trip (JSONL store)', () => {
  it('round-trips a record through one JSONL line', () => {
    const r = intRecord();
    expect(parseRuns(serializeRun(r))).toEqual([r]);
  });

  it('parses an append-only multi-line log oldest-first and skips blank/garbage lines', () => {
    const a = intRecord({ ts: '2026-06-14T10:00:00-04:00', wallMs: 1_200_000 });
    const b = intRecord({ ts: '2026-06-14T12:00:00-04:00', wallMs: 1_300_000 });
    const log = `${serializeRun(a)}\n\nnot json — partial write\n${serializeRun(b)}\n`;
    const parsed = parseRuns(log);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].ts).toBe('2026-06-14T10:00:00-04:00');
    expect(parsed[1].ts).toBe('2026-06-14T12:00:00-04:00');
  });

  it('returns [] for an empty log', () => {
    expect(parseRuns('')).toEqual([]);
  });
});

describe('median', () => {
  it('averages the two middle values for an even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
  it('takes the middle value for an odd count', () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe('checkRecordDeviation (newest vs rolling median, per suite)', () => {
  const baseline = (walls: number[]): RunRecord[] =>
    walls.map((w, i) => intRecord({ ts: `2026-06-13T0${i}:00:00-04:00`, wallMs: w, totalTests: 166 }));

  it('flags an integration wall regression beyond the threshold', () => {
    const records = [...baseline([1_290_000, 1_300_000, 1_280_000]), intRecord({ wallMs: 1_900_000 })];
    const res = checkRecordDeviation(records, { thresholdPct: 25 });
    expect(res.ok).toBe(false);
    expect(res.findings.some((f) => f.metric === 'integration_wall_ms')).toBe(true);
  });

  it('stays green when the newest run is within tolerance', () => {
    const records = [...baseline([1_290_000, 1_300_000, 1_280_000]), intRecord({ wallMs: 1_310_000 })];
    expect(checkRecordDeviation(records, { thresholdPct: 25 }).ok).toBe(true);
  });

  it('flags a faster outlier too (signed delta, abs threshold)', () => {
    // A suite that suddenly runs much faster (e.g. tests silently dropped) is also a regression.
    const records = [...baseline([1_290_000, 1_300_000, 1_280_000]), intRecord({ wallMs: 700_000 })];
    const res = checkRecordDeviation(records, { thresholdPct: 25 });
    expect(res.ok).toBe(false);
    expect(res.findings.find((f) => f.metric === 'integration_wall_ms')?.deltaPct).toBeLessThan(0);
  });

  it('only baselines against prior runs of the SAME suite', () => {
    const conf = buildConformanceRecord({
      build: 'x',
      ts: '2026-06-13T00:00:00-04:00',
      env: env(),
      conformance: [],
      conformanceTotalS: 45,
    });
    // A lone integration run with only a conformance run before it has no integration baseline.
    const res = checkRecordDeviation([conf, intRecord({ wallMs: 9_000_000 })], { thresholdPct: 25 });
    expect(res.ok).toBe(true);
    expect(res.skipped).toContain('integration_wall_ms');
  });

  it('skips metrics with no prior history rather than failing', () => {
    const res = checkRecordDeviation([intRecord()], { thresholdPct: 25 });
    expect(res.ok).toBe(true);
    expect(res.skipped).toContain('integration_wall_ms');
  });

  it('surfaces the latest run env on the result so drift can be read as machine-bound', () => {
    const records = [
      ...baseline([1_290_000, 1_300_000, 1_280_000]),
      intRecord({ wallMs: 1_900_000, env: env(0.95, 80) }),
    ];
    const res = checkRecordDeviation(records, { thresholdPct: 25 });
    expect(res.latestEnv?.loadPerCpu).toBe(0.95);
  });
});

describe('conformanceFromArtifact (probe artifact → model rows, unchanged)', () => {
  it('maps ms to seconds and keeps the stable schema tag', () => {
    const art: ConformanceArtifact = {
      schema: ARTIFACT_SCHEMA,
      ollama: { startedByUs: true, startMs: 100 },
      totalWallMs: 45_200,
      models: [
        {
          model: 'llama3.1:8b',
          available: true,
          passed: 19,
          cases: 19,
          scorePct: 100,
          elapsedMs: 16_000,
          loadMs: 2_000,
          caseExecMs: 14_000,
        },
      ],
    };
    const { conformance, conformanceTotalS } = conformanceFromArtifact(art);
    expect(conformanceTotalS).toBe(45.2);
    expect(conformance[0]).toEqual({ model: 'llama3.1:8b', scorePct: 100, elapsedS: 16, loadS: 2 });
  });
});
