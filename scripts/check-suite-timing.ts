#!/usr/bin/env tsx
/**
 * Check the newest suite-timing row against the rolling baseline (OMN-173).
 *
 * Reads docs/dev/SUITE_TIMING_LOG.md, compares the newest row's metrics (integration wall,
 * conformance total, per-model conformance elapsed) to the median of the prior N rows, and
 * exits non-zero if any metric deviates by more than the threshold. This turns "is the suite
 * getting slower as it grows" from a memory question into a CI-gateable diff.
 *
 * Usage:
 *   npm run baseline:check
 *   npx tsx scripts/check-suite-timing.ts --threshold 25 --window 5 --log docs/dev/SUITE_TIMING_LOG.md
 *
 * Exit codes: 0 = within tolerance (or insufficient history), 1 = a metric exceeded threshold.
 */

import { readFileSync, existsSync } from 'fs';
import { parseRows, checkDeviation } from './lib/suite-timing.js';

const DEFAULT_LOG = 'docs/dev/SUITE_TIMING_LOG.md';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const logPath = arg('log') ?? DEFAULT_LOG;
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

  if (!existsSync(logPath)) {
    process.stderr.write(`check-suite-timing: log not found: ${logPath}\n`);
    process.exit(2);
  }

  const rows = parseRows(readFileSync(logPath, 'utf8'));
  if (rows.length === 0) {
    process.stdout.write('No recorded rows yet — nothing to check.\n');
    return;
  }

  const result = checkDeviation(rows, { thresholdPct, window });
  const latest = rows[0];
  process.stdout.write(
    `Checking newest row (${latest.date} ${latest.build}) vs prior ${window}, threshold ±${thresholdPct}%\n`,
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
  process.exit(1);
}

main();
