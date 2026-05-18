// src/diagnostics/triage-doc.ts

export interface TriageRow {
  fingerprint: string;
  tool: string;
  classification: string;
  suggestedFix: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
}

/**
 * Render a deterministic markdown triage document from a list of diagnosed failure patterns.
 *
 * Sort order: count desc, then fingerprint asc (stable, deterministic).
 * Legend documents the CAP_GUARD_TRIPPED sentinel (Phase 4 adds its use).
 */
export function renderTriageDoc(rows: TriageRow[], now: Date): string {
  const sorted = [...rows].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // Strict byte-wise comparison — localeCompare is locale-sensitive and determinism is a hard requirement.
    if (a.fingerprint < b.fingerprint) return -1;
    if (a.fingerprint > b.fingerprint) return 1;
    return 0;
  });

  const generatedAt = now.toISOString();

  const tableHeader = '| Fingerprint | Tool | Classification | Suggested fix | First seen | Last seen | Count |';
  const tableSep = '|-------------|------|----------------|---------------|------------|-----------|-------|';
  const tableRows = sorted
    .map(
      (r) =>
        `| ${r.fingerprint} | ${r.tool} | ${r.classification} | ${r.suggestedFix} | ${r.firstSeen} | ${r.lastSeen} | ${r.count} |`,
    )
    .join('\n');

  const legend = `
## Legend

| Classification | Meaning |
|----------------|---------|
| SCHEMA_DRIFT | advertised inputSchema diverged from Zod validation — deterministic |
| COERCION_MISSING | numeric field present in advertised schema, Zod rejects string input — deterministic |
| DESCRIPTION_GAP | tool description unclear; LLM-adjudicated |
| LLM_EXPLORATION | no-op: LLM is probing the API; no fix required |
| DATA_ERROR | no-op: bad caller data; not a schema issue |
| NEEDS_LLM | agent not configured or unavailable — manual investigation required |
| CAP_GUARD_TRIPPED | auto-Linear filing skipped because open issue count >= cap threshold |
`;

  return `# MCP Failure Triage

_Generated at: ${generatedAt}_

## Diagnosed Patterns

${tableHeader}
${tableSep}
${tableRows}
${legend}`;
}
