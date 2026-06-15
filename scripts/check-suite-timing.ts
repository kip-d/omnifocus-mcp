#!/usr/bin/env tsx
/**
 * Check the newest suite-timing run against the rolling baseline (OMN-173 / OMN-182).
 *
 * Reads the per-machine JSONL log ($XDG_STATE_HOME/of-mcp-suite-timing/runs.jsonl), compares the
 * newest run's metrics (integration wall + per-test, or conformance total + per-model elapsed) to
 * the median of the prior N runs OF THE SAME SUITE, and exits non-zero if any metric deviates
 * beyond the threshold. Echoes the newest run's machine load so a flagged regression can be read
 * as "the box was busy" vs. a genuine slowdown.
 *
 * Usage:
 *   npm run baseline:check
 *   npx tsx scripts/check-suite-timing.ts --threshold 25 --window 5 --log <path>
 *
 * Exit codes: 0 = within tolerance (or insufficient history), 1 = a metric exceeded threshold.
 */

import { checkRecordDeviation, defaultLogPath, readRuns } from './lib/suite-timing.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const logPath = arg('log') ?? defaultLogPath();
  const thresholdPct = arg('threshold') ? Number(arg('threshold')) : 25;
  const window = arg('window') ? Number(arg('window')) : 5;

  // Guard NaN explicitly: a bad `--threshold abc` would make every `> NaN` comparison false
  // (silently passing real regressions), and a bad `--window abc` would empty the baseline
  // (silently skipping everything). Either way the check would falsely go green — fail loud.
  if (!Number.isFinite(thresholdPct) || thresholdPct < 0) {
    process.stderr.write('check-suite-timing: --threshold must be a non-negative number (percent)\n');
    process.exit(2);
  }
  if (!Number.isFinite(window) || window < 1) {
    process.stderr.write('check-suite-timing: --window must be a positive integer (rows)\n');
    process.exit(2);
  }

  const records = readRuns(logPath);
  if (records.length === 0) {
    process.stdout.write(`No recorded runs yet at ${logPath} — nothing to check.\n`);
    return;
  }

  const latest = records[records.length - 1];
  const result = checkRecordDeviation(records, { thresholdPct, window });
  const env = result.latestEnv;
  const envNote = env ? `load/cpu ${env.loadPerCpu}, mem ${env.memUsedPct}% used` : 'env n/a';
  process.stdout.write(
    `Newest ${latest.suite} run (${latest.ts} ${latest.build}) vs prior ${window} same-suite, ±${thresholdPct}% — ${envNote}\n`,
  );

  if (result.skipped.length) {
    process.stdout.write(`  (no baseline yet for: ${result.skipped.join(', ')})\n`);
  }

  if (result.ok) {
    process.stdout.write('✅ All measured metrics within tolerance.\n');
    return;
  }

  process.stderr.write('🚨 Suite-timing regression(s):\n');
  for (const f of result.findings) {
    const dir = f.deltaPct > 0 ? 'slower' : 'faster';
    process.stderr.write(
      `  - ${f.metric}: ${f.latest} vs baseline ${f.baseline} (${f.deltaPct > 0 ? '+' : ''}${f.deltaPct}%, ${dir})\n`,
    );
  }
  if (env && env.loadPerCpu > 0.7) {
    process.stderr.write(
      `  note: machine load was high (load/cpu ${env.loadPerCpu}) — the slowdown may be contention, not the suite.\n`,
    );
  }
  process.exit(1);
}

main();
