# MCP Failure Triage

_Generated at: 2026-05-18T19:45:50.071Z_

## Diagnosed Patterns

| Fingerprint | Tool | Classification | Suggested fix | First seen | Last seen | Count |
| ----------- | ---- | -------------- | ------------- | ---------- | --------- | ----- |

## Legend

| Classification    | Meaning                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| SCHEMA_DRIFT      | advertised inputSchema diverged from Zod validation — deterministic                                                  |
| COERCION_MISSING  | numeric field present in advertised schema, Zod rejects string input — deterministic                                 |
| DESCRIPTION_GAP   | tool description unclear; LLM-adjudicated                                                                            |
| LLM_EXPLORATION   | no-op: LLM is probing the API; no fix required                                                                       |
| DATA_ERROR        | no-op: bad caller data; not a schema issue                                                                           |
| NEEDS_LLM         | agent not configured or unavailable — manual investigation required                                                  |
| CAP_GUARD_TRIPPED | auto-Linear filing skipped because open issue count >= cap threshold                                                 |
| FILE_FAILED       | one or more SCHEMA_DRIFT clusters could not be filed to Linear (createIssue rejected); successes were still ledgered |
