# Developer Journey: Shrinking Script Size and Hardening Quoting

Date: 2025-09-03
Author: Codex CLI pairing with Kip

## Context
- OmniFocus MCP scripts had grown large due to helper injections (validation, recurrence, bridge utilities).
- Some evaluateJavascript snippets used string concatenation for identifiers, risking quoting/escaping issues.
- Failures surfaced around task creation and tasks listing when helper-heavy scripts exceeded the original 100KB cap.

## Goals
- Reduce script payloads without sacrificing functionality.
- Eliminate fragile string concatenation in bridge calls.
- Keep behavior stable and tests green while iterating.

## Decisions
- Temporary safety net: raise default `OMNIFOCUS_MAX_SCRIPT_SIZE` from 100KB to 300KB to prevent regressions while optimizing.
- Prefer minimal, purpose-built helper bundles per script rather than importing full helper suites.
- Standardize safe embedding for bridge IDs using `JSON.stringify(...)` where script strings are constructed.

## Changes Implemented
- Size reduction for create_task:
  - Added `getRecurrenceApplyHelpers()` (focused “apply-only” recurrence helpers).
  - Updated `src/omnifocus/scripts/tasks/create-task.ts` to use the minimal recurrence helpers + validation + bridge.
- Quoting hardening:
  - In create_task’s post-create verification, embed `taskId` via `JSON.stringify(taskId)` before `Task.byIdentifier(...)` when calling `app.evaluateJavascript`.
- Safety net:
  - `src/omnifocus/OmniAutomation.ts`: default max script size increased to 300KB (still overridable via `OMNIFOCUS_MAX_SCRIPT_SIZE`).

## Files Touched (this round)
- `src/omnifocus/OmniAutomation.ts`
- `src/omnifocus/scripts/shared/helpers.ts`
- `src/omnifocus/scripts/tasks/create-task.ts`

## Rationale & Tradeoffs
- Raising the cap buys time and prevents immediate failures while we trim scripts. The long-term goal is to keep scripts under conservative limits and remove the higher default.
- Minimal helper bundles reduce duplication and token bloat while keeping intent clear.
- Using `JSON.stringify(...)` for identifiers avoids brittle quoting/escaping across bridge boundaries.

## Validation
- Unit suite (quick safe subset): 611 tests passed post-changes.
- No API contract changes; tool responses unchanged.

## Next Steps (Proposed)
- Create minimal bridge bundles per script (only the functions that script needs), replacing `BRIDGE_HELPERS` where warranted.
- Switch create_task argument passing to `taskDataJson` + `JSON.parse(...)` inside the script to further reduce template expansion size.
- Audit other scripts that still use full recurrence helpers; migrate to minimal bundles as appropriate.
- When sizes are consistently under the original threshold, revert default max size back to 100KB.

## Rollback
- Revert the helper switch in `create-task.ts` to `getRecurrenceHelpers()` to restore prior behavior.
- Revert `OmniAutomation` max size line to 100KB default.

