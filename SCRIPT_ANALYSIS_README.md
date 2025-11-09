# Script Analysis & Consolidation Documentation

## Overview

This directory contains comprehensive analysis of the OmniFocus MCP script codebase, identifying optimization opportunities, consolidation candidates, and architectural patterns.

## Documents Included

### 1. SCRIPT_INVENTORY.md (16 KB, 454 lines)
**Comprehensive inventory of all 62 scripts**

Contains:
- Complete directory breakdown with line counts
- Classification by operation type (CRUD, analysis, infrastructure)
- Duplicate/versioned script identification
- Architecture patterns analysis
- Complexity distribution metrics
- Dependency breakdown

**Use this for:** Understanding overall structure, identifying patterns, locating specific scripts

### 2. SCRIPT_DEPENDENCIES.md (8.5 KB, 286 lines)
**Detailed dependency analysis and helper usage**

Contains:
- Core helper usage map (which scripts use which helpers)
- Dependency depth classification
- Architecture dependency chains (how features flow through components)
- Cross-cutting concern analysis (date handling, tags, repetition)
- Shared logic extraction opportunities
- Quick reference tables for helper usage

**Use this for:** Understanding script dependencies, planning refactoring, identifying shared code

### 3. SCRIPT_QUICK_REFERENCE.md (6.8 KB, 292 lines)
**Quick lookup guide for developers**

Contains:
- Scripts organized by category (query, create, update, delete, analysis)
- Preferred vs deprecated versions marked
- Consolidation candidates highlighted
- Helper dependencies at-a-glance
- Performance notes and patterns
- Architecture decision tree for new scripts

**Use this for:** Quick lookups, finding relevant scripts, understanding best practices

### 4. CONSOLIDATION_ROADMAP.md (16 KB, 514 lines)
**Detailed implementation plan for consolidation**

Contains:
- Executive summary with effort/savings estimates
- 4 phases with specific tasks and timelines
- Detailed analysis for each consolidation
- Feature comparison tables
- Implementation steps with checkboxes
- Success criteria and metrics
- Rollback plan and risk assessment

**Use this for:** Planning consolidation work, assigning tasks, tracking progress

## Key Findings

### Codebase Statistics
- **Total scripts:** 62 files across 11 directories
- **Total operation code:** 11,489 lines of code
- **Duplicate/versioned code:** ~1,800 LOC (15.7%)
- **Shared helpers:** 10 modules providing core functionality
- **Bridge dependencies:** 25+ scripts use OmniJS bridge

### Top Consolidation Opportunities

#### Critical (2-3 hours, saves 650+ LOC)
1. Merge create-task.ts + create-task-with-bridge.ts (219 LOC)
2. Consolidate list-tasks variants (437-495 LOC, 13-22x performance gain)

#### High Priority (4-5 hours, saves 750+ LOC)
3. Merge productivity-stats v1 + v3 (280-304 LOC)
4. Merge task-velocity v1 + v3 (154-164 LOC)
5. Consolidate list-tags v1 + v3 (240-286 LOC)

#### Medium Priority (4-5 hours, saves 300-400 LOC)
6. Extract analytics common patterns (200-300 LOC)
7. Extract date handling patterns (100-150 LOC)

#### Low Priority (1-2 hours, saves 200+ LOC)
8. Audit unused code (date-range-queries.ts, etc.)
9. Consolidate routing files

### Performance Implications
- **list-tasks consolidation:** 13-22x faster (1-5 second vs 13-22 second)
- **tags consolidation:** 96.3% optimized (26.7x speedup documented)
- **analytics:** No regression expected from consolidation

## Implementation Approach

1. **Start with documentation review**
   - Read SCRIPT_INVENTORY.md for overall structure
   - Read SCRIPT_QUICK_REFERENCE.md to understand patterns
   - Read SCRIPT_DEPENDENCIES.md for interaction points

2. **Plan consolidation phase**
   - Refer to CONSOLIDATION_ROADMAP.md
   - Start with Phase 1 (critical duplicates)
   - 1 consolidation at a time

3. **Execute consolidation**
   - Follow specific steps in CONSOLIDATION_ROADMAP.md
   - Create feature branch for each phase
   - Test thoroughly before merging
   - Maintain git history (no force-push)

4. **Verify success**
   - Check all tests pass
   - Verify tool APIs unchanged
   - Measure performance improvements
   - Update documentation

## Statistics by Directory

| Directory | Files | LOC | Status |
|-----------|-------|-----|--------|
| tasks | 12 | 1,567 | Has duplicates |
| analytics | 10 | 2,289 | Has v3 variants |
| projects | 6 | 1,218 | Clean |
| tags | 3 | 1,096 | Has v3 variant |
| folders | 5 | 778 | Clean |
| perspectives | 3 | 480 | Clean |
| reviews | 3 | 450 | Clean |
| export | 2 | 561 | Clean |
| cache | 2 | 369 | Clean |
| system | 1 | 28 | Clean |
| recurring | - | 766 | Mixed |
| shared | 10 | - | Helpers |

## Helper Modules at a Glance

| Module | Size | Purpose | Usage |
|--------|------|---------|-------|
| helpers.ts | ~200 LOC | Core utilities | ALL 62 scripts |
| minimal-tag-bridge.ts | ~150 LOC | Tag assignment | 3 task scripts |
| repeat-helpers.ts | ~200 LOC | Repetition rules | 4 project/task scripts |
| date-fields-bridge.ts | ~100 LOC | Date enrichment | 1 list script |
| bridge-template.ts | ~100 LOC | Bridge operations | Update scripts |
| repeat-translation.ts | ~50 LOC | User intent conversion | Task/project creation |
| bridge-helpers.ts | ~100 LOC | Generic utilities | Legacy/sparse usage |
| helper-context.ts | ~50 LOC | Configuration | Framework |
| script-builder.ts | ~50 LOC | Script assembly | Potentially unused |

## Architecture Patterns

### Pattern Recognition
The codebase uses 4 main architectural patterns:

1. **Pure JXA** (Simple operations, <100 LOC)
   - Direct property access
   - Minimal error handling
   - Example: delete-task.ts, complete-task.ts

2. **JXA + Helpers** (Standard operations, 150-300 LOC)
   - Complex state management
   - Multiple helper imports
   - Example: create-task.ts, update-task.ts

3. **Mixed JXA + Bridge** (Complex operations, 250-750 LOC)
   - Filtering/analysis in JXA
   - Bulk operations via bridge
   - Example: workflow-analysis.ts, list-projects.ts

4. **Pure OmniJS Bridge** (Bulk operations, 100-500 LOC)
   - Collection iteration in bridge
   - Fixed-size scripts
   - Example: warm-task-caches.ts, complete-tasks-bulk.ts

### Performance Optimization History
- **Issue #27:** Embedded task IDs in scripts cause timeout
  - **Solution:** Fixed-size OmniJS scripts with template substitution
  - **Applied to:** list-tags.ts, warm-cache scripts
  - **Result:** 96.3% optimization (12.7s → 0.5s on M2 Air)

## Next Steps

1. **Read the documentation** (start with SCRIPT_QUICK_REFERENCE.md)
2. **Understand current architecture** (read SCRIPT_INVENTORY.md)
3. **Plan first consolidation** (review CONSOLIDATION_ROADMAP.md Phase 1)
4. **Execute Phase 1** (create-task merge, 1 hour effort)
5. **Iterate through phases** (weeks 1-4, ~10-12 hours total)

## Questions to Consider

- Which consolidations to prioritize?
- Should we tackle performance first (list-tasks) or code cleanup (create-task)?
- How aggressively should we extract shared patterns?
- Should unused code be archived or deleted?
- Are routing files still necessary with the unified API?

## References

- **Architecture Guide:** docs/dev/ARCHITECTURE.md
- **Pattern Index:** docs/dev/PATTERN_INDEX.md
- **Lessons Learned:** docs/dev/LESSONS_LEARNED.md
- **CLAUDE.md:** Project-level guidelines and instructions

---

**Analysis completed:** November 6, 2025
**Total documentation:** 1,546 lines across 4 files
**Estimated consolidation effort:** 10-12 hours
**Estimated code savings:** 1,400-1,600 LOC
