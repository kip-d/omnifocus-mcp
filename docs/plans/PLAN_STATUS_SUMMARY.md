# Plan Status Summary

**Last Updated:** 2025-11-26

This document tracks the status of all implementation plans in this directory.

---

## Fully Implemented (Moved to `completed/`)

| Plan | Status | Notes |
|------|--------|-------|
| 2025-11-04-three-tool-builder-api-design.md | ✅ Shipped v3.0.0 | Unified API design |
| 2025-11-04-three-tool-builder-api-implementation.md | ✅ Shipped v3.0.0 | Implementation steps |
| 2025-11-24-ast-filter-contracts-design.md | ✅ Complete | AST-based contracts system |
| 2025-11-06-unified-api-cleanup-plan.md | ✅ Complete | ID filter fix, merged to main |
| 2025-11-24-tiered-test-pipeline-design.md | ✅ Complete | Unit/smoke/integration tiers |
| 2025-11-26-dry-run-mode-design.md | ✅ Complete | Preview bulk operations |

---

## Partially Implemented

### 2025-01-04-omnifocus-dsl-design.md
**Status:** 🟡 Partially Implemented (v3.0.0)
**What was built:**
- Unified API: `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`
- JSON-based query syntax implemented exactly as designed
- QueryCompiler, MutationCompiler, AnalysisCompiler routing layer
- Contracts system for type safety

**Remaining (future work):**
- Human-friendly text syntax (DSL text layer on top of JSON) - LOW priority
- Direct script generation from DSL (currently routes to existing tools)

---

### 2025-10-16-omnifocus-4.7-upgrade.md
**Status:** 🟡 Partially Implemented
**What was built:**
- Planned Dates: Implemented in ManageTaskTool
- Date schemas module
- Version detection

**Remaining unimplemented:**
- Mutually Exclusive Tags: Read/toggle functionality (MEDIUM)
- Enhanced Repeats: User-intent keywords translating to RRULE (LOW - current RRULE works)

---

### 2025-11-06-script-helper-consolidation-design.md
**Status:** 🟡 Phase 1 Complete, Phase 2 Partially Done
**Related:** `2025-11-06-phase1-script-consolidation.md` (executed)
**What was built:**
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
**Status:** 🟡 Phase 2A Complete
**What was built:**
- Helper inventory and categorization
- Usage analysis
- Quick wins identified

**Remaining (Phase 2B/2C):**
- Design modular helper architecture
- Implement helper modules
- Migrate scripts to new helpers

---

## Superseded

### 2025-10-29-lightweight-testing-strategy-design.md
**Status:** ✅ Superseded
**Superseded By:** `2025-11-24-tiered-test-pipeline-design.md` + `TESTING_PROMPT_LIGHTWEIGHT.md`
**Notes:** Core ideas incorporated into tiered test pipeline (automated) and lightweight testing prompt (manual v3.0 approach).

---

### 2025-11-24-querycompiler-taskfilter-integration.md
**Status:** ✅ Superseded
**Superseded By:** AST Contracts system
**Notes:** Original design evolved into the broader AST contracts system.

---

### 2025-11-24-querycompiler-taskfilter-implementation.md
**Status:** ✅ Superseded
**Superseded By:** AST Contracts system
**Notes:** Implementation plan evolved into AST contracts implementation.

---

## Not Started (Ready for Implementation)

### 2025-11-24-ast-consolidation-opportunities.md
**Status:** ⚪ Analysis Complete - Ready for Implementation
**Key Finding:** AST-powered `list-tasks-ast.ts` exists (74% smaller) but isn't being used yet!
**Effort:** LOW - Just swap imports
**Potential:** 571 → 146 lines (74% reduction)

---

### 2025-11-25-phase3-ast-extension-design.md
**Status:** ⚪ Approved - Ready for Implementation
**Scope:** Extend AST to support ProjectFilter, TagQueryOptions, export-tasks
**Estimated reduction:** ~773 lines (87% of target scripts)
**Effort:** MEDIUM

---

## External / Moved

### 2025-10-18-multi-machine-session-sync.md
**Status:** ⚪ Moved to Separate Repository
**Related:** `README-MULTI-MACHINE-SYNC.md` (quick reference)
**Location:** `/Users/kip/src/multi-machine-claude-resume`
**Notes:** General-purpose tool for managing work across multiple machines. Not mixed with OmniFocus MCP code.

---

## Reference Documents (Not Implementation Plans)

- `things-to-check-out.md` - Ideas and research topics
- `README-MULTI-MACHINE-SYNC.md` - Quick reference for multi-machine sync

---

## Unimplemented Good Ideas (Prioritized)

### HIGH Priority
*(None currently - recent sessions cleared the high priority backlog)*

### MEDIUM Priority
1. **AST Consolidation** - Switch to `list-tasks-ast.ts` (LOW effort, 74% code reduction)
2. **Phase 3 AST Extension** - ProjectFilter, TagQueryOptions (MEDIUM effort)
3. **REPL/CLI Tool** - Interactive OmniFocus automation without MCP
4. **Mutually Exclusive Tags Support** - OmniFocus 4.7 feature

### LOW Priority
5. **Human-friendly Text Syntax** - DSL text layer on top of JSON
6. **Enhanced Repeats (Intent Keywords)** - "when-marked-done" translating to RRULE
7. **Transaction Support** - Multi-operation atomicity
8. **Query Optimization Engine** - Auto-apply performance patterns

### Consolidation Work (from Phase 2B/2C)
9. **Delete Duplicate Functions** - 79 LOC consolidation
10. **Convert 28 Scripts to OmniJS v3** - Performance gains (if needed)
11. **Modular Helper Architecture** - Clean separation of concerns

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

## Next Recommendations

**Quick Win (Next Session):**
1. **AST Consolidation** - Switch to `list-tasks-ast.ts` (5 min, huge code reduction)

**Feature Work:**
2. **Phase 3 AST Extension** - If more code reduction desired
3. **REPL/CLI Tool** - If interactive automation needed
4. **Mutually Exclusive Tags** - If OmniFocus 4.7 features needed
