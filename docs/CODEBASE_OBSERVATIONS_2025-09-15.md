# Codebase Observations (2025-09-15)

## Repeat Rule Handling Gap
- `src/tools/tasks/ManageTaskTool.ts:188` builds `repeatRule` payloads for task creation, but `src/omnifocus/scripts/tasks/create-task.ts:118` explicitly skips applying repeat logic. Result: `manage_task` silently drops repeat metadata, contradicting schema expectations and current tests.

## Debug Logging Inconsistency
- `src/tools/tasks/ManageTaskTool.ts:190` and multiple paths in `src/omnifocus/OmniAutomation.ts` emit raw `console.error` diagnostics. Other modules rely on structured logging, so these ad-hoc statements skew CLI output and deviate from established patterns.

## Unused OmniAutomation Scripts
- Files such as `src/omnifocus/scripts/tasks/create-task-simple.ts`, `list-tasks-hybrid.ts`, `list-tasks-optimized.ts`, `todays-agenda-hybrid.ts`, and `todays-agenda-optimized.ts` are no longer referenced by the tool layer or tests. If they are no longer needed, consider archiving them; otherwise, document their current use to avoid rot.

## Dormant Cache Workflow Helper
- `CacheManager.refreshForWorkflow` (src/cache/CacheManager.ts:195) is unused in runtime code. Either wire it into tooling (per docs/PERFORMANCE.md) or remove it to reduce dead API surface.

## Context
- Remediation items for tags, recurring analyses, and hierarchy reliability already live in `docs/TODO_REMEDIATION_PLAN_TAGS_RECURRING_HIERARCHY.md` and remain the top functional priorities.
