#!/usr/bin/env tsx
/**
 * Active suite-timing for the INTEGRATION suite (OMN-182).
 *
 * Runs the integration suite with the env-gated timing reporter, records one row to
 * docs/dev/SUITE_TIMING_LOG.md from the reporter's artifact, then prints a NON-BLOCKING drift
 * warning (baseline:check). This is the "make the logging active" entry point: it removes the
 * manual `--integration-wall <s> --integration-tests <n>` bookkeeping that left the log stagnant.
 *
 * The bare `test:integration` script stays pure (no row written) — only this target records, so
 * a verifying session's run never dirties the log.
 *
 * Usage:
 *   npm run baseline:integration                 # record + warn
 *   npm run baseline:integration -- --notes "x"  # custom note
 *   npm run baseline:integration -- --no-record  # just run with the reporter, skip recording
 *
 * Run it in the background per the integration-test norm (the suite is ~15 min vs live OmniFocus).
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const artifactPath = join(tmpdir(), `omn182-integration-${process.pid}.json`);
const notes = arg('notes') ?? 'baseline:integration';

// 1. Run the integration suite with the timing reporter attached. `npm run … --` forwards the
//    reporter flags to vitest; INTEGRATION_TIMING_JSON gates the reporter into writing-mode.
const suite = spawnSync(
  'npm',
  ['run', 'test:integration', '--', '--reporter=default', '--reporter=./tests/support/suite-timing-reporter.ts'],
  { stdio: 'inherit', env: { ...process.env, INTEGRATION_TIMING_JSON: artifactPath } },
);

if (!existsSync(artifactPath)) {
  process.stderr.write(
    'baseline:integration: no timing artifact written (suite likely errored before finishing) — nothing recorded.\n',
  );
  process.exit(suite.status ?? 1);
}

if (flag('no-record')) {
  process.stderr.write(`baseline:integration: --no-record set; artifact at ${artifactPath}, not recorded.\n`);
  process.exit(suite.status ?? 0);
}

// 2. Record the row from the artifact (authoritative wall + test count).
const record = spawnSync(
  'npx',
  ['tsx', 'scripts/record-suite-timing.ts', '--integration-json', artifactPath, '--notes', notes],
  { stdio: 'inherit' },
);
if (record.status !== 0) process.exit(record.status ?? 1);

// 3. Non-blocking drift warning: surface a regression but never fail the run on it.
const check = spawnSync('npx', ['tsx', 'scripts/check-suite-timing.ts'], { stdio: 'inherit' });
if (check.status === 1) {
  process.stderr.write('baseline:integration: drift detected above (warning only — not failing the run).\n');
}

// Exit reflects the SUITE result, not the drift check — a slow suite is signal, not a build break.
process.exit(suite.status ?? 0);
