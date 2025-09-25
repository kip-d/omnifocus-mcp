# OmniFocus MCP Server – Codex Suggested Roadmap

*Updated: September 23, 2025*
*Status: Core tooling stable (v2) with consolidated MCP surface; OmniAutomation scripts and cache layer in active use.*

## Guiding Principles
- Ship improvements in increments that can be validated with existing Vitest/unit coverage and manual OmniFocus smoke tests.
- Reuse current strengths (JXA scripts, TTL cache, consolidated tools) before inventing new subsystems.
- Document OmniFocus automation or permission constraints early so roadmap items account for them.
- Add observability and safety rails before introducing high-impact automation changes.

## Baseline Snapshot
- Cache manager already supports targeted invalidation via `invalidateTaskQueries` and workflow refresh helpers.
- Tool handlers run through `BaseTool.executeValidated`, providing a consistent interception point for logging, error shaping, and metrics.
- No support today for cursor pagination, webhook callbacks, or plugin execution; OmniFocus does not emit real-time events.

## Near-Term (0–2 weeks)
| Initiative | Outcome | Key Tasks | Dependencies | Validation |
| --- | --- | --- | --- | --- |
| Error Taxonomy Refresh | Consistent user-facing error responses with actionable guidance | 1. Define standard `ScriptErrorType` enum and helper in `BaseTool`. 2. Update high-traffic tools (`tasks`, `projects`, `manage_task`, `system`) to map script failures to the taxonomy. 3. Add unit snapshots for new error payloads. | None | Vitest unit tests + manual negative test (OmniFocus closed, permission revoked). |
| Structured Logging v1 | Correlated log entries for tool calls | 1. Extend `createLogger` to accept optional correlation ID. 2. Generate ID in `CallTool` handler, pass via tool execution context. 3. Emit timing metadata already captured by `OperationTimerV2`. | Requires Error Taxonomy helper to avoid duplicate work in BaseTool. | Inspect logs during `npm run dev`, ensure JSON structure parses via `jq`. |
| Usage Metrics Seed | Minimal metrics to inform later analytics | 1. Capture counters in `BaseTool` (tool name, duration bucket, success/error). 2. Add in-memory aggregation and expose totals via `system` tool diagnostics. 3. Document privacy stance (no task content logged). | Structured Logging v1 for consistent metadata. | New unit tests for metrics aggregation; bench run via `npm test`. |
| Cache Warm-Up Spike | Decide if pre-load is worth cost | 1. Prototype warm-up call for `projects` and `tags` only, behind env flag. 2. Measure startup latency and cache hit rate across 5 runs. 3. Publish findings in `/docs/cache-warmup-spike.md`. | Requires metrics seed to capture hit/miss deltas. | Manual timing capture; remove spike flag if not adopted. |
| Documentation Cross-Links | Clarify prompt/manual split | 1. Update `prompts/README.md` and `src/prompts/README.md` with cross references. 2. Note MCP prompt listing command (planned mid-term) as future work. | None | Markdown lint; reviewer confirmation. |

## Mid-Term (2–6 weeks)
| Initiative | Outcome | Key Tasks | Dependencies | Validation |
| --- | --- | --- | --- | --- |
| Batch Operations Foundation | Reliable multi-entity create/update with rollback semantics | 1. Design OmniAutomation scripts for bulk operations with deterministic ordering. 2. Implement temporary ID resolution plan (local map → OmniFocus IDs). 3. Add partial failure reporting structure and tests using mocked scripts. 4. Gate under `experimental` flag until real-world validation. | Requires metrics + error taxonomy to observe failures; ensure permissions coverage. | Integration test harness using synthetic data plus manual project creation exercise. |
| Field-Scoped Task Queries | Reduce payload size for LLM usage | 1. Extend `tasks` schema to accept optional `fields` array. 2. Limit field projection inside JXA script rather than TypeScript post-processing. 3. Update cache keys to incorporate requested field set. | Cache Warm-Up spike results (to avoid unexpected cache blow-up). | Unit tests verifying payload shaping; run `npm run lint` to confirm schema changes. |
| Perspective View Tool | Bring OmniFocus perspective insight into MCP | 1. Audit existing perspective scripts, confirm feasible metadata extraction. 2. Build `get_perspective_view` with safe defaults (limit, formatting off by default). 3. Reuse cache manager categories to avoid thrashing. | Field-Scoped Task Queries, because perspective output likely shares data paths. | Manual validation against built-in perspectives; golden file test for sample output. |
| Structured Logging v2 | Exportable logs + user toggles | 1. Add configurable log sink (stdout JSON vs rolling file) with size guard. 2. Surface toggle via `system` tool. 3. Document usage in `/docs/logging.md`. | Builds on v1. | Confirm log rotation under load test script. |

## Investigation Backlog (Timeboxed Research 1–2 weeks each)
| Topic | Questions to Answer | Exit Criteria |
| --- | --- | --- |
| Cursor-Based Pagination | Can JXA fetch deterministic slices without re-querying entire task set? What metadata must be cached per cursor? | Prototype against ≥5k task dataset, produce doc with feasibility verdict and estimated engineering cost. |
| Webhook or Change Notifications | Does OmniFocus expose File System Events or AppleScript hooks we can poll without violating sandbox rules? | Written summary of available APIs; if none, archive feature with rationale. |
| Attachment Access | Identify read-only pathways for attachments within JXA and MCP payload limits. | Determine if attachments can be streamed safely; otherwise record limitation. |
| Real LLM Bridge Testing | Determine tooling (Ollama bridge vs simulator) and resource footprint for CI. | Pilot run using small local model; capture setup script + pros/cons. |

## Deferred / Archive for Now
- **Plugin Architecture**: High engineering cost and requires untrusted code execution model; revisit only with paying customers requesting extensibility.
- **Complete Database Export**: Large output exceeds MCP payload comfort; re-evaluate after pagination research and attachment investigation settle.
- **Workflow Automation Bundles**: Depend on reliable batch operations; wait until foundation ships and we have telemetry on task editing reliability.

## Supporting Workstreams
- **Testing & QA**: Add targeted Vitest suites when tools gain new modes; schedule monthly manual OmniFocus regression checklist until integration tests are automated.
- **Metrics & Reporting**: Once Usage Metrics Seed is stable, plan exporting snapshots via `system` tool for performance dashboards.
- **Documentation**: Every shipped feature must add user guidance and note OmniFocus permission implications in `/docs/`.

---
This roadmap favors incremental delivery with explicit research spikes so the team can reassess scope once feasibility is proven, avoiding one-shot large bets that depend on unavailable OmniFocus capabilities.
