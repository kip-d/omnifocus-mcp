/**
 * Suite-timing store (OMN-173 / OMN-182) — per-machine, append-only JSONL time-series.
 *
 * WHY per-machine (not a tracked file): this mirrors the of-mcp-redeploy cold-start log
 * (`$XDG_STATE_HOME/of-mcp-redeploy/`). The record answers "is THIS machine getting slower,
 * and was a slow run the machine being bogged down vs. genuinely more/slower tests?" — which
 * is inherently machine-local, not a repo artifact. Storing it outside git also means a row is
 * written on *every* integration run without ever dirtying a worktree. JSONL (one record per
 * line) is the natural shape: append-only, robust to partial writes, trivially machine-parseable.
 *
 * This module holds the pure logic (build a record, serialize/parse, env-normalized deviation)
 * plus thin impure helpers (capture env, resolve the log path, append). The vitest reporter
 * writes integration rows automatically; the conformance probe path writes conformance rows.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir, loadavg, cpus, freemem, totalmem, platform } from 'os';
import { dirname, join } from 'path';

// ── Conformance probe artifact (written by the probe via PROBE_TIMING_JSON) ─────────────

/** Per-model conformance result for one run. Elapsed/load are null when unmeasured. */
export interface ConformanceModel {
  model: string;
  scorePct: number | null;
  elapsedS: number | null;
  loadS: number | null;
}

/** The conformance timing artifact the probe writes when PROBE_TIMING_JSON is set. */
export interface ConformanceArtifact {
  schema: string;
  ollama: { startedByUs: boolean; startMs: number };
  totalWallMs: number;
  models: Array<{
    model: string;
    available: boolean;
    passed: number;
    cases: number;
    scorePct: number | null;
    elapsedMs: number | null;
    loadMs: number | null;
    caseExecMs: number | null;
  }>;
}

export const ARTIFACT_SCHEMA = 'omn-173-conformance-timing@1';

// ── The per-run record (one JSONL line) ─────────────────────────────────────────────────

/** Machine load snapshot at record time — lets a slow run be attributed to a busy machine. */
export interface EnvStatus {
  /** 1-minute load average. */
  loadAvg1: number;
  cpuCount: number;
  /** loadAvg1 / cpuCount — >1 means the machine was oversubscribed during the run. */
  loadPerCpu: number;
  /** System-wide memory in use, percent (macOS `memory_pressure`, else os free/total). */
  memUsedPct: number;
}

export interface RunRecord {
  /** ISO-8601 local timestamp. */
  ts: string;
  /** git rev-parse --short HEAD at record time. */
  build: string;
  suite: 'integration' | 'conformance';
  wallMs: number;
  /** Integration: tests that ran (pass+fail). null for conformance. */
  totalTests: number | null;
  /** Derived wall ÷ tests (ms), so "slower per test" is separable from "more tests". */
  perTestMs: number | null;
  env: EnvStatus;
  notes?: string;
  /** Conformance only: per-model breakdown. The total wall lives in the shared `wallMs`. */
  conformance?: ConformanceModel[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map a probe artifact into conformance model rows + the total wall (full-precision ms). */
export function conformanceFromArtifact(art: ConformanceArtifact): {
  conformance: ConformanceModel[];
  wallMs: number;
} {
  return {
    conformance: art.models.map((m) => ({
      model: m.model,
      scorePct: m.scorePct,
      elapsedS: m.elapsedMs === null ? null : round1(m.elapsedMs / 1000),
      loadS: m.loadMs === null ? null : round1(m.loadMs / 1000),
    })),
    wallMs: art.totalWallMs,
  };
}

export function buildIntegrationRecord(input: {
  build: string;
  ts: string;
  wallMs: number;
  totalTests: number | null;
  env: EnvStatus;
  notes?: string;
}): RunRecord {
  const { build, ts, wallMs, totalTests, env, notes } = input;
  const perTestMs = totalTests && totalTests > 0 ? Math.round(wallMs / totalTests) : null;
  return { ts, build, suite: 'integration', wallMs, totalTests, perTestMs, env, notes };
}

export function buildConformanceRecord(input: {
  build: string;
  ts: string;
  env: EnvStatus;
  conformance: ConformanceModel[];
  /** Total conformance wall (ms) — the canonical wall, shared with integration records. */
  wallMs: number;
  notes?: string;
}): RunRecord {
  const { build, ts, env, conformance, wallMs, notes } = input;
  return { ts, build, suite: 'conformance', wallMs, totalTests: null, perTestMs: null, env, conformance, notes };
}

// ── Serialize / parse (JSONL) ────────────────────────────────────────────────────────────

export function serializeRun(rec: RunRecord): string {
  return JSON.stringify(rec);
}

/** Parse an append-only JSONL log, oldest-first, skipping blank/garbage (partial-write) lines. */
export function parseRuns(text: string): RunRecord[] {
  const out: RunRecord[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as RunRecord);
    } catch {
      // tolerate a torn final line / hand-edits — a per-machine log is not a transaction store
    }
  }
  return out;
}

// ── Impure helpers: env capture, path resolution, append ─────────────────────────────────

function memUsedPctDarwin(): number | null {
  try {
    // Absolute path: a no-arg memory_pressure is a one-shot snapshot (~instant), but the absolute
    // path skips the PATH search AND keeps it working under a restricted PATH (e.g. launchd) where
    // it would otherwise vanish and silently fall back to the useless-on-macOS os.freemem estimate.
    // The 2s timeout is a safety net that never fires in practice.
    const out = execFileSync('/usr/bin/memory_pressure', [], { encoding: 'utf8', timeout: 2000 });
    const m = /System-wide memory free percentage:\s*(\d+)%/.exec(out);
    if (m) return 100 - parseInt(m[1], 10);
  } catch {
    // memory_pressure absent (non-macOS path, or removed) — fall through to the os-based estimate
  }
  return null;
}

/** Snapshot machine load. Best-effort: a probe that fails degrades to a sentinel, never throws. */
export function captureEnv(): EnvStatus {
  const cpuCount = cpus().length || 1;
  const loadAvg1 = round1(loadavg()[0] ?? 0);
  const loadPerCpu = round1(loadAvg1 / cpuCount);
  const memUsedPct =
    (platform() === 'darwin' ? memUsedPctDarwin() : null) ?? Math.round((1 - freemem() / totalmem()) * 100);
  return { loadAvg1, cpuCount, loadPerCpu, memUsedPct };
}

/** Short HEAD SHA for stamping a record's `build`. 'unknown' when git is unavailable. */
export function gitShort(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Resolve the per-machine log path. SUITE_TIMING_LOG_PATH overrides (used by tests). */
export function defaultLogPath(): string {
  const override = process.env.SUITE_TIMING_LOG_PATH;
  if (override) return override;
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return join(stateHome, 'of-mcp-suite-timing', 'runs.jsonl');
}

/** Append one record as a JSONL line, creating the directory on first write. */
export function appendRun(logPath: string, rec: RunRecord): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, serializeRun(rec) + '\n');
}

export function readRuns(logPath: string): RunRecord[] {
  if (!existsSync(logPath)) return [];
  return parseRuns(readFileSync(logPath, 'utf8'));
}

// ── Deviation check (newest vs rolling median of prior same-suite runs) ──────────────────

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface DeviationFinding {
  metric: string;
  latest: number;
  baseline: number;
  deltaPct: number;
}

export interface DeviationResult {
  ok: boolean;
  findings: DeviationFinding[];
  /** Metrics skipped for want of prior same-suite history. */
  skipped: string[];
  /** Env of the newest run, echoed so a flagged drift can be read as machine-bound. */
  latestEnv: EnvStatus | null;
}

/**
 * Flag metrics where the newest record deviates from the rolling median of the prior `window`
 * records OF THE SAME SUITE by more than `thresholdPct`. Records are oldest-first (file order).
 */
export function checkRecordDeviation(
  records: RunRecord[],
  opts: { thresholdPct?: number; window?: number } = {},
): DeviationResult {
  const thresholdPct = opts.thresholdPct ?? 25;
  const window = opts.window ?? 5;
  const findings: DeviationFinding[] = [];
  const skipped: string[] = [];
  if (records.length === 0) return { ok: true, findings, skipped, latestEnv: null };

  const latest = records[records.length - 1];
  const priorSameSuite = records
    .slice(0, -1)
    .filter((r) => r.suite === latest.suite)
    .slice(-window);

  const evaluate = (metric: string, latestVal: number | null, priorVals: (number | null)[]): void => {
    if (latestVal === null) return;
    const hist = priorVals.filter((v): v is number => v !== null && v > 0);
    if (hist.length === 0) {
      skipped.push(metric);
      return;
    }
    const baseline = median(hist);
    const deltaPct = baseline === 0 ? 0 : Math.round(((latestVal - baseline) / baseline) * 100);
    if (Math.abs(deltaPct) > thresholdPct) {
      findings.push({ metric, latest: latestVal, baseline: round1(baseline), deltaPct });
    }
  };

  // Wall is a single metric across suites — `wallMs` is the canonical wall on every record.
  evaluate(
    `${latest.suite}_wall_ms`,
    latest.wallMs,
    priorSameSuite.map((r) => r.wallMs),
  );

  if (latest.suite === 'integration') {
    evaluate(
      'integration_per_test_ms',
      latest.perTestMs,
      priorSameSuite.map((r) => r.perTestMs),
    );
  } else {
    for (const m of latest.conformance ?? []) {
      evaluate(
        `conformance_elapsed_s[${m.model}]`,
        m.elapsedS,
        priorSameSuite.map((r) => r.conformance?.find((x) => x.model === m.model)?.elapsedS ?? null),
      );
    }
  }

  return { ok: findings.length === 0, findings, skipped, latestEnv: latest.env };
}
