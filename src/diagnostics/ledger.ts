// src/diagnostics/ledger.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export interface LedgerEntry {
  fingerprint: string;
  classification: string;
  linearIssueId?: string;
  diagnosedAt: string;
}
export interface Ledger {
  entries: Record<string, LedgerEntry>;
}

/** Default path: ~/.omnifocus-mcp/diagnosed-patterns.json — SIBLING of tool-failures/, not nested inside it. */
export function defaultLedgerPath(): string {
  return join(homedir(), '.omnifocus-mcp', 'diagnosed-patterns.json');
}

export function loadLedger(path = defaultLedgerPath()): Ledger {
  if (!existsSync(path)) return { entries: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Ledger;
  } catch {
    return { entries: {} };
  }
}

export function isKnown(ledger: Ledger, fingerprint: string): boolean {
  return fingerprint in ledger.entries;
}

export function recordDiagnosis(ledger: Ledger, path: string, e: Omit<LedgerEntry, 'diagnosedAt'>): Ledger {
  const next: Ledger = {
    entries: { ...ledger.entries, [e.fingerprint]: { ...e, diagnosedAt: new Date().toISOString() } },
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}
