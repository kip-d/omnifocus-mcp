# OmniFocus MCP Script Inventory & Analysis

## Executive Summary

**Total Scripts:** 62 TypeScript files across 10 subdirectories **Total Lines of Code:** 11,489 (excluding shared
helpers) **Architecture:** Hybrid JXA + OmniJS Bridge with 10 shared helper modules **Key Finding:** Multiple
versioned/deprecated scripts exist - candidates for consolidation

---

## Directory Structure & Script Breakdown

### 1. TASKS (12 files, 1,567 LOC)

#### Core Operations

| File                           | LOC | Type          | Dependencies                      | Status         |
| ------------------------------ | --- | ------------- | --------------------------------- | -------------- |
| `list-tasks.ts`                | 495 | Pure JXA      | helpers.js, date-fields-bridge.js | Active         |
| `list-tasks-omnijs.ts`         | 437 | OmniJS Bridge | -                                 | V3 Alternative |
| `create-task.ts`               | 239 | JXA + Bridge  | helpers.js, minimal-tag-bridge.js | Active         |
| `create-task-with-bridge.ts`   | 180 | Pure Bridge   | helpers.js, minimal-tag-bridge.js | Duplicate      |
| `update-task.ts`               | 479 | JXA + Bridge  | helpers.js, minimal-tag-bridge.js | Active         |
| `complete-task.ts`             | 84  | Pure JXA      | helpers.js                        | Simple         |
| `delete-task.ts`               | 44  | Pure JXA      | helpers.js                        | Simple         |
| `complete-tasks-bulk.ts`       | 111 | OmniJS Bridge | helpers.js                        | Bulk Operation |
| `delete-tasks-bulk.ts`         | 91  | OmniJS Bridge | helpers.js                        | Bulk Operation |
| `get-task-count.ts`            | 159 | Mixed         | helpers.js                        | Direct API     |
| `todays-agenda.ts`             | 221 | Mixed         | helpers.js, date-fields-bridge.js | Specialized    |
| `flagged-tasks-perspective.ts` | 145 | Mixed         | helpers.js                        | Specialized    |

#### Issues Identified

- **Duplicate Creation:** `create-task.ts` vs `create-task-with-bridge.ts` (239 LOC vs 180 LOC)
  - Both use helpers + minimal-tag-bridge
  - `create-task-with-bridge.ts` is simpler - potential standard version
- **List-Tasks Variants:** Two major versions
  - `list-tasks.ts` (495 LOC) - Complex nested JXA with inline filtering
  - `list-tasks-omnijs.ts` (437 LOC) - OmniJS bridge approach, 13-22x faster
  - Current codebase appears to use both (CLAUDE.md mentions update to v2)

---

### 2. PROJECTS (6 files, 1,218 LOC)

#### Core Operations

| File                   | LOC | Type          | Dependencies                  | Status           |
| ---------------------- | --- | ------------- | ----------------------------- | ---------------- |
| `list-projects.ts`     | 277 | Mixed JXA     | helpers.js                    | Active           |
| `create-project.ts`    | 212 | JXA + Bridge  | helpers.js, repeat-helpers.js | Active           |
| `update-project.ts`    | 311 | JXA + Bridge  | helpers.js, repeat-helpers.js | Active (Complex) |
| `delete-project.ts`    | 84  | Pure JXA      | helpers.js                    | Simple           |
| `complete-project.ts`  | 125 | Mixed JXA     | helpers.js                    | Simple           |
| `get-project-stats.ts` | 235 | OmniJS Bridge | helpers.js                    | Direct API       |

#### Issues Identified

- `update-project.ts` (311 LOC) - Largest project script, handles complex state management
- `get-project-stats.ts` uses OmniJS bridge for performance (direct API methods)
- All other project ops are pure JXA

---

### 3. TAGS (3 files, 1,096 LOC)

#### Core Operations

| File              | LOC | Type          | Dependencies | Status                   |
| ----------------- | --- | ------------- | ------------ | ------------------------ |
| `list-tags.ts`    | 287 | OmniJS Bridge | helpers.js   | Active + 96.3% optimized |
| `list-tags-v3.ts` | 219 | OmniJS Bridge | helpers.js   | Experimental             |
| `manage-tags.ts`  | 590 | OmniJS Bridge | helpers.js   | Largest tag script       |

#### Issues Identified

- **Two List Implementations:** `list-tags.ts` (287 LOC) vs `list-tags-v3.ts` (219 LOC)
  - Both use OmniJS bridge
  - V3 is simpler, may indicate consolidation attempt
- `manage-tags.ts` (590 LOC) - Handles tag CRUD + hierarchy operations (largest script)
- Comment in list-tags.ts: "26.7x speedup from hybrid approach" - significant optimization

---

### 4. FOLDERS (5 files, 778 LOC)

#### Core Operations

| File               | LOC | Type         | Dependencies                  | Status |
| ------------------ | --- | ------------ | ----------------------------- | ------ |
| `list-folders.ts`  | 249 | Mixed JXA    | helpers.js                    | Active |
| `create-folder.ts` | 185 | JXA + Bridge | helpers.js, repeat-helpers.js | Active |
| `update-folder.ts` | 134 | JXA + Bridge | helpers.js                    | Active |
| `move-folder.ts`   | 193 | JXA + Bridge | helpers.js                    | Active |
| `delete-folder.ts` | 103 | Pure JXA     | helpers.js                    | Simple |

#### Analysis

- Consistent pattern with projects - similar complexity distribution
- All CRUD operations present
- No versioning/duplication issues

---

### 5. ANALYTICS (10 files, 2,289 LOC - Complex)

#### Core Operations

| File                                   | LOC | Type          | Dependencies | Status                      |
| -------------------------------------- | --- | ------------- | ------------ | --------------------------- |
| `workflow-analysis.ts`                 | 738 | Mixed         | helpers.js   | **Largest** analysis script |
| `analyze-overdue.ts`                   | 260 | OmniJS Bridge | helpers.js   | Active                      |
| `productivity-stats.ts`                | 321 | OmniJS Bridge | helpers.js   | Active                      |
| `productivity-stats-v3.ts`             | 283 | OmniJS Bridge | helpers.js   | Alternative                 |
| `recurring/analyze-recurring-tasks.ts` | 500 | OmniJS Bridge | helpers.js   | Largest recurring           |
| `task-velocity.ts`                     | 158 | Mixed         | helpers.js   | Active                      |
| `task-velocity-v3.ts`                  | 156 | OmniJS Bridge | helpers.js   | Alternative                 |
| `next-actions-analyzer.ts`             | 125 | Mixed         | helpers.js   | Specialized                 |
| `wip-limits-analyzer.ts`               | 100 | Mixed         | helpers.js   | Specialized                 |
| `due-date-bunching-analyzer.ts`        | 89  | Mixed         | helpers.js   | Specialized                 |
| `review-gaps-analyzer.ts`              | 81  | Mixed         | helpers.js   | Specialized                 |

#### Issues Identified

- **V3 Pattern Emerges:** Multiple "v3" versions exist
  - `productivity-stats-v3.ts` (283 LOC) vs `productivity-stats.ts` (321 LOC)
  - `task-velocity-v3.ts` (156 LOC) vs `task-velocity.ts` (158 LOC)
  - Minimal size difference - suggests refactoring, not major optimization
- `workflow-analysis.ts` (738 LOC) - Extremely complex analysis (20% of all analytics code)
- `recurring/analyze-recurring-tasks.ts` (500 LOC) - 2nd largest
- **Potential Consolidation:** 11 analyzer scripts could potentially share common patterns

---

### 6. PERSPECTIVES (3 files, 480 LOC)

#### Core Operations

| File                   | LOC | Type          | Dependencies | Status       |
| ---------------------- | --- | ------------- | ------------ | ------------ |
| `perspectives.ts`      | 252 | Mixed         | -            | Routing file |
| `list-perspectives.ts` | 70  | Pure JXA      | helpers.js   | Simple       |
| `query-perspective.ts` | 158 | OmniJS Bridge | helpers.js   | Active       |

#### Analysis

- `perspectives.ts` appears to be a routing/import file (252 LOC)
- `query-perspective.ts` is standard OmniJS bridge pattern

---

### 7. REVIEWS (3 files, 450 LOC)

#### Core Operations

| File                       | LOC | Type          | Dependencies | Status        |
| -------------------------- | --- | ------------- | ------------ | ------------- |
| `reviews.ts`               | 5   | Routing       | -            | Import file   |
| `mark-project-reviewed.ts` | 132 | OmniJS Bridge | helpers.js   | CRUD          |
| `projects-for-review.ts`   | 167 | OmniJS Bridge | helpers.js   | Query         |
| `set-review-schedule.ts`   | 151 | OmniJS Bridge | helpers.js   | Configuration |

#### Analysis

- `reviews.ts` is minimal routing file
- All review operations use OmniJS bridge (appropriate for state changes)

---

### 8. EXPORT (2 files, 561 LOC)

#### Core Operations

| File                 | LOC | Type  | Dependencies | Status |
| -------------------- | --- | ----- | ------------ | ------ |
| `export-tasks.ts`    | 323 | Mixed | helpers.js   | Active |
| `export-projects.ts` | 238 | Mixed | helpers.js   | Active |

#### Analysis

- Both use mixed JXA approach
- `export-tasks.ts` is larger (complex filtering/formatting)
- No obvious duplication

---

### 9. CACHE (2 files, 369 LOC)

#### Warming Operations

| File                     | LOC | Type          | Dependencies | Status         |
| ------------------------ | --- | ------------- | ------------ | -------------- |
| `warm-task-caches.ts`    | 232 | OmniJS Bridge | helpers.js   | Bulk operation |
| `warm-projects-cache.ts` | 137 | OmniJS Bridge | helpers.js   | Bulk operation |

#### Analysis

- Both use OmniJS bridge for performance (justified by bulk nature)
- No duplication - complementary operations
- Cache warming is necessary infrastructure

---

### 10. SYSTEM (1 file, 28 LOC)

#### Operations

| File             | LOC | Type     | Dependencies | Status |
| ---------------- | --- | -------- | ------------ | ------ |
| `get-version.ts` | 28  | Pure JXA | -            | Simple |

---

### 11. UTILITY FILES (4 files, 335 LOC)

#### Routing & Support

| File                    | LOC | Type    | Purpose              | Status       |
| ----------------------- | --- | ------- | -------------------- | ------------ |
| `tasks.ts`              | 21  | Routing | Import file          | Index        |
| `recurring.ts`          | 10  | Routing | Import file          | Index        |
| `date-range-queries.ts` | 335 | Utility | Date range filtering | Shared logic |

#### Analysis

- `date-range-queries.ts` (335 LOC) - Substantial utility for date filtering
- Appears to be shared logic, but not imported by many scripts

---

## Shared Helpers Analysis

### Helper Modules (10 files)

| File                    | Purpose                                     | Usage                      |
| ----------------------- | ------------------------------------------- | -------------------------- |
| `helpers.ts`            | Core utilities (safeGet, safeGetDate, etc.) | **All scripts**            |
| `minimal-tag-bridge.ts` | Tag assignment via OmniJS bridge            | Create/update tasks        |
| `bridge-helpers.ts`     | Generic bridge operation templates          | Selected scripts           |
| `bridge-template.ts`    | Template substitution patterns              | Tag/project operations     |
| `date-fields-bridge.ts` | Date field enrichment via bridge            | List-tasks                 |
| `repeat-helpers.ts`     | Repetition rule management                  | Create/update project/task |
| `repeat-translation.ts` | User intent → OmniJS translation            | Create/update task         |
| `helper-context.ts`     | Configuration for helper injection          | Framework                  |
| `script-builder.ts`     | Script assembly utilities                   | Framework                  |

### Key Observations

- **Universal dependency:** `helpers.ts` used in ALL operation scripts
- **Bridge specialization:** Separate bridge modules for different domains (tags, dates, repetition)
- **Composition pattern:** Scripts import multiple helpers as needed
- **No circular dependencies** observed

---

## Pattern Analysis

### Duplicate/Versioned Scripts

#### Group 1: List-Tasks Variants (495 LOC + 437 LOC = 932 LOC)

```
├── list-tasks.ts (495 LOC) - Complex JXA with inline filtering
└── list-tasks-omnijs.ts (437 LOC) - OmniJS bridge, 13-22x faster
```

**Status:** CONSOLIDATION CANDIDATE

- Both active in codebase (grep shows both exported)
- Significant performance difference (V3 is much faster)
- Recommendation: Deprecate `list-tasks.ts` in favor of `list-tasks-omnijs.ts`

#### Group 2: Create-Task Variants (239 LOC + 180 LOC = 419 LOC)

```
├── create-task.ts (239 LOC) - Full helpers
└── create-task-with-bridge.ts (180 LOC) - Bridge-optimized
```

**Status:** DUPLICATION ISSUE

- Both export to `CREATE_TASK_SCRIPT`
- `create-task-with-bridge.ts` is simpler, more maintainable
- Recommendation: Merge into single implementation

#### Group 3: Productivity Stats Variants (321 LOC + 283 LOC = 604 LOC)

```
├── productivity-stats.ts (321 LOC)
└── productivity-stats-v3.ts (283 LOC)
```

**Status:** VERSION CONFUSION

- Minimal size difference suggests refactoring, not optimization
- Both use OmniJS bridge
- Recommendation: Consolidate into single version

#### Group 4: Task Velocity Variants (158 LOC + 156 LOC = 314 LOC)

```
├── task-velocity.ts (158 LOC)
└── task-velocity-v3.ts (156 LOC)
```

**Status:** VERSION CONFUSION

- Almost identical size (2 LOC difference)
- Recommendation: Consolidate into single version

#### Group 5: Tag List Variants (287 LOC + 219 LOC = 506 LOC)

```
├── list-tags.ts (287 LOC) - Full version
└── list-tags-v3.ts (219 LOC) - Simplified
```

**Status:** OPTIMIZATION CANDIDATE

- V3 is 24% smaller
- Both OmniJS bridge-based
- Recommendation: Review and consolidate

---

### Architecture Patterns Observed

#### Pattern 1: Pure JXA (Simple Operations)

```
Examples: delete-task.ts, delete-project.ts, delete-folder.ts (all 28-103 LOC)
Characteristics:
- Direct property access
- No filtering complexity
- Immediate success/error return
- Minimal error handling
Efficiency: Good (simple contract)
```

#### Pattern 2: JXA + Helpers (Standard Operations)

```
Examples: create-task.ts, update-project.ts (239-311 LOC)
Characteristics:
- Complex state management
- Multiple helper function calls
- safeGet() wrapper usage
- Detailed error handling
Efficiency: Good (reusable patterns)
```

#### Pattern 3: Mixed JXA + Bridge (Complex Operations)

```
Examples: list-projects.ts, workflow-analysis.ts (277-738 LOC)
Characteristics:
- JXA for simple access
- Bridge for bulk operations
- Filtering/analysis logic
- Performance-critical sections
Efficiency: Excellent (optimal for workload)
```

#### Pattern 4: Pure OmniJS Bridge (Bulk Operations)

```
Examples: complete-tasks-bulk.ts, warm-task-caches.ts (111-232 LOC)
Characteristics:
- Collection iteration in bridge
- Fixed-size scripts (no embedded IDs per Issue #27)
- Direct API method calls
- High throughput
Efficiency: Excellent (optimized for scale)
```

---

## Complexity Distribution

### By Script Size

```
Giant (500+ LOC):
  - workflow-analysis.ts (738)
  - manage-tags.ts (590)
  - analyze-recurring-tasks.ts (500)

Large (300-499 LOC):
  - list-tasks.ts (495)
  - list-tasks-omnijs.ts (437)
  - export-tasks.ts (323)
  - productivity-stats.ts (321)
  - update-project.ts (311)
  - list-projects.ts (277)
  - productivity-stats-v3.ts (283)

Medium (150-299 LOC):
  - [11 scripts in range 158-287]

Small (50-149 LOC):
  - [25 scripts in range 28-145]
```

### By Dependency Count

```
Heavy Dependencies (3+ helper imports):
  - None explicitly (all use getUnifiedHelpers() which bundles)

Standard Dependencies (helpers + domain):
  - Task creation/update (helpers + tag-bridge)
  - Project management (helpers + repeat-helpers)
  - Analytics (helpers + domain-specific)

Minimal Dependencies (helpers only):
  - Simple CRUD operations
  - System utilities
```

---

## Recommendations for Consolidation

### Priority 1: CRITICAL (Remove duplicates entirely)

1. **Merge create-task.ts + create-task-with-bridge.ts**
   - Current: 419 LOC across 2 files
   - Target: 180-200 LOC single file (use bridge version as base)
   - Effort: 1 hour
   - Savings: 219 LOC, eliminate confusion

2. **Consolidate list-tasks variants**
   - Current: 932 LOC across 2 files
   - Target: 437-495 LOC single file (use omnijs-v3 as base, add feature parity)
   - Effort: 2 hours (ensure feature parity with original)
   - Savings: 437-495 LOC, 13-22x performance gain

### Priority 2: HIGH (Consolidate near-identical versions)

3. **Merge productivity-stats.ts + productivity-stats-v3.ts**
   - Current: 604 LOC across 2 files
   - Target: 300-320 LOC single file
   - Effort: 1.5 hours
   - Savings: 280-304 LOC

4. **Merge task-velocity.ts + task-velocity-v3.ts**
   - Current: 314 LOC across 2 files
   - Target: 150-160 LOC single file
   - Effort: 1 hour
   - Savings: 154-164 LOC

5. **Consolidate list-tags.ts + list-tags-v3.ts**
   - Current: 506 LOC across 2 files
   - Target: 220-260 LOC single file
   - Effort: 1.5 hours
   - Savings: 240-286 LOC

### Priority 3: MEDIUM (Extract common patterns)

6. **Create shared analyzer patterns**
   - Current: 11 analyzer scripts (2,289 LOC total)
   - Extract: Common date filtering, count aggregation, trend calculation
   - Potential savings: 10-15% per script (200-300 LOC)
   - Effort: 4-5 hours (requires careful refactoring)

7. **Consolidate routing files**
   - Current: 3 routing files (tasks.ts, recurring.ts, perspectives.ts) + 252 LOC
   - These appear to be framework artifacts
   - Review if still needed with unified API

### Priority 4: LOW (Optimization opportunities)

8. **Evaluate date-range-queries.ts** (335 LOC)
   - Not currently imported by operation scripts
   - Determine if active or legacy code
   - Effort: 30 minutes investigation

---

## Summary Statistics

### Current Codebase

- **Total Scripts:** 62 files
- **Total Operation Code:** 11,489 LOC
- **Duplicate/Versioned Code:** ~1,800 LOC (15.7% of total)
- **Shared Helpers:** 10 modules providing core functionality
- **Bridge Dependencies:** 25+ scripts use OmniJS bridge

### After Consolidation (Estimated)

- **Total Scripts:** 55-58 files (reduction of 4-7)
- **Total Operation Code:** ~9,700-9,900 LOC (13-15% reduction)
- **Duplicate/Versioned Code:** ~0 LOC (eliminated)
- **Same Shared Helpers:** 10 modules (unchanged)

### Quality Improvements

- Elimination of confusing "v3" variants
- Clear deprecation path (old → new)
- Easier maintenance (single source of truth)
- Performance gains (especially list-tasks, tags)
