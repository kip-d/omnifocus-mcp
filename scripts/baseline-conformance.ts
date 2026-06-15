#!/usr/bin/env tsx
/**
 * Active suite-timing for the CONFORMANCE probe (OMN-182).
 *
 * Runs the conformance probe with timing instrumentation, appends one conformance record to the
 * per-machine JSONL log ($XDG_STATE_HOME/of-mcp-suite-timing/runs.jsonl) from the probe's artifact,
 * then prints a NON-BLOCKING drift warning (baseline:check). Removes the manual `--conformance-json`
 * bookkeeping step.
 *
 * Default models mirror the recorded baselines (llama3.1:8b, qwen2.5:7b); override by passing
 * model names. The probe owns the Ollama lifecycle (auto start/stop, unload) — OMN-163.
 *
 * Usage:
 *   npm run baseline:conformance                          # default models, record + warn
 *   npm run baseline:conformance -- qwen2.5:7b            # one model
 *   npm run baseline:conformance -- --notes "post-merge"  # custom note
 *
 * NOTE (OMN-178): do NOT run this concurrently with baseline:integration — a parallel run
 * times out the probe's MCP initialize (single-OmniFocus AppleEvent serialization). Run serially.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const DEFAULT_MODELS = ['llama3.1:8b', 'qwen2.5:7b'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// Positional (non-flag) args are model names; a `--notes "x"` value must not be misread as a model.
const notesVal = arg('notes');
const positional = process.argv.slice(2).filter((a, i, all) => {
  if (a.startsWith('-')) return false;
  if (i > 0 && all[i - 1] === '--notes') return false;
  return true;
});
const models = positional.length ? positional : DEFAULT_MODELS;
const notes = notesVal ?? 'baseline:conformance';

const artifactPath = join(tmpdir(), `omn182-conformance-${process.pid}.json`);

// 1. Run the probe (builds first, owns Ollama). PROBE_TIMING_JSON makes it emit the artifact.
const probe = spawnSync('npm', ['run', 'conformance', '--', ...models], {
  stdio: 'inherit',
  env: { ...process.env, PROBE_TIMING_JSON: artifactPath },
});

if (!existsSync(artifactPath)) {
  process.stderr.write(
    'baseline:conformance: no timing artifact written (probe likely errored before finishing) — nothing recorded.\n',
  );
  process.exit(probe.status ?? 1);
}

// 2. Record the row from the artifact.
const record = spawnSync(
  'npx',
  ['tsx', 'scripts/record-suite-timing.ts', '--conformance-json', artifactPath, '--notes', notes],
  { stdio: 'inherit' },
);
if (record.status !== 0) process.exit(record.status ?? 1);

// 3. Non-blocking drift warning.
const check = spawnSync('npx', ['tsx', 'scripts/check-suite-timing.ts'], { stdio: 'inherit' });
if (check.status === 1) {
  process.stderr.write('baseline:conformance: drift detected above (warning only — not failing the run).\n');
} else if (check.status !== 0) {
  // exit 2 = the check itself errored (bad args, unreadable log). Don't let it pass silently.
  process.stderr.write(
    `baseline:conformance: drift check errored (exit ${check.status}) — row recorded, not checked.\n`,
  );
}

// `?? 1`: spawnSync sets status=null when the probe was killed by a signal — treat that as failure
// (we recorded a possibly-partial run), not success. Matches the no-artifact guard above.
process.exit(probe.status ?? 1);
