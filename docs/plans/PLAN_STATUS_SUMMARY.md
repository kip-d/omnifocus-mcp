# Plan Status Summary

**Last Updated:** 2026-01-02

This document tracks the status of all implementation plans in this directory.

---

## Fully Implemented (Archived to `.archive/plans-completed/`)

| Plan                                                | Status            | Notes                                |
| --------------------------------------------------- | ----------------- | ------------------------------------ |
| 2025-11-04-three-tool-builder-api-design.md         | ✅ Shipped v3.0.0 | Unified API design                   |
| 2025-11-04-three-tool-builder-api-implementation.md | ✅ Shipped v3.0.0 | Implementation steps                 |
| 2025-11-24-ast-filter-contracts-design.md           | ✅ Complete       | AST-based contracts system           |
| 2025-11-06-unified-api-cleanup-plan.md              | ✅ Complete       | ID filter fix, merged to main        |
| 2025-11-24-tiered-test-pipeline-design.md           | ✅ Complete       | Unit/smoke/integration tiers         |
| 2025-11-26-dry-run-mode-design.md                   | ✅ Complete       | Preview bulk operations              |
| 2025-11-24-ast-consolidation-opportunities.md       | ✅ Complete       | All 4 phases done, 2600 LOC saved    |
| 2025-11-25-phase3-ast-extension-design.md           | ✅ Complete       | ProjectFilter, TagQueryOptions       |
| 2025-10-29-lightweight-testing-strategy-design.md   | ✅ Superseded     | By tiered-test-pipeline              |
| 2025-11-24-querycompiler-taskfilter-\*.md           | ✅ Superseded     | By AST Contracts system              |
| 2025-11-06-phase1-script-consolidation.md           | ✅ Complete       | Script consolidation done            |
| 2025-10-18-multi-machine-session-sync.md            | ✅ Moved          | To ~/src/multi-machine-claude-resume |

## Recently Archived (`.archive/plans-completed-dec-2025/`)

| Plan                                             | Status      | Notes                                     |
| ------------------------------------------------ | ----------- | ----------------------------------------- |
| 2025-12-04-streamable-http-transport-design.md   | ✅ Complete | HTTP server + tests implemented           |
| 2025-12-11-test-sandbox-design.md                | ✅ Complete | Sandbox manager + test client implemented |
| 2025-12-18-future-consolidation-opportunities.md | ✅ Complete | All items done (debug fields, exports)    |
| omnijs-migration-plan.md                         | ✅ Complete | All 3 phases done (2025-11-27)            |
| 2025-12-15-repetition-rule-investigation.md      | ✅ Complete | Investigation done, no bugs found         |

---

## Partially Implemented

### 2025-01-04-omnifocus-dsl-design.md

**Status:** 🟡 Partially Implemented (v3.0.0) **What was built:**

- Unified API: `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`
- JSON-based query syntax implemented exactly as designed
- QueryCompiler, MutationCompiler, AnalysisCompiler routing layer
- Contracts system for type safety

**Remaining (future work):**

- Human-friendly text syntax (DSL text layer on top of JSON) - LOW priority
- Direct script generation from DSL (currently routes to existing tools)

---

### OmniFocus 4.7+ Features

**Status:** 🟡 Partially Implemented **What was built:**

- Planned Dates: Implemented in ManageTaskTool
- Date schemas module
- Version detection
- repetitionRule support in updates

**Remaining unimplemented:**

- Mutually Exclusive Tags: Read/toggle functionality (MEDIUM)
- Enhanced Repeats: User-intent keywords translating to RRULE (LOW - current RRULE works)

---

### 2025-11-06-script-helper-consolidation-design.md

**Status:** 🟡 Phase 1 Complete, Phase 2 Partially Done **Related:** `2025-11-06-phase1-script-consolidation.md`
(executed) **What was built:**

- Script consolidation (62 → 57 scripts)
- OmniJS bridge conversions (13-67x performance gains)
- Comprehensive helper analysis
- ~~Delete zero-usage functions~~ ✅ COMPLETED 2025-11-26

**Remaining (Phase 2B/2C):**

- Modular helper architecture
- Delete duplicate functions (79 LOC)
- Convert remaining 28 scripts to OmniJS v3

---

### 2025-11-07-phase2-helper-refactoring-foundation.md

**Status:** 🟡 Phase 2A Complete **What was built:**

- Helper inventory and categorization
- Usage analysis
- Quick wins identified

**Remaining (Phase 2B/2C):**

- Design modular helper architecture
- Implement helper modules
- Migrate scripts to new helpers

---

## Reference Documents (Not Implementation Plans)

- `things-to-check-out.md` - Ideas and research topics
- `README-MULTI-MACHINE-SYNC.md` - Quick reference for multi-machine sync

---

## Unimplemented Good Ideas (Prioritized)

### HIGH Priority

_(None currently - recent sessions cleared the high priority backlog)_

### MEDIUM Priority

1. **REPL/CLI Tool** - Interactive OmniFocus automation without MCP
2. **Mutually Exclusive Tags Support** - OmniFocus 4.7 feature

### LOW Priority

3. **Human-friendly Text Syntax** - DSL text layer on top of JSON
4. **Enhanced Repeats (Intent Keywords)** - "when-marked-done" translating to RRULE
5. **Transaction Support** - Multi-operation atomicity
6. **Query Optimization Engine** - Auto-apply performance patterns

### Consolidation Work (from Phase 2B/2C)

7. **Delete Duplicate Functions** - 79 LOC consolidation
8. **Convert remaining scripts to OmniJS v3** - Performance gains (if needed)
9. **Modular Helper Architecture** - Clean separation of concerns

---

## Recently Completed (2025-11-26 Session)

### Dry-run Mode for Bulk Operations

- Added `dryRun: boolean` flag to `batch` and `bulk_delete` operations
- When `dryRun: true`, returns preview of what WOULD happen without executing
- Validates inputs: detects duplicate tempIds, orphan parentTempIds
- Warns for large batches (>50 items)
- Files: `write-schema.ts`, `MutationCompiler.ts`, `OmniFocusWriteTool.ts`
- Tests: `tests/unit/tools/unified/write-dry-run.test.ts` (8 tests)

### list-projects-v3 Performance Optimization

- Created `list-projects-v3.ts` using OmniJS bridge pattern
- Direct script: 900ms for 50 projects (was 12-14s, **15x faster**)
- Integrated into ProjectsTool: 4.2s first call, 2.9s subsequent

### Response Format Documentation

- Added "Response Format Standards" section to `docs/dev/DEVELOPER_GUIDE.md`
- Documents two-layer system: ScriptResult + StandardResponseV2
- Covers type guards, factory functions, best practices

### Codebase Cleanup

- Deleted unused `repeat-translation.ts` and tests
- Deleted orphaned `list-tasks.ts.backup`
- Fixed ProjectsTool test mocks for v3 response format

---

## Recently Completed (December 2025 - January 2026)

### AST Consolidation (All 4 Phases Complete - 2025-12-17/18)

- **Phase 1:** QueryTasksTool uses `buildListTasksScriptV4` (571→146 lines, 74% reduction)
- **Phase 2:** All mutation tools use AST builders (~1,100 lines archived)
- **Phase 3:** Query tools (Projects, Tags) use AST builders (~570 lines reduced)
- **Phase 4:** RecurringTasksTool uses AST builders (500 lines archived)
- **Total:** ~2,600 lines archived/reduced

### January 2026 Fixes

- **Count-only query optimization** - Pure JXA, 40x faster than OmniJS bridge
- **plannedDate support** - Added to task update operations
- **repetitionRule support** - Added to task update operations
- **AST builder fixes** - Text search checks both name AND note, date operators respected
- **ESLint config** - Both tsconfigs referenced for type-aware test linting
- **Path cleanup** - Removed hardcoded /Users/kip paths from codebase

---

## Next Recommendations

**Feature Work:**

1. **REPL/CLI Tool** - If interactive automation needed
2. **Mutually Exclusive Tags** - If OmniFocus 4.7 features needed
3. **Human-friendly Text Syntax** - If DSL text layer desired
