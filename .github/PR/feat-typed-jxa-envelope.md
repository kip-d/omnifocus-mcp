Title: bridge: typed JXA envelope + analytics v2 adoption (Overdue + Velocity + Productivity + Patterns)

Summary
- Add a strict JSON envelope for JXA → Node boundary `{ ok: true|false, data|error, v }`.
- Introduce `executeTyped()` in `OmniAutomation` that parses the envelope and validates payloads with Zod.
- Convert optimized analytics JXA scripts to return the new envelope (`analyze-overdue-optimized`, `task-velocity`, `productivity-stats-optimized`, and the inline Pattern Analysis script builder).
- Adopt typed boundary in analytics tools (`OverdueAnalysisToolV2`, `TaskVelocityToolV2`, `ProductivityStatsToolV2`, `PatternAnalysisTool`) with precise Zod schemas; remove unsafe `any` access.
- Add `safe-io` utilities (JsonValue, envelope schema, safeLog/toError helpers).
- Tighten TS config (`useUnknownInCatchVariables`) and add a boundary ESLint override.

Motivation
- Quarantine true dynamism at the JXA/stdio boundary and move to “unknown-in, schema-out”.
- Reduce "Unexpected any" + unsafe member access across analytics and bridge layers.
- Establish a repeatable pattern to migrate other tools incrementally.

Key Changes
- src/utils/safe-io.ts: JSON envelope + helpers.
- src/omnifocus/OmniAutomation.ts: `executeTyped<T>()` and safer `executeJson()` usage of `unknown`.
- src/omnifocus/scripts/analytics/analyze-overdue-optimized.ts: return `{ ok, data|error, v }` envelope.
- src/omnifocus/scripts/analytics/task-velocity.ts: return envelope and structured errors.
- src/omnifocus/scripts/analytics/productivity-stats-optimized.ts: return envelope and structured errors.
- src/tools/analytics/OverdueAnalysisToolV2.ts: strict schema + `executeTyped`.
- src/tools/analytics/TaskVelocityToolV2.ts: strict schema + `executeTyped`; derives trend and peak day.
- src/tools/analytics/ProductivityStatsToolV2.ts: strict schema + `executeTyped`; maps to V2 response types.
- src/tools/analytics/PatternAnalysisTool.ts: inline JXA script now returns envelope; tool uses strict schema.
- tsconfig.json: enable `useUnknownInCatchVariables`.
- eslint.config.js: boundary override for JXA/scripts.

Risk & Compatibility
- Overdue analysis now expects the new envelope shape; the script has been updated accordingly.
- Other scripts still return legacy shapes; they continue to use `executeJson()` or existing code paths. No global breaking changes.

Testing Notes
- Build: `npm run build`.
- MCP quick check (stdio exit expected):
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js | jq -r '.result.tools | length'
- Invoke analyze_overdue via inspector:
  npx @modelcontextprotocol/inspector dist/index.js
  → call `analyze_overdue` with defaults; verify JSON payload contains `stats.summary.totalOverdue`, `groupedAnalysis.project`, and `metadata.generated_at`.
- Integration: `npm run test:integration` passed locally (see CI logs for stdout excerpts).

Follow‑ups
- Migrate remaining analytics tools (`TaskVelocityToolV2`, `ProductivityStatsToolV2`, `PatternAnalysisTool`) to the new envelope.
- Add a small adapter for legacy script results to ease migration.
- Extend union schemas for analytics (`kind` + `schemaVersion`) and register per-tool schemas.

Impact on lint/type warnings
- Removes many `any` usages in analytics and bridge.
- Typecheck is clean; ESLint shows warnings only in boundary/legacy scopes per override.
- Establishes a template to remove the majority of the remaining 275 unexpected any warnings.
