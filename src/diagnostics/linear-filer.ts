// src/diagnostics/linear-filer.ts
//
// Guardrailed auto-Linear filer for SCHEMA_DRIFT clusters.
//
// Guard order (mandatory — do NOT reorder):
//   1. Filter: only SCHEMA_DRIFT clusters are ever filed
//   2. Cap check: if open OMN+GATE issue count >= capThreshold → return capGuardTripped, create NOTHING
//   3. Per-cluster dedup: searchByLabelAndBody('omn-37-auto', fingerprint) → non-empty → skip
//   4. Per-run limit: stop after perRunLimit creations
//   5. Create: body embeds fingerprint verbatim + label 'omn-37-auto'
//
// The concrete LinearClient impl uses the Linear MCP `graphql` action (not typed `search`)
// for both openIssueCount (state.type nin [completed,canceled] across OMN+GATE) and
// the dedup query — typed search only returns the caller's assigned active issues.

export interface LinearClient {
  /** Count of all open (non-completed, non-canceled) issues across OMN+GATE teams. */
  openIssueCount(): Promise<number>;
  /**
   * Search for existing issues carrying the given label whose body contains the needle string.
   * Returns an array of issue identifiers (e.g. ['OMN-7']).
   */
  searchByLabelAndBody(label: string, needle: string): Promise<string[]>;
  /**
   * Create a new issue. Returns the created issue identifier (e.g. 'OMN-42').
   */
  createIssue(input: { title: string; body: string; label: string }): Promise<string>;
}

export interface FileDriftOptions {
  client: LinearClient;
  /** Maximum issues to create in a single run (default: 3). */
  perRunLimit: number;
  /** If open issue count >= this threshold, create nothing (default: 230). */
  capThreshold: number;
}

export interface FileDriftResult {
  /** Identifiers of issues created this run (e.g. ['OMN-42', 'OMN-43']). */
  created: string[];
  /** True when the cap guard fired — caller should append a CAP_GUARD_TRIPPED triage row. */
  capGuardTripped: boolean;
}

export interface DriftCluster {
  fingerprint: string;
  tool: string;
  classification: string;
  suggestedFix: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
}

/**
 * File Linear issues for SCHEMA_DRIFT clusters only, with layered guardrails.
 *
 * Guard order is strictly enforced:
 *   class filter → cap check (short-circuits ALL creates) → per-cluster dedup → per-run limit → create
 */
export async function fileDriftIssues(clusters: DriftCluster[], opts: FileDriftOptions): Promise<FileDriftResult> {
  const { client, perRunLimit, capThreshold } = opts;

  // Guard 1: filter to SCHEMA_DRIFT only — judgment-call and no-op classes are never filed
  const driftOnly = clusters.filter((c) => c.classification === 'SCHEMA_DRIFT');

  // Guard 2: cap check — must happen BEFORE any per-cluster work or creates
  const openCount = await client.openIssueCount();
  if (openCount >= capThreshold) {
    return { created: [], capGuardTripped: true };
  }

  const created: string[] = [];

  for (const cluster of driftOnly) {
    // Guard 4: per-run limit — stop before searching/creating once limit is reached
    if (created.length >= perRunLimit) break;

    // Guard 3: dedup — skip if an existing issue already carries this fingerprint
    const existing = await client.searchByLabelAndBody('omn-37-auto', cluster.fingerprint);
    if (existing.length > 0) continue;

    // Guard 5: create — embed fingerprint verbatim in body so future dedup searches can find it
    const body = [
      `**Tool:** ${cluster.tool}`,
      `**Suggested fix:** ${cluster.suggestedFix}`,
      `**First seen:** ${cluster.firstSeen}`,
      `**Last seen:** ${cluster.lastSeen}`,
      `**Occurrences:** ${cluster.count}`,
      '',
      `<!-- omn-37-auto fingerprint:${cluster.fingerprint} -->`,
    ].join('\n');

    const id = await client.createIssue({
      title: `[auto] SCHEMA_DRIFT on ${cluster.tool} (${cluster.fingerprint})`,
      body,
      label: 'omn-37-auto',
    });
    created.push(id);
  }

  return { created, capGuardTripped: false };
}
