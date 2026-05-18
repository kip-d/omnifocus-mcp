// src/diagnostics/clustering.ts
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

export type CoarseClass = 'VALIDATION' | 'EXECUTION' | 'DATA_ERROR';

/** Coarse pre-classification. The fine SCHEMA_DRIFT/COERCION/DESCRIPTION split happens in the driver
 *  (deterministic via schema-drift) or the LLM agent (residual). */
export function classifyCluster(c: FailureCluster): CoarseClass {
  if (isIgnored(c)) return 'DATA_ERROR';
  return c.example.errorType === 'VALIDATION_ERROR' ? 'VALIDATION' : 'EXECUTION';
}
