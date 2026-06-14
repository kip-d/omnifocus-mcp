/**
 * Suite-timing baseline (OMN-173) — pure row/parse/deviation logic.
 *
 * The canonical store is a tracked Markdown table (docs/dev/SUITE_TIMING_LOG.md), one row
 * per recorded run, newest first. A Markdown table was chosen over JSONL on purpose: the
 * ticket's framing is "drift is a diff, not a memory", and a table makes every regression a
 * readable git diff while staying machine-parseable (fixed columns, no pipes inside cells).
 *
 * This module holds the side-effect-free logic (build a row, render it, insert it, parse the
 * table back, flag deviation) so it can be unit-tested without running Ollama or the suite.
 * The CLIs (record-suite-timing.ts, check-suite-timing.ts) are thin wrappers over it.
 */

/** Per-model conformance result for one run. Elapsed/load are null when unmeasured (e.g. a pre-instrumentation seed). */
export interface ConformanceModel {
  model: string;
  scorePct: number | null;
  elapsedS: number | null;
  loadS: number | null;
}

/** One recorded run. Any suite not run in a given invocation is null (rendered "—"). */
export interface RunRow {
  date: string;
  build: string;
  integrationWallS: number | null;
  integrationTests: number | null;
  conformance: ConformanceModel[];
  conformanceTotalS: number | null;
  notes: string;
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

/** The integration timing artifact the vitest reporter writes when INTEGRATION_TIMING_JSON is set (OMN-182). */
export interface IntegrationArtifact {
  schema: string;
  wallMs: number;
  totalTests: number;
}

export const INTEGRATION_ARTIFACT_SCHEMA = 'omn-182-integration-timing@1';

export const TABLE_HEADER =
  '| Date | Build | Integration wall | Tests | Conformance (model score elapsed/load) | Conf total | Notes |';
export const TABLE_SEPARATOR =
  '|------|-------|------------------|-------|----------------------------------------|-----------|-------|';

const SENTINEL = '—';

function num(v: number | null, suffix = ''): string {
  return v === null ? SENTINEL : `${v}${suffix}`;
}

/** One decimal for sub-minute seconds; markdown cells must never contain a literal `|`. */
function sec1(v: number | null): string {
  return v === null ? 'n/a' : `${v.toFixed(1)}s`;
}

/** Render the conformance cell: `llama3.1:8b 100% 31.2s/8.1s; qwen2.5:7b 84% 41.8s/7.0s`. */
export function formatConformanceCell(models: ConformanceModel[]): string {
  if (models.length === 0) return SENTINEL;
  return models
    .map((m) => {
      const score = m.scorePct === null ? 'n/a' : `${m.scorePct}%`;
      const elapsed = m.elapsedS === null && m.loadS === null ? 'n/a' : `${sec1(m.elapsedS)}/${sec1(m.loadS)}`;
      return `${m.model} ${score} ${elapsed}`;
    })
    .join('; ');
}

/** Parse the conformance cell back into models. Tolerates the `n/a` placeholders. */
export function parseConformanceCell(cell: string): ConformanceModel[] {
  const trimmed = cell.trim();
  if (trimmed === SENTINEL || trimmed === '') return [];
  return trimmed
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      // model  score%|n/a  elapsed/load. `\S+` then literal-space backtracks linearly, and
      // the input is our own fixed-format table cell (not external/adversarial), so slow-regex
      // does not apply here.
      // eslint-disable-next-line sonarjs/slow-regex -- bounded, non-adversarial input (see above)
      const m = /^(\S+) +(\d+%|n\/a) +(.+)$/.exec(entry);
      if (!m) return { model: entry, scorePct: null, elapsedS: null, loadS: null };
      const [, model, scoreTok, timeTok] = m;
      const scorePct = scoreTok === 'n/a' ? null : parseInt(scoreTok, 10);
      let elapsedS: number | null = null;
      let loadS: number | null = null;
      if (timeTok !== 'n/a') {
        const [eTok, lTok] = timeTok.split('/');
        elapsedS = parseSecTok(eTok);
        loadS = parseSecTok(lTok);
      }
      return { model, scorePct, elapsedS, loadS };
    });
}

function parseSecTok(tok: string | undefined): number | null {
  if (!tok) return null;
  const t = tok.trim();
  if (t === 'n/a') return null;
  const n = parseFloat(t.replace(/s$/, ''));
  return Number.isFinite(n) ? n : null;
}

/** Render a row as one Markdown table line. Cells are guaranteed pipe-free. */
export function renderRow(row: RunRow): string {
  const cells = [
    row.date,
    row.build,
    num(row.integrationWallS, 's'),
    num(row.integrationTests),
    formatConformanceCell(row.conformance),
    num(row.conformanceTotalS, 's'),
    row.notes.replace(/\|/g, '/').trim() || SENTINEL,
  ];
  return `| ${cells.join(' | ')} |`;
}

/** Insert a new row immediately under the table separator (newest first). Throws if the table is absent. */
export function insertRow(markdown: string, row: RunRow): string {
  const lines = markdown.split('\n');
  const sepIdx = lines.findIndex((l) => l.replace(/\s/g, '').startsWith('|---'));
  if (sepIdx === -1) {
    throw new Error('suite-timing log has no Markdown table separator (|---…) — cannot insert a row');
  }
  lines.splice(sepIdx + 1, 0, renderRow(row));
  return lines.join('\n');
}

/** Parse all data rows from the log (skips the header + separator). */
export function parseRows(markdown: string): RunRow[] {
  const lines = markdown.split('\n');
  const rows: RunRow[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    if (t.replace(/\s/g, '').startsWith('|---')) continue;
    const cells = splitCells(t);
    // header row
    if (cells[0] === 'Date') continue;
    if (cells.length < 7) continue;
    rows.push({
      date: cells[0],
      build: cells[1],
      integrationWallS: parseSecTok(cells[2] === SENTINEL ? undefined : cells[2]),
      integrationTests: cells[3] === SENTINEL ? null : intOrNull(cells[3]),
      conformance: parseConformanceCell(cells[4]),
      conformanceTotalS: parseSecTok(cells[5] === SENTINEL ? undefined : cells[5]),
      notes: cells[6] === SENTINEL ? '' : cells[6],
    });
  }
  return rows;
}

function intOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function splitCells(line: string): string[] {
  // Strip the leading/trailing pipe, then split. Cells never contain `|` by construction.
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Map a probe artifact into the conformance half of a row. */
export function conformanceFromArtifact(art: ConformanceArtifact): {
  conformance: ConformanceModel[];
  conformanceTotalS: number;
} {
  return {
    conformance: art.models.map((m) => ({
      model: m.model,
      scorePct: m.scorePct,
      elapsedS: m.elapsedMs === null ? null : round1(m.elapsedMs / 1000),
      loadS: m.loadMs === null ? null : round1(m.loadMs / 1000),
    })),
    conformanceTotalS: round1(art.totalWallMs / 1000),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map an integration timing artifact into the integration half of a row (whole-second wall). */
export function integrationFromArtifact(art: IntegrationArtifact): {
  integrationWallS: number;
  integrationTests: number;
} {
  return {
    integrationWallS: Math.round(art.wallMs / 1000),
    integrationTests: art.totalTests,
  };
}

// ── Deviation check ───────────────────────────────────────────────────────────

export interface DeviationFinding {
  metric: string;
  latest: number;
  baseline: number;
  deltaPct: number;
}

export interface DeviationResult {
  ok: boolean;
  findings: DeviationFinding[];
  /** Metrics skipped because there was no prior history to baseline against. */
  skipped: string[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Flag metrics where the newest row deviates from the rolling median of the prior `window`
 * rows by more than `thresholdPct`. Rows are newest-first (as stored). A metric with no
 * prior data points is reported as skipped, not failed — a baseline needs history.
 */
export function checkDeviation(rows: RunRow[], opts: { thresholdPct?: number; window?: number } = {}): DeviationResult {
  const thresholdPct = opts.thresholdPct ?? 25;
  const window = opts.window ?? 5;
  const findings: DeviationFinding[] = [];
  const skipped: string[] = [];
  if (rows.length === 0) return { ok: true, findings, skipped };

  const latest = rows[0];
  const prior = rows.slice(1, 1 + window);

  const evaluate = (metric: string, latestVal: number | null, priorVals: (number | null)[]): void => {
    if (latestVal === null) return; // suite not run this time — nothing to compare
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

  evaluate(
    'integration_wall_s',
    latest.integrationWallS,
    prior.map((r) => r.integrationWallS),
  );
  evaluate(
    'conformance_total_s',
    latest.conformanceTotalS,
    prior.map((r) => r.conformanceTotalS),
  );

  // Per-model conformance elapsed, keyed by model name.
  for (const m of latest.conformance) {
    evaluate(
      `conformance_elapsed_s[${m.model}]`,
      m.elapsedS,
      prior.map((r) => r.conformance.find((x) => x.model === m.model)?.elapsedS ?? null),
    );
  }

  return { ok: findings.length === 0, findings, skipped };
}
