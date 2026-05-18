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

/**
 * Upsert a diagnosed-pattern entry.
 *
 * `diagnosedAt` semantics: it records when the pattern was FIRST diagnosed and must remain
 * stable across later updates (e.g. attaching a linearIssueId after auto-filing). So if the
 * incoming entry already carries a `diagnosedAt` (the caller is updating a known entry, typically
 * by spreading the existing entry), that original timestamp is preserved; only a first write
 * (no incoming `diagnosedAt`) is stamped with `now`.
 */
export function recordDiagnosis(
  ledger: Ledger,
  path: string,
  e: Omit<LedgerEntry, 'diagnosedAt'> & { diagnosedAt?: string },
  now: Date = new Date(),
): Ledger {
  const diagnosedAt = e.diagnosedAt ?? now.toISOString();
  const next: Ledger = {
    entries: { ...ledger.entries, [e.fingerprint]: { ...e, diagnosedAt } },
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}
