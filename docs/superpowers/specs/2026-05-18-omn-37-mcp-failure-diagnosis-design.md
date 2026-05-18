# OMN-37 — Auto-diagnose MCP tool failures (log-based Tier-1, optional Tier-2 hook)

Date: 2026-05-18 Linear: OMN-37 Status: Design approved — pending spec review

## Problem

During dogfooding across multiple Claude Code projects, the LLM occasionally makes MCP calls that fail due to schema
mismatches or misleading tool descriptions. It self-corrects on retry, so the failure is invisible — but each failure is
signal for one of: **schema drift** (`inputSchema` advertised to the LLM diverged from the Zod schema that actually
validates), **description gap** (the description implies a capability/syntax that does not exist), **missing coercion**
(Claude Desktop stringifies a param the schema does not accept), or **ambiguous field name** (a plausible-but-wrong
guess). The dual-schema architecture makes drift _inevitable over time_; this work automates its detection and turns the
ignored failure stream into actionable triage.

The ticket's title proposes a `PostToolUse` hook as the trigger. **That mechanism is rejected as the primary path** and
demoted to an optional Tier-2: production MCP traffic runs under Claude Desktop, which never executes Claude Code hooks,
so a hook-first design would be structurally blind to the exact failure population it exists to catch. The durable JSONL
failure log is client-agnostic and already captures every failure regardless of client.

## Key facts (reuse, don't reinvent)

Verified against current main `2ce9255` (line numbers may shift; symbols are stable anchors):

| Capability                                                                                                                                                                   | Location                                                                                                                                                | Status                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Per-failure JSONL log (`failures-YYYY-MM-DD.jsonl`: timestamp, tool, errorType, errorMessage, validationErrors, redacted `inputArgs`, `schemaDescription`, `categorization`) | `src/tools/base.ts` `logToolFailure()` (≈:301; call sites ≈:266 Zod, ≈:280 exec, ≈:639)                                                                 | Mature — reuse as-is                                                                |
| Error taxonomy                                                                                                                                                               | `src/utils/error-taxonomy.ts` — `ScriptErrorType` enum (≈:13), `categorizeError()` (≈:83), `isRecoverableError()` (≈:360), `getErrorSeverity()` (≈:385) | Mature — classification source of truth                                             |
| Batch analyzer + normalization (IDs/dates → placeholders)                                                                                                                    | `scripts/analyze-tool-failures.ts` (`npm run analyze-failures`); normalization ≈:119                                                                    | Closest prior art — to be refactored onto the new module                            |
| Hand-crafted `inputSchema` getters                                                                                                                                           | `OmniFocusReadTool.ts` `get inputSchema()` (≈:217), `OmniFocusWriteTool.ts` (≈:177), `OmniFocusAnalyzeTool.ts` (≈:310), `SystemTool.ts` (≈:128)         | Readable for drift diff                                                             |
| Zod schemas                                                                                                                                                                  | `src/tools/unified/schemas/` — `read-schema.ts`, `write-schema.ts`, `analyze-schema.ts`, `batch-schemas.ts`                                             | Statically importable for drift diff                                                |
| Numeric-coercion convention                                                                                                                                                  | CLAUDE.md: `z.union([z.number(), z.string().transform(...)])` for every MCP numeric                                                                     | The `COERCION_MISSING` rule keys off this — flag only numerics _lacking_ this shape |

**Confirmed absent on `2ce9255`** (these are the build targets): no `hooks` block in `.claude/settings*.json`, no
`mcp-failure-diagnoser` agent, no `docs/dev/mcp-failure-triage.md`, no `diagnose-failures` npm script, no
inputSchema↔Zod drift checker.

## Scope (decided)

| Decision                    | Resolution                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| v1 scope                    | **Full phases 1–5**                                                                                     |
| Phase-3 output sink         | **Triage doc + auto-Linear** (guardrailed — see §4)                                                     |
| Tier-1 escalation threshold | **≥3 occurrences OR cluster spans ≥2 days** (driver-configurable)                                       |
| Phase-5 scheduling          | **Untracked local `~/bin` cron wrapper**; the only in-repo deliverable is `npm run diagnose-failures`   |
| Primary trigger             | **Log-based batch (Tier-1)**. The `PostToolUse` hook is Tier-2 (cheap local prioritization marker only) |

Architectural forks resolved: **A1** (extract one shared clustering module; the existing CLI becomes a thin presenter —
building a second pipeline would reproduce the very drift this ticket exists to catch), **B1** (static structural schema
diff, shipped as a CI-failing unit test _and_ exported to the driver), **C1** (deterministic driver classifies inline;
the LLM agent is invoked _only_ for residual non-deterministic clusters — bounded, reproducible token cost).

## Design

### §1 — Phase 1: `failure-clustering` module

New `src/diagnostics/failure-clustering.ts` + `tests/unit/diagnostics/failure-clustering.test.ts`. Pure,
side-effect-free functions:

- `parseFailureLog(jsonl: string): FailureRecord[]` — tolerant line parse; skips malformed lines without throwing.
- `normalizeRecord(r): NormalizedRecord` — IDs/dates/paths → placeholders. Reuses the existing normalization logic from
  `analyze-tool-failures.ts:119` (extracted, not duplicated).
- `clusterFailures(records, opts): FailureCluster[]` — groups by `(tool, normalizedError, normalizedInputShape)`;
  `opts = { minOccurrences: 3, minSpanDays: 2 }`; a cluster escalates if `count ≥ minOccurrences` **OR**
  `lastSeen − firstSeen ≥ minSpanDays`. Each cluster carries `firstSeen`, `lastSeen`, `count`, an example redacted
  `inputArgs`, and a stable `fingerprint` (hash of `tool + normalizedError + normalizedInputShape`).
- `classifyCluster(cluster): TaxonomyClass` — delegates to `error-taxonomy.ts`; the ignore-set (`INVALID_ID`,
  `NULL_RESULT`, `OMNIFOCUS_NOT_RUNNING`, `*_TIMEOUT`) is filtered here.

`scripts/analyze-tool-failures.ts` is refactored to consume this module; **`npm run analyze-failures` output is
unchanged** — a golden/snapshot test pins the existing CLI output so the refactor is provably behavior-preserving.

### §2 — Phase 2: schema-drift checker

New `src/diagnostics/schema-drift.ts` + `tests/unit/diagnostics/schema-drift.test.ts`:

- `canonicalizeInputSchema(advertised): CanonicalSchema` and `canonicalizeZodSchema(zod): CanonicalSchema` — both reduce
  to `{ field → { type, required, enum?, coercible } }`.
- `diffSchemas(advertised, zod): DriftFinding[]` — finding kinds: `FIELD_MISSING` (advertised/validated asymmetry),
  `ENUM_MISMATCH`, `REQUIRED_MISMATCH`, `COERCION_GAP`. The `COERCION_GAP` rule encodes the CLAUDE.md
  `z.union([z.number(), z.string().transform()])` convention so it flags **only** numeric fields lacking that shape —
  eliminating the false-positive class called out in the investigation's open question #5.
- Wired into `tests/unit/` so **drift fails CI** for all four tools (`omnifocus_read/write/analyze`, `system`); the same
  function is exported for the Tier-1 driver.

This is the highest standalone value: it attacks the inevitable dual-schema-drift problem directly, with zero dependency
on the failure log, agent, or hook.

### §3 — Phase 3: diagnoser agent + Tier-1 driver

- New `.claude/agents/mcp-failure-diagnoser.md` — sibling to `code-standards-reviewer.md` / `jxa-omnifocus-expert.md`.
  Input: a single deduplicated cluster (tool + normalized error + example `inputArgs` + the tool's live `inputSchema`
  and Zod schema). It reads description + both schemas and emits one classification: `SCHEMA_DRIFT` / `DESCRIPTION_GAP`
  / `COERCION_MISSING` / `LLM_EXPLORATION` (no-op) / `DATA_ERROR` (no-op), plus a one-line suggested fix.
- New `scripts/diagnose-failures.ts` + `npm run diagnose-failures` (mirrors the `analyze-failures` script entry). Flow:
  1. Cluster the log (§1), keep only clusters above threshold and not in the ignore-set.
  2. Run schema-drift (§2); deterministic `SCHEMA_DRIFT` / `COERCION_MISSING` are classified **inline** (no LLM).
  3. Residual clusters (ambiguous / candidate `DESCRIPTION_GAP`) → dispatch to the `mcp-failure-diagnoser` agent (Fork
     C1 — bounded LLM cost).
  4. Write `docs/dev/mcp-failure-triage.md` (committed; tables-over-prose per repo standards): one row per pattern —
     classification, suggested fix, first-seen, last-seen, count, fingerprint.
- **Seen-patterns ledger** at the `~/.omnifocus-mcp/` root: `~/.omnifocus-mcp/diagnosed-patterns.json` — a **sibling
  of** the `~/.omnifocus-mcp/tool-failures/` log directory, not nested inside it. Outside the repo. Keyed by
  `fingerprint`; records classification + any created Linear issue ID. A cluster whose fingerprint is in the ledger is
  **not** re-diagnosed and **not** re-filed.

### §4 — Phase 3b: auto-Linear (cap-risk surface — explicit guardrails)

The 250 non-archived-issue free-tier cap is **workspace-wide across OMN+GATE**. Auto-creation is constrained:

| Guard                | Rule                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Class allowlist      | Create issues **only** for deterministic `SCHEMA_DRIFT`. Never for LLM-judgment classes (`DESCRIPTION_GAP`) or no-op classes.                                                                                                                                                                                                                |
| Existing-issue dedup | Before creating, dedup via the **`graphql` action** (not the typed `search` action — per project memory that only returns the caller's assigned active issues). Query OMN issues filtered on the `omn-37-auto` label, then string-match the cluster `fingerprint` embedded verbatim in the issue body. Match → update/skip, never duplicate. |
| Cap-safety guard     | Query open OMN+GATE count (graphql, `state.type nin [completed,canceled]`). If **≥ 230**, skip all creation, write triage rows only, emit a loud `CAP_GUARD_TRIPPED` warning row.                                                                                                                                                            |
| Per-run limit        | Create at most **3** new issues per run.                                                                                                                                                                                                                                                                                                     |
| Traceability         | Every auto-issue carries an `omn-37-auto` label + the fingerprint in the body, so a sweep can find/triage/bulk-archive them.                                                                                                                                                                                                                 |
| Ledger               | Created issue ID written to the seen-patterns ledger → never recreated.                                                                                                                                                                                                                                                                      |

### §5 — Phases 4+5: Tier-2 hook + scheduling

- **Phase 4 (Tier-2 hook, optional, dev-only):** a `PostToolUse` matcher `mcp__omnifocus__*` in
  `.claude/settings.local.json` (gitignored — local, not shared) that on error appends a one-line marker
  (`tool + timestamp`) to a priority file under `~/.omnifocus-mcp/`. **No inline `claude -p`** — that would spawn an
  agent on every transient "task not found". Tier-1 reads the marker to prioritize fresh patterns. Purely a dev-feedback
  accelerator; the system is fully functional without it.
- **Phase 5 (scheduling):** lives in an **untracked `~/bin` cron/launchd wrapper** (matches the established
  `of-mcp-redeploy` ops-glue-placement precedent — machine-specific scheduling does not ship in the product). The only
  in-repo deliverable is `npm run diagnose-failures`; the wrapper invokes it from the log directory on the user's
  cadence.

## Non-goals

- No change to runtime MCP request handling or to `logToolFailure`'s on-disk format.
- No interactive/inline per-call LLM diagnosis (cost + Claude-Desktop-blind).
- No auto-creation for any class other than deterministic `SCHEMA_DRIFT` in v1.
- The `~/bin` scheduling wrapper itself is out of repo scope (documented, not committed).

## Risks & mitigations

| Risk                                                  | Mitigation                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Auto-Linear burns the workspace-wide 250 cap          | §4: allowlist + existing-issue dedup + ≥230 cap guard + per-run limit 3 + ledger                                      |
| Phase-1 refactor regresses `npm run analyze-failures` | Golden/snapshot test pins existing CLI output before refactor                                                         |
| Schema-drift false positives on numeric coercion      | `COERCION_GAP` rule encodes the CLAUDE.md `z.union` convention; flags only non-conforming numerics                    |
| Unbounded LLM token cost                              | Fork C1: deterministic classes resolved inline; agent invoked only on residual clusters; ledger prevents re-diagnosis |
| Tier-2 hook spawns agents on transient errors         | Hook only appends a marker line; never invokes `claude -p`                                                            |

## Phasing (independently shippable)

1. **§1 module** (S) — pure refactor + tests; behavior-preserving for the existing CLI.
2. **§2 drift checker** (M) — standalone CI value, zero log/agent/hook dependency. _Phases 1–2 deliver most of the
   value._
3. **§3 driver + agent** (M) — depends on §1, §2.
4. **§4 auto-Linear** (S) — depends on §3; guardrail-heavy, lands behind a `--create-issues` flag.
5. **§5 Tier-2 hook** (S, in-repo: settings.local.json only) + scheduling wrapper (out of repo).
