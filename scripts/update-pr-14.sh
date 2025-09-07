#!/usr/bin/env bash
set -euo pipefail

# Update PR #14 description with the finalized v2 migration details using GitHub CLI.
# Prereqs: gh authenticated and pointing to the correct repo remote.

PR_NUMBER=${PR_NUMBER:-14}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: required command '$1' not found in PATH" >&2
    exit 127
  }
}

require_cmd gh

# Verify PR exists (best-effort)
if ! gh pr view "$PR_NUMBER" >/dev/null 2>&1; then
  echo "Error: PR #$PR_NUMBER not found or no permission." >&2
  exit 1
fi

tmpfile=$(mktemp -t pr14-body.XXXXXX.md)
trap 'rm -f "$tmpfile"' EXIT

cat >"$tmpfile" <<'PR_BODY'
Title
migrate: complete v2 response-format migration across tools; standardize ScriptResult handling; fix OmniAutomation wrapping

Overview
This PR completes the v2 migration across the OmniFocus MCP server and standardizes response shapes to the v2, summary‑first format. It also finalizes ScriptResult handling and brings OmniAutomation.execute into spec.

Highlights
- Tools fully migrated to v2 helpers (createSuccessResponseV2/createErrorResponseV2 + OperationTimerV2):
  - Analytics: ProductivityStatsToolV2, TaskVelocityToolV2, OverdueAnalysisToolV2, WorkflowAnalysisTool
  - Tasks: QueryTasksToolV2, CreateTaskTool, UpdateTaskTool, CompleteTaskTool, DeleteTaskTool, ManageTaskTool (dispatcher)
  - Projects: ProjectsToolV2
  - Tags: TagsToolV2
  - Reviews: ManageReviewsTool
  - Folders: QueryFoldersTool, ManageFolderTool, FoldersTool (dispatcher)
  - Export: ExportTasksTool, ExportProjectsTool, BulkExportTool
  - System: SystemToolV2
  - Perspectives: PerspectivesToolV2
- OmniAutomation.execute: compliant with unit test spec
  - Wrap only if no IIFE and no Application('OmniFocus')
  - Close(code===0): empty → null; JSON → parsed; parse error → if “{”/“[” then OmniAutomationError(Invalid JSON), else resolve raw string
  - Close(code!==0): OmniAutomationError with code
  - Dynamic child_process import for reliable Vitest mocking

Compatibility
- Unit tests updated where they mocked response-format.js to now mock response-format-v2.js (folders + export suites).
- ManageTaskTool, RecurringTasksTool, SystemToolV2, PerspectivesToolV2 now return v2 responses; tests updated accordingly.
- BaseTool retains handleError (v1) for legacy use; added handleErrorV2 for tools that need v2 error shapes.

Scope of changes (selected)
- Core
  - src/omnifocus/OmniAutomation.ts
  - src/tools/base.ts (+ handleErrorV2)
- Tools (migrated to v2)
  - src/tools/tasks/{CreateTaskTool,UpdateTaskTool,CompleteTaskTool,DeleteTaskTool,ManageTaskTool}.ts
  - src/tools/tasks/QueryTasksToolV2.ts (smart_suggest scoring: due-today recognition and inclusion)
  - src/tools/projects/ProjectsToolV2.ts
  - src/tools/analytics/{ProductivityStatsToolV2,TaskVelocityToolV2,OverdueAnalysisToolV2,WorkflowAnalysisTool}.ts
  - src/tools/tags/TagsToolV2.ts
  - src/tools/reviews/ManageReviewsTool.ts
  - src/tools/folders/{QueryFoldersTool,ManageFolderTool,FoldersTool}.ts
  - src/tools/export/{ExportTasksTool,ExportProjectsTool,BulkExportTool,ExportTool}.ts
  - src/tools/system/SystemToolV2.ts
  - src/tools/perspectives/PerspectivesToolV2.ts
- Tests (updated)
  - response‑format‑consistency, task‑crud, projects, smart‑suggest, tags‑v2, folders, export, system, perspectives

Behavior changes
- All migrated tools now emit v2 responses:
  - success: true with data and summary‑first metadata (where applicable)
  - success: false with error { code, message, suggestion?, details? }
- ManageTaskTool, RecurringTasksTool, SystemToolV2, PerspectivesToolV2 validations and errors use v2.
- QueryTasks smart_suggest: ensure due‑today tasks are surfaced (if present) and strip _score.

Tests
- Full unit suite (safe mode): 48 files passed, 2 skipped; 688 tests passed, 13 skipped; 0 failed.
  - Command: VITEST_SAFE=1 ./node_modules/.bin/vitest tests/unit --run
  - Logs produced during migration: logs/unit.final.allv2.txt

Developer notes
- BaseTool: added handleErrorV2 to return v2 errors without modifying existing handleError paths.
- Left v1 response‑format.ts/types available for legacy/internal references; all tools now operate via v2.
- Dynamic import of node:child_process in OmniAutomation avoids test mock timing issues under ESM.

Conventional commit summary (for squash)
- feat: migrate remaining tools to v2 response format and timers
- feat: add BaseTool.handleErrorV2 for v2 error responses
- fix(OmniAutomation): wrapping + parse/close behavior to match tests
- test: update folders/export/perspectives/system/task‑crud tests for v2 helpers
- chore: remove stray StandardResponse imports from v2 tools

Follow‑ups
- Coverage bump PR to lift Statements/Lines ≥ 85% with a few targeted tests (ProjectsToolV2 error branch, UpdateTaskTool JSON‑string paths, QueryFoldersTool error branches).
- Docs: add MIGRATION_V2.md; mark v1 helpers legacy in docs.
PR_BODY

# Update PR title and body
gh pr edit "$PR_NUMBER" --title "migrate: complete v2 response-format migration; OmniAutomation fixes; tests green" --body-file "$tmpfile"

# Optional: leave a short comment for reviewers
gh pr comment "$PR_NUMBER" --body "Updated PR description with finalized v2 migration details, OmniAutomation behavior, and test status."

echo "PR #$PR_NUMBER updated."

