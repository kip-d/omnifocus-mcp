#!/usr/bin/env tsx
/**
 * Record a CONFORMANCE suite-timing run (OMN-173 / OMN-182).
 *
 * Appends one conformance record to the per-machine JSONL log
 * ($XDG_STATE_HOME/of-mcp-suite-timing/runs.jsonl) from a probe timing artifact (written by the
 * probe via PROBE_TIMING_JSON). Integration runs record themselves via the vitest reporter, so
 * this CLI handles only the conformance half (the probe is an explicit, Ollama-gated run).
 *
 * Usage:
 *   PROBE_TIMING_JSON=/tmp/conf.json npm run conformance -- llama3.1:8b qwen2.5:7b
 *   npx tsx scripts/record-suite-timing.ts --conformance-json /tmp/conf.json --notes "post-merge"
 *   npx tsx scripts/record-suite-timing.ts --conformance-json /tmp/conf.json --dry-run
 */

import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import {
  ARTIFACT_SCHEMA,
  appendRun,
  buildConformanceRecord,
  captureEnv,
  conformanceFromArtifact,
  defaultLogPath,
  serializeRun,
  type ConformanceArtifact,
} from './lib/suite-timing.js';

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

function die(msg: string): never {
  process.stderr.write(`record-suite-timing: ${msg}\n`);
  process.exit(2);
}

function loadConformanceArtifact(path: string): ConformanceArtifact {
  if (!existsSync(path)) die(`conformance JSON not found: ${path}`);
  let art: ConformanceArtifact;
  try {
    art = JSON.parse(readFileSync(path, 'utf8')) as ConformanceArtifact;
  } catch (e) {
    die(`conformance JSON is not valid JSON: ${String(e)}`);
  }
  // `art` is definitely assigned here: die() returns `never`, so the catch path cannot fall through.
  if (art.schema !== ARTIFACT_SCHEMA) {
    die(
      `conformance JSON schema is "${art.schema}", expected "${ARTIFACT_SCHEMA}" — regenerate with the current probe`,
    );
  }
  return art;
}

function main(): void {
  const confJsonPath = arg('conformance-json') ?? process.env.PROBE_TIMING_JSON;
  if (!confJsonPath) die('nothing to record — pass --conformance-json (or set PROBE_TIMING_JSON)');

  const { conformance, wallMs } = conformanceFromArtifact(loadConformanceArtifact(confJsonPath));
  const record = buildConformanceRecord({
    build: arg('build') ?? gitShort(),
    ts: arg('date') ?? new Date().toISOString(),
    env: captureEnv(),
    conformance,
    wallMs,
    notes: arg('notes'),
  });

  if (flag('dry-run')) {
    process.stdout.write(serializeRun(record) + '\n');
    return;
  }

  const logPath = arg('log') ?? defaultLogPath();
  appendRun(logPath, record);
  process.stderr.write(`Recorded conformance run → ${logPath}\n`);
  process.stdout.write(serializeRun(record) + '\n');
}

main();
