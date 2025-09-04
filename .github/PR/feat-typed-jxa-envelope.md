Title: bridge: typed JXA envelope + analytics v2 adoption (Overdue)

Summary
- Add a strict JSON envelope for JXA → Node boundary `{ ok: true|false, data|error, v }`.
- Introduce `executeTyped()` in `OmniAutomation` that parses the envelope and validates payloads with Zod.
- Convert `analyze-overdue-optimized` JXA script to return the new envelope.
- Adopt typed boundary in `OverdueAnalysisToolV2` with a precise schema, removing unsafe `any` accesses.
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
- src/tools/analytics/OverdueAnalysisToolV2.ts: add strict Zod schema for overdue payload and use `executeTyped`.
- tsconfig.json: enable `useUnknownInCatchVariables`.
- eslint.config.js: boundary override for JXA/scripts.

Risk & Compatibility
- Overdue analysis now expects the new envelope shape; the script has been updated accordingly.
- Other scripts still return legacy shapes; they continue to use `executeJson()` or existing code paths. No global breaking changes.

Testing Notes (manual)
- Build: `npm run build`.
- MCP quick check (stdio exit expected):
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js | jq -r '.result.tools | length'
- Invoke analyze_overdue via inspector:
  npx @modelcontextprotocol/inspector dist/index.js
  → call `analyze_overdue` with defaults; verify JSON payload contains `stats.summary.totalOverdue`, `groupedAnalysis.project`, and `metadata.generated_at`.

Follow‑ups
- Migrate remaining analytics tools (`TaskVelocityToolV2`, `ProductivityStatsToolV2`, `PatternAnalysisTool`) to the new envelope.
- Add a small adapter for legacy script results to ease migration.
- Extend union schemas for analytics (`kind` + `schemaVersion`) and register per-tool schemas.

Impact on lint/type warnings
- Removes several `any` usages in analytics and bridge.
- Establishes a template to remove the majority of the remaining 275 unexpected any warnings.

