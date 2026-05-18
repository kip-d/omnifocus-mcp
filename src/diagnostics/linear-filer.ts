// src/diagnostics/linear-filer.ts
//
// Guardrailed auto-Linear filer for SCHEMA_DRIFT clusters.
//
// Guard order (mandatory — matches the actual execution order in fileDriftIssues; do NOT reorder):
//   1. Class filter: only SCHEMA_DRIFT clusters are ever filed
//   2. Cap check: if open OMN+GATE issue count >= capThreshold → return capGuardTripped, create NOTHING.
//      Fires ONCE before the loop — unbypassable.
//   3. Per-run limit: stop the loop after perRunLimit creations
//   4. Per-cluster dedup: searchByLabelAndBody('omn-37-auto', fingerprint) → non-empty → skip
//   5. Create: body embeds fingerprint verbatim + label 'omn-37-auto'
//
// Note: the per-run LIMIT (3) is checked BEFORE the per-cluster DEDUP search (4) deliberately —
// once the run limit is hit, dropping the remaining clusters without issuing a
// searchByLabelAndBody network call avoids unnecessary dedup queries for clusters that would
// never be created this run anyway.
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

export interface CreatedIssue {
  fingerprint: string;
  id: string;
}

export interface FailedIssue {
  fingerprint: string;
  error: string;
}

export interface FileDriftResult {
  /** Issues created this run, each carrying the cluster fingerprint so the caller can update the ledger. */
  created: CreatedIssue[];
  /**
   * Clusters whose createIssue call rejected. Always present ([] when none). The run continues
   * past a failure (one Linear hiccup must not lose the other successfully-created issues), and
   * the caller still ledgers every `created` entry even when `failed` is non-empty.
   */
  failed: FailedIssue[];
  /** True when the cap guard fired — caller should append a CAP_GUARD_TRIPPED triage row. */
  capGuardTripped: boolean;
}

/**
 * Input cluster shape for the filer.
 *
 * NOTE: this intentionally mirrors `TriageRow` in src/diagnostics/triage-doc.ts field-for-field so
 * the driver can pass triage rows straight through. They are kept as separate types so linear-filer
 * stays self-contained (no triage-doc import), but the two MUST stay field-compatible — if either
 * `DriftCluster` or `TriageRow` gains/renames a field, update the other or the driver hand-off breaks.
 */
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
 * Guard order (matches the code below exactly):
 *   1 class filter → 2 cap check (short-circuits ALL creates, before the loop) →
 *   3 per-run limit → 4 per-cluster dedup → 5 create
 *
 * The per-run limit (3) is checked before the dedup search (4) on purpose: clusters the run
 * limit would drop never incur a searchByLabelAndBody network call.
 *
 * A createIssue rejection on one cluster is isolated (recorded in `failed`, loop continues) so
 * one Linear hiccup never loses the issues already created — the caller ledgers all `created`.
 */
export async function fileDriftIssues(clusters: DriftCluster[], opts: FileDriftOptions): Promise<FileDriftResult> {
  const { client, perRunLimit, capThreshold } = opts;

  // Guard 1: class filter — only SCHEMA_DRIFT; judgment-call and no-op classes are never filed
  const driftOnly = clusters.filter((c) => c.classification === 'SCHEMA_DRIFT');

  // Guard 2: cap check — fires ONCE before the loop, BEFORE any per-cluster work or creates (unbypassable)
  const openCount = await client.openIssueCount();
  if (openCount >= capThreshold) {
    return { created: [], failed: [], capGuardTripped: true };
  }

  const created: CreatedIssue[] = [];
  const failed: FailedIssue[] = [];

  for (const cluster of driftOnly) {
    // Guard 3: per-run limit — stop before the dedup search so dropped clusters incur no network call
    if (created.length >= perRunLimit) break;

    // Guard 4: dedup — skip if an existing issue already carries this fingerprint
    const existing = await client.searchByLabelAndBody('omn-37-auto', cluster.fingerprint);
    if (existing.length > 0) continue;

    // Guard 5: create — embed fingerprint verbatim in body so future dedup searches can find it.
    // Per-cluster isolation: a createIssue rejection records the cluster in `failed` and the loop
    // continues; it must NOT abort the whole run (that would silently lose earlier successes
    // because the caller would never receive the partial `created[]` to ledger).
    const body = [
      `**Tool:** ${cluster.tool}`,
      `**Suggested fix:** ${cluster.suggestedFix}`,
      `**First seen:** ${cluster.firstSeen}`,
      `**Last seen:** ${cluster.lastSeen}`,
      `**Occurrences:** ${cluster.count}`,
      '',
      `<!-- omn-37-auto fingerprint:${cluster.fingerprint} -->`,
    ].join('\n');

    try {
      const id = await client.createIssue({
        title: `[auto] SCHEMA_DRIFT on ${cluster.tool} (${cluster.fingerprint})`,
        body,
        label: 'omn-37-auto',
      });
      created.push({ fingerprint: cluster.fingerprint, id });
    } catch (err: unknown) {
      failed.push({
        fingerprint: cluster.fingerprint,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }

  return { created, failed, capGuardTripped: false };
}
