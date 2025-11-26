# Plan Status Summary

**Last Updated:** 2025-11-26

This document tracks the status of all implementation plans in this directory.

---

## Fully Implemented

*The following plans have been fully implemented and are now stored in `docs/plans/completed/`.*

- 2025-11-04-three-tool-builder-api-design.md (moved)
- 2025-11-04-three-tool-builder-api-implementation.md (moved)
- 2025-11-24-ast-filter-contracts-design.md (moved)

---
**Status:** ✅ Mostly Implemented (v3.0.0)
**What was built:**
- Phase 1: ID filter bug fixed and verified
- Phase 2: Branch renamed, terminology updated
- Phase 3: Code cleanup (partial)
- Phase 4: PR created and merged to main

**Remaining (optional/low priority):**
- Some TODO comments may still exist
- Commit history cleanup was skipped (risky)

---

### 2025-10-16-omnifocus-4.7-upgrade.md
**Status:** ✅ Partially Implemented
**What was built:**
- Planned Dates: Implemented in ManageTaskTool
- Date schemas module
- Version detection

**Remaining unimplemented:**
- Mutually Exclusive Tags: Read/toggle functionality (MEDIUM)
- Enhanced Repeats: User-intent keywords translating to RRULE (LOW - current RRULE works)

---

## Partially Implemented

### 2025-11-06-script-helper-consolidation-design.md
**Status:** 🟡 Phase 1 Complete, Phase 2 In Progress
**Related:** `2025-11-06-phase1-script-consolidation.md` (detailed implementation plan - ✅ executed)
**What was built:**
- Script consolidation (62 → 57 scripts)
- OmniJS bridge conversions (13-67x performance gains)
- Comprehensive helper analysis
- Call graph and script inventory documentation

**Remaining (Phase 2B/2C):**
- Modular helper architecture
- ~~Delete zero-usage functions (271 LOC)~~ - ✅ **COMPLETED 2025-11-26** (7/9 already deleted, 1 used internally, 1 remaining deleted)
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

## Not Started / External

### 2025-10-18-multi-machine-session-sync.md
**Status:** ⚪ Moved to Separate Repository
**Related:** `README-MULTI-MACHINE-SYNC.md` (quick reference)
**Notes:** Design was finalized and moved to `/Users/kip/src/multi-machine-claude-resume` - a general-purpose tool for managing work across multiple machines. Not mixed with OmniFocus MCP code.

---

### 2025-10-29-lightweight-testing-strategy-design.md
**Status:** ❌ Not Implemented
**What was designed:**
- Two-phase auto-transition testing
- Lightweight pass (all 31 tools, concise output)
- Automatic detailed investigation for failures

**Notes:** TESTING_PROMPT_LIGHTWEIGHT.md was never created. Current testing uses verbose prompts.

---

## Recently Completed (2025-11-24 Session)

### 2025-11-24-ast-filter-contracts-design.md
**Status:** ✅ Fully Implemented
**What was built:**
- Complete AST-based contract system for filters and mutations
- Type-safe builders (ASTBuilder) with validation
- Dual emitters: JXA and OmniJS code generation
- Filter generator with operator support
- Mutation script builder with proper escaping
- 172 unit tests covering all components

**Files created:**
- `src/contracts/ast/` - Complete AST system (10 files)
- `tests/unit/contracts/ast/` - Comprehensive test coverage

---

### 2025-11-24-tiered-test-pipeline-design.md
**Status:** ✅ Fully Implemented
**What was built:**
- Unit tests (5s) - Pure TypeScript logic, watch mode
- Smoke tests (21s) - Minimal OmniFocus sanity check
- Integration tests (6min) - Complete validation
- Pre-commit hook running unit + smoke (27s total)
- npm scripts: test:watch, test:smoke, test:pre-commit, test:ci

**Files created:**
- `tests/smoke/omnifocus-sanity.test.ts`
- Updated `package.json` with tiered scripts

---

### 2025-11-24 Performance Optimizations
**Status:** ✅ Completed
**What was fixed:**
- Today's agenda: 36s → 5s (OmniJS bridge pattern)
- Overdue tasks: 28s → 5s (OmniJS bridge pattern)
- Delete task: 27s → 1s (O(1) Task.byIdentifier lookup)
- Bulk delete: 60s+ → <1s (same O(1) pattern)

**Pattern:** Replaced JXA property access (~1-2ms per call) with OmniJS bridge using evaluateJavascript() for 100x+ speedup.

---

### 2025-11-24 Lightweight Testing Prompt
**Status:** ✅ Completed
**What was built:**
- Modern testing approach for v3.0 unified API
- 10 real-world scenario tests (vs 31 tools in old approach)
- Pre-flight automated test integration
- One-line output format: ~8-12k tokens (85% reduction from verbose)
- Comparison table: Smoke (21s) vs Lightweight Manual (5-10min) vs Integration (6min) vs Full Manual (15-20min)

**File:** `TESTING_PROMPT_LIGHTWEIGHT.md`

---

### 2025-11-24-querycompiler-taskfilter-integration.md
**Status:** ✅ Superseded by AST Contracts
**Note:** Original design evolved into the broader AST contracts system above

---

### 2025-11-24-querycompiler-taskfilter-implementation.md
**Status:** ✅ Superseded by AST Contracts
**Note:** Implementation plan evolved into AST contracts implementation

---

## Unimplemented Good Ideas (Prioritized)

### HIGH Priority
~~1. **Contracts System Integration**~~ - ✅ **COMPLETED 2025-11-24** - AST-based contracts with validation, builders, and dual emitters

### MEDIUM Priority
~~2. **Lightweight Testing Prompt**~~ - ✅ **COMPLETED 2025-11-24** - Integrated with automated tests, modern v3.0 approach
~~3. **Dry-run Mode for Bulk Operations**~~ - ✅ **COMPLETED 2025-11-26** - Preview before executing bulk updates
4. **REPL/CLI Tool** - Interactive OmniFocus automation without MCP
5. **Mutually Exclusive Tags Support** - OmniFocus 4.7 feature

### LOW Priority
6. **Human-friendly Text Syntax** - DSL text layer on top of JSON
7. **Enhanced Repeats (Intent Keywords)** - "when-marked-done" translating to RRULE
8. **Transaction Support** - Multi-operation atomicity
9. **Query Optimization Engine** - Auto-apply performance patterns

### Consolidation Work (from Phase 2B/2C)
~~10. **Delete Zero-Usage Functions**~~ - ✅ **COMPLETED 2025-11-26** - Most already deleted, 1 remaining removed
11. **Delete Duplicate Functions** - 79 LOC consolidation
12. **Convert 28 Scripts to OmniJS v3** - Performance gains (if needed)
13. **Modular Helper Architecture** - Clean separation of concerns

---

## Next Development Target Analysis (2025-11-26)

**Context:** Codebase cleanup complete. Development velocity infrastructure excellent (5s unit tests, 27s pre-commit).

**Top Candidates:**

### ~~🥇 Option 1: Delete Zero-Usage Functions~~ - ✅ **COMPLETED 2025-11-26**
- 7 of 9 functions were already deleted in prior sessions
- 1 function (`getTagsViaBridge`) found to be used internally (not zero-usage)
- 1 remaining function (`translateRepeatIntent`) + entire `repeat-translation.ts` file deleted
- Also removed orphaned `list-tasks.ts.backup` file

### ~~🥇 Option 2: Performance Audit - list-projects~~ - ✅ **COMPLETED 2025-11-26**
- Profiled list-projects: 12-14s for 50 projects (271ms/project)
- Created `list-projects-v3.ts` using OmniJS bridge pattern
- Direct script: 900ms for 50 projects (**15x faster**)
- Integrated into ProjectsTool: 4.2s first call, 2.9s subsequent (**3-4x faster** via MCP)
- Files: `src/omnifocus/scripts/projects/list-projects-v3.ts`

### ~~🥉 Option 3: Lightweight Testing Prompt~~ - ✅ **COMPLETED 2025-11-24**
- Created `TESTING_PROMPT_LIGHTWEIGHT.md` with modern v3.0 approach
- 10 tests covering real-world scenarios
- Integrates with automated smoke + integration tests

### ~~🥇 Option 4: Dry-run Mode for Bulk Operations~~ - ✅ **COMPLETED 2025-11-26**
- Added `dryRun: boolean` flag to `batch` and `bulk_delete` operations
- When `dryRun: true`, returns preview of what WOULD happen without executing
- Validates inputs and detects issues (duplicate tempIds, orphan parentTempIds)
- Warns for large batches (>50 items)
- Files modified: `write-schema.ts`, `MutationCompiler.ts`, `OmniFocusWriteTool.ts`
- New tests: `tests/unit/tools/unified/write-dry-run.test.ts` (8 tests)
- Design doc: `docs/plans/2025-11-26-dry-run-mode-design.md`

---

## Next Recommendations

**Top Candidates for Next Session:**
1. **REPL/CLI Tool** - Interactive OmniFocus automation without MCP
2. **Mutually Exclusive Tags Support** - OmniFocus 4.7 feature
3. **Performance Audit** - Continue with export, reviews, or other scripts
4. **Delete Duplicate Functions** - 79 LOC consolidation (from Phase 2B/2C)
