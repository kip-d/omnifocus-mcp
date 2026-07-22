// src/diagnostics/clustering.ts
// intentionally-exposed-for-CLI (OMN-282): consumed by scripts/diagnose-failures.ts
// (the `npm run diagnose-failures` entry the weekly ~/bin/of-mcp-diagnose launchd
// job runs). scripts/ sits outside tsconfig's src/** include, so ts-prune flags
// these exports as orphans; they are not.
import { createHash } from 'crypto';
import type { FailureRecord } from './failure-log.js';
import { normalizeErrorMessage, normalizeInputShape } from './normalize.js';

export interface ClusterOptions {
  minOccurrences: number; // default 3
  minSpanDays: number; // default 2
}

export interface FailureCluster {
  fingerprint: string;
  tool: string;
  normalizedError: string;
  inputShape: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  escalated: boolean;
  example: FailureRecord; // first occurrence (inputArgs already redacted)
}

export function fingerprintOf(tool: string, normalizedError: string, inputShape: string): string {
  return createHash('sha256').update(`${tool} ${normalizedError} ${inputShape}`).digest('hex').slice(0, 16);
}

export function clusterFailures(records: FailureRecord[], opts: ClusterOptions): FailureCluster[] {
  const map = new Map<string, FailureCluster>();
  for (const r of records) {
    const normalizedError = normalizeErrorMessage(r.errorMessage);
    const inputShape = normalizeInputShape(r.inputArgs);
    const fp = fingerprintOf(r.tool, normalizedError, inputShape);
    const existing = map.get(fp);
    if (!existing) {
      map.set(fp, {
        fingerprint: fp,
        tool: r.tool,
        normalizedError,
        inputShape,
        count: 1,
        firstSeen: r.timestamp,
        lastSeen: r.timestamp,
        escalated: false,
        example: r,
      });
    } else {
      existing.count++;
      if (r.timestamp < existing.firstSeen) existing.firstSeen = r.timestamp;
      if (r.timestamp > existing.lastSeen) existing.lastSeen = r.timestamp;
    }
  }
  const DAY = 86_400_000;
  for (const c of map.values()) {
    const first = Date.parse(c.firstSeen);
    const last = Date.parse(c.lastSeen);
    // Unparseable timestamps ⇒ span = 0 so escalation falls back cleanly to the count rule
    // (NaN >= minSpanDays silently yields false, breaking the "never misfires" contract).
    const spanDays = Number.isNaN(first) || Number.isNaN(last) ? 0 : (last - first) / DAY;
    c.escalated = c.count >= opts.minOccurrences || spanDays >= opts.minSpanDays;
  }
  return [...map.values()];
}

const IGNORE_SET = new Set([
  'INVALID_ID',
  'NULL_RESULT',
  'OMNIFOCUS_NOT_RUNNING',
  'SCRIPT_TIMEOUT',
  'CONNECTION_TIMEOUT',
]);

export function isIgnored(c: FailureCluster): boolean {
  const cat = c.example.categorization?.errorType;
  return cat !== undefined && IGNORE_SET.has(cat);
}

// OMN-282: a coarse pre-classifier (classifyCluster/CoarseClass) lived here but
// the driver never ran that step — it goes straight from isIgnored() filtering
// to the fine deterministic/LLM split. Removed as a dead design remnant.
