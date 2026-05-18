#!/usr/bin/env npx tsx
// scripts/diagnose-failures.ts — Tier-1 failure diagnosis driver
//
// Exports `runDiagnosis` (pure/injectable orchestration core) and a CLI wrapper.
// Pure = no direct fs/network access; all I/O injected as deps.
//
// Phase 3 ships deterministic path (SCHEMA_DRIFT / COERCION_MISSING) + optional agentRunner residual.
// Phase 4 adds --create-issues (linearFiler, not wired here).

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { parseFailureLog } from '../src/diagnostics/failure-log.js';
import { clusterFailures, isIgnored } from '../src/diagnostics/clustering.js';
import {
  canonicalizeInputSchema,
  canonicalizeZodSchema,
  diffSchemas,
  type DriftFinding,
} from '../src/diagnostics/schema-drift.js';
import { TOOL_SCHEMA_REGISTRY, type ToolSchemaEntry } from '../src/diagnostics/tool-schema-registry.js';
import { loadLedger, isKnown, recordDiagnosis, defaultLedgerPath } from '../src/diagnostics/ledger.js';
import { renderTriageDoc, type TriageRow } from '../src/diagnostics/triage-doc.js';
import type { FailureRecord } from '../src/diagnostics/failure-log.js';
import type { FailureCluster } from '../src/diagnostics/clustering.js';

// ---------------------------------------------------------------------------
// Types for injected dependencies
// ---------------------------------------------------------------------------

export interface DiagnosisThresholds {
  minOccurrences: number;
  minSpanDays: number;
}

export interface AgentResult {
  classification: string;
  suggestedFix: string;
}

export type AgentRunner = (cluster: FailureCluster) => Promise<AgentResult>;

export interface RunDiagnosisOpts {
  /** Already-parsed failure records (injectable for testing; CLI reads from logDir). */
  records: FailureRecord[];
  /** Tool schema registry entries (injectable for testing; CLI uses TOOL_SCHEMA_REGISTRY). */
  registry: ToolSchemaEntry[];
  /** Path to the seen-patterns ledger JSON file. */
  ledgerPath: string;
  /** Current time (injectable for determinism). */
  now: Date;
  /** Escalation thresholds. */
  thresholds: DiagnosisThresholds;
  /** Sink for the rendered triage-doc markdown string. */
  writeTriageDoc: (md: string) => void;
  /**
   * Optional: invoked for residual clusters (those not deterministically classified).
   * OMITTED in tests — deterministic clusters never reach this.
   */
  agentRunner?: AgentRunner;
}

// ---------------------------------------------------------------------------
// Deterministic classification helpers
// ---------------------------------------------------------------------------

/** Map a COERCION_GAP drift finding to the fine classification COERCION_MISSING,
 *  other non-FIELD_MISSING findings to SCHEMA_DRIFT. */
function deterministicClassification(findings: DriftFinding[]): string | null {
  const blocking = findings.filter((f) => f.kind !== 'FIELD_MISSING');
  if (blocking.length === 0) return null; // no deterministic classification
  const hasCoercionGap = blocking.some((f) => f.kind === 'COERCION_GAP');
  return hasCoercionGap ? 'COERCION_MISSING' : 'SCHEMA_DRIFT';
}

function suggestedFixFromFindings(findings: DriftFinding[]): string {
  const blocking = findings.filter((f) => f.kind !== 'FIELD_MISSING');
  if (blocking.length === 0) return 'no fix determined';
  return blocking.map((f) => `${f.kind} on field '${f.field}': ${f.detail}`).join('; ');
}

// ---------------------------------------------------------------------------
// Pure orchestration core (injected deps, no direct fs/network)
// ---------------------------------------------------------------------------

export async function runDiagnosis(opts: RunDiagnosisOpts): Promise<void> {
  const { records, registry, ledgerPath, now, thresholds, writeTriageDoc, agentRunner } = opts;

  // 1. Cluster
  const clusters = clusterFailures(records, thresholds);

  // 2. Filter: drop ignored + un-escalated
  const escalated = clusters.filter((c) => c.escalated && !isIgnored(c));

  // 3. Load ledger and drop already-known
  let ledger = loadLedger(ledgerPath);
  const novel = escalated.filter((c) => !isKnown(ledger, c.fingerprint));

  // 4. Build triage rows
  const triageRows: TriageRow[] = [];

  for (const cluster of novel) {
    // Find registry entry for this tool (may be absent for unknown tools)
    const entry = registry.find((e) => e.name === cluster.tool);

    let classification: string | null = null;
    let suggestedFix: string = 'needs investigation';

    if (entry) {
      try {
        const advSchema = canonicalizeInputSchema(entry.getInputSchema(), entry.wrapperKey);
        const zodSchema = canonicalizeZodSchema(entry.zodSchema, entry.wrapperKey);
        const findings = diffSchemas(advSchema, zodSchema);
        classification = deterministicClassification(findings);
        if (classification) {
          suggestedFix = suggestedFixFromFindings(findings);
        }
      } catch {
        // schema diff failed — fall through to agentRunner
      }
    }

    if (classification === null && agentRunner) {
      // Residual: dispatch to LLM agent
      try {
        const result = await agentRunner(cluster);
        classification = result.classification;
        suggestedFix = result.suggestedFix;
      } catch {
        classification = 'NEEDS_LLM';
        suggestedFix = 'agent unavailable — manual investigation required';
      }
    }

    if (classification === null) {
      classification = 'NEEDS_LLM';
      suggestedFix = 'no agent configured — manual investigation required';
    }

    const row: TriageRow = {
      fingerprint: cluster.fingerprint,
      tool: cluster.tool,
      classification,
      suggestedFix,
      firstSeen: cluster.firstSeen.slice(0, 10), // ISO date portion
      lastSeen: cluster.lastSeen.slice(0, 10),
      count: cluster.count,
    };
    triageRows.push(row);

    // Record in ledger
    ledger = recordDiagnosis(ledger, ledgerPath, {
      fingerprint: cluster.fingerprint,
      classification,
    });
  }

  // 5. Render and write triage doc
  writeTriageDoc(renderTriageDoc(triageRows, now));
}

// ---------------------------------------------------------------------------
// CLI wrapper — wires real deps and runs
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const daysArg = args.find((a) => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 90;

  const logDir = join(homedir(), '.omnifocus-mcp', 'tool-failures');
  const ledgerPath = defaultLedgerPath();
  const triageDocPath = join(process.cwd(), 'docs', 'dev', 'mcp-failure-triage.md');

  // Read all failure records from logDir
  let records: FailureRecord[] = [];
  try {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const files = readdirSync(logDir).filter((f) => {
      const m = /failures-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      return m && m[1] >= cutoff;
    });
    for (const file of files) {
      const content = readFileSync(join(logDir, file), 'utf-8');
      records = records.concat(parseFailureLog(content));
    }
  } catch {
    // logDir missing or unreadable → treat as empty (graceful no-op)
    console.info(`[diagnose-failures] No failure logs found in ${logDir} — writing empty triage doc.`);
  }

  const writeTriageDoc = (md: string): void => {
    mkdirSync(dirname(triageDocPath), { recursive: true });
    writeFileSync(triageDocPath, md, 'utf-8');
    console.info(`[diagnose-failures] Wrote triage doc to ${triageDocPath}`);
  };

  await runDiagnosis({
    records,
    registry: TOOL_SCHEMA_REGISTRY,
    ledgerPath,
    now: new Date(),
    thresholds: { minOccurrences: 3, minSpanDays: 2 },
    writeTriageDoc,
    // agentRunner omitted — Phase 3 does not spawn LLM from CLI yet
  });
}

// Guard: only run main() when this file is the direct entry point, not when imported by tests.
// tsx preserves the .ts extension in import.meta.url, so match against the raw argv[1] path.
if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((e: unknown) => {
    console.error('[diagnose-failures] fatal:', e);
    process.exit(1);
  });
}
