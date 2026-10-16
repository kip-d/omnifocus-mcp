/**
 * coverage.ts - Shared cap-honesty metadata for analyze ops (OMN-340)
 *
 * Principle (OMN-335 read-side / OMN-340 analyze-side): aggregates are computed
 * over the WHOLE admitted population; only the returned detail arrays are
 * capped — and the response says so. `buildCoverage` is the ONE shared shape
 * for that disclosure, `{ total, returned, capped, cap }` (D4a), used verbatim
 * or spread with op-specific extras (e.g. pattern_analysis's future
 * `scanned_total`/`admitted_total`).
 *
 * Slice 1 (overdue_analysis) is the first consumer — see
 * OmniFocusAnalyzeTool.executeOverdueAnalysis. list_for_review (slice 2) and
 * pattern_analysis (slice 3) are designed to reuse this unchanged; clarify's
 * `screen` and waiting_for's inline copy can migrate onto it later (P3,
 * out of scope here — see OMN-340 spec §7).
 */

export interface Coverage {
  /** True size of the admitted population (e.g. every overdue task) — never capped. */
  total: number;
  /** How many detail rows the response actually returned (≤ cap). */
  returned: number;
  /** True when `total` exceeds `cap` — part of the population isn't in the detail. */
  capped: boolean;
  /** The hardcoded detail-array cap this op enforces. */
  cap: number;
}

/** Build the shared `{ total, returned, capped, cap }` coverage block (D4a). */
export function buildCoverage(total: number, returned: number, cap: number): Coverage {
  return { total, returned, capped: total > cap, cap };
}
