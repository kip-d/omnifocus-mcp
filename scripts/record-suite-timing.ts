#!/usr/bin/env tsx
/**
 * Record a suite-timing row (OMN-173).
 *
 * Appends one row to docs/dev/SUITE_TIMING_LOG.md from a conformance timing artifact
 * (written by the probe via PROBE_TIMING_JSON) and/or a measured integration wall. Either
 * half may be omitted — the absent suite renders as "—". Date and build (git rev-parse) are
 * auto-filled. So drift is a diff, not a memory ([[project_mcp_cold_start_reconnect]]).
 *
 * Usage:
 *   # conformance only (the probe wrote /tmp/conf.json)
 *   PROBE_TIMING_JSON=/tmp/conf.json npm run conformance -- llama3.1:8b qwen2.5:7b
 *   npx tsx scripts/record-suite-timing.ts --conformance-json /tmp/conf.json --notes "post-merge"
 *
 *   # integration only
 *   npx tsx scripts/record-suite-timing.ts --integration-wall 529 --integration-tests 159
 *
 *   # both, dry-run (print the row, don't write)
 *   npx tsx scripts/record-suite-timing.ts --conformance-json /tmp/conf.json --integration-wall 529 --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import {
  ARTIFACT_SCHEMA,
  INTEGRATION_ARTIFACT_SCHEMA,
  conformanceFromArtifact,
  integrationFromArtifact,
  insertRow,
  renderRow,
  type ConformanceArtifact,
  type IntegrationArtifact,
  type RunRow,
} from './lib/suite-timing.js';

const DEFAULT_LOG = 'docs/dev/SUITE_TIMING_LOG.md';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function gitShort(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function todayLocal(): string {
  // Local calendar date; the suite-timing log is a per-machine record, not a UTC ledger.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function die(msg: string): never {
  process.stderr.write(`record-suite-timing: ${msg}\n`);
  process.exit(2);
}

/** Read + schema-validate a timing artifact, or die with a precise message. */
function loadArtifact<T extends { schema: string }>(path: string, expectedSchema: string, label: string): T {
  if (!existsSync(path)) die(`${label} JSON not found: ${path}`);
  let art: T;
  try {
    art = JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    die(`${label} JSON is not valid JSON: ${String(e)}`);
  }
  // `art` is definitely assigned here: die() returns `never`, so the catch path cannot fall through.
  if (art.schema !== expectedSchema) {
    die(`${label} JSON schema is "${art.schema}", expected "${expectedSchema}" — regenerate with the current tool`);
  }
  return art;
}

function main(): void {
  const confJsonPath = arg('conformance-json') ?? process.env.PROBE_TIMING_JSON;
  const intJsonPath = arg('integration-json') ?? process.env.INTEGRATION_TIMING_JSON;
  const intWallRaw = arg('integration-wall');
  const intTestsRaw = arg('integration-tests');
  const notes = arg('notes') ?? '';
  const logPath = arg('log') ?? DEFAULT_LOG;
  const dryRun = flag('dry-run');

  if (!confJsonPath && !intJsonPath && intWallRaw === undefined) {
    die('nothing to record — pass --conformance-json, --integration-json, and/or --integration-wall');
  }

  let conformance: RunRow['conformance'] = [];
  let conformanceTotalS: number | null = null;
  if (confJsonPath) {
    const c = conformanceFromArtifact(loadArtifact<ConformanceArtifact>(confJsonPath, ARTIFACT_SCHEMA, 'conformance'));
    conformance = c.conformance;
    conformanceTotalS = c.conformanceTotalS;
  }

  let integrationWallS: number | null = intWallRaw === undefined ? null : Number(intWallRaw);
  let integrationTests: number | null = intTestsRaw === undefined ? null : Number(intTestsRaw);
  if (intJsonPath) {
    // The reporter-written artifact is the authoritative source; it overrides any manual flags.
    const mapped = integrationFromArtifact(
      loadArtifact<IntegrationArtifact>(intJsonPath, INTEGRATION_ARTIFACT_SCHEMA, 'integration'),
    );
    integrationWallS = mapped.integrationWallS;
    integrationTests = mapped.integrationTests;
  }
  if (integrationWallS !== null && !Number.isFinite(integrationWallS))
    die('--integration-wall must be a number (seconds)');
  if (integrationTests !== null && !Number.isFinite(integrationTests)) die('--integration-tests must be a number');

  const row: RunRow = {
    date: arg('date') ?? todayLocal(),
    build: arg('build') ?? gitShort(),
    integrationWallS,
    integrationTests,
    conformance,
    conformanceTotalS,
    notes,
  };

  if (dryRun) {
    process.stdout.write(renderRow(row) + '\n');
    return;
  }

  if (!existsSync(logPath)) die(`log not found: ${logPath} (create it from the template first)`);
  const updated = insertRow(readFileSync(logPath, 'utf8'), row);
  writeFileSync(logPath, updated);
  process.stderr.write(`Recorded row → ${logPath}\n`);
  process.stdout.write(renderRow(row) + '\n');
}

main();
