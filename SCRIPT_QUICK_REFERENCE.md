# OmniFocus Scripts - Quick Reference Guide

## At a Glance

- **62 total scripts** across 11 directories
- **11,489 lines** of operation code
- **~1,800 LOC** duplicated/versioned (15.7%)
- **10 helper modules** providing core functionality
- **25+ scripts** using OmniJS bridge for performance

## Scripts by Category

### Query Operations (Read-Only)
```
TASKS:
  - list-tasks.ts (495 LOC) ⚠️ DEPRECATED - Use list-tasks-omnijs.ts
  - list-tasks-omnijs.ts (437 LOC) ✓ PREFERRED - 13-22x faster
  - todays-agenda.ts (221 LOC)
  - flagged-tasks-perspective.ts (145 LOC)
  - get-task-count.ts (159 LOC)

PROJECTS:
  - list-projects.ts (277 LOC)
  - get-project-stats.ts (235 LOC)

TAGS:
  - list-tags.ts (287 LOC) ⚠️ DUPLICATE - Also list-tags-v3.ts
  - manage-tags.ts (590 LOC) - Tag CRUD + hierarchy

FOLDERS:
  - list-folders.ts (249 LOC)

PERSPECTIVES:
  - list-perspectives.ts (70 LOC)
  - query-perspective.ts (158 LOC)

OTHER:
  - All export scripts (323 + 238 LOC)
  - All analytics scripts (2,289 LOC total)
```

### Create Operations
```
TASKS:
  - create-task.ts (239 LOC) ⚠️ DUPLICATE
  - create-task-with-bridge.ts (180 LOC) ✓ PREFERRED - Simpler

PROJECTS:
  - create-project.ts (212 LOC)

FOLDERS:
  - create-folder.ts (185 LOC)

TAGS:
  - (Part of manage-tags.ts)

REVIEWS:
  - (Not separate - set-review-schedule.ts does creation)
```

### Update Operations
```
TASKS:
  - update-task.ts (479 LOC) - Most complex

PROJECTS:
  - update-project.ts (311 LOC)

FOLDERS:
  - update-folder.ts (134 LOC)

TAGS:
  - (Part of manage-tags.ts)

REVIEWS:
  - (Not separate - managed within review operations)
```

### Delete Operations
```
TASKS:
  - delete-task.ts (44 LOC) ✓ SIMPLE
  - delete-tasks-bulk.ts (91 LOC) ✓ OmniJS

PROJECTS:
  - delete-project.ts (84 LOC) ✓ SIMPLE

FOLDERS:
  - delete-folder.ts (103 LOC) ✓ SIMPLE

TAGS:
  - (Part of manage-tags.ts)
```

### Status Change Operations
```
TASKS:
  - complete-task.ts (84 LOC) ✓ SIMPLE
  - complete-tasks-bulk.ts (111 LOC) ✓ OmniJS

PROJECTS:
  - complete-project.ts (125 LOC)

REVIEWS:
  - mark-project-reviewed.ts (132 LOC)
```

### Analysis Operations
```
CORE ANALYTICS:
  - workflow-analysis.ts (738 LOC) - Largest, most complex
  - productivity-stats.ts (321 LOC) ⚠️ DUPLICATE
  - productivity-stats-v3.ts (283 LOC) ✓ PREFERRED
  - task-velocity.ts (158 LOC) ⚠️ DUPLICATE
  - task-velocity-v3.ts (156 LOC) ✓ PREFERRED
  - analyze-overdue.ts (260 LOC)

SPECIALIZED ANALYTICS:
  - recurring/analyze-recurring-tasks.ts (500 LOC)
  - next-actions-analyzer.ts (125 LOC)
  - wip-limits-analyzer.ts (100 LOC)
  - due-date-bunching-analyzer.ts (89 LOC)
  - review-gaps-analyzer.ts (81 LOC)

RECURRING:
  - recurring/get-recurring-patterns.ts (266 LOC)
```

### Infrastructure
```
CACHING:
  - warm-task-caches.ts (232 LOC)
  - warm-projects-cache.ts (137 LOC)

REVIEWS:
  - projects-for-review.ts (167 LOC)
  - set-review-schedule.ts (151 LOC)

PERSPECTIVES:
  (See Query Operations above)

FOLDER MANAGEMENT:
  - move-folder.ts (193 LOC)

SYSTEM:
  - get-version.ts (28 LOC) ✓ SIMPLE
```

## Consolidation Candidates (Priority Order)

### 🔴 CRITICAL (Remove duplicates)
- [ ] Merge create-task.ts + create-task-with-bridge.ts
  - Saves: 219 LOC
  - Use: create-task-with-bridge.ts as base (simpler)
  
- [ ] Consolidate list-tasks variants  
  - Saves: 437-495 LOC (use omnijs, not standard)
  - Gain: 13-22x performance improvement

### 🟠 HIGH (Consolidate near-identical versions)
- [ ] Merge productivity-stats.ts + productivity-stats-v3.ts
  - Saves: 280-304 LOC
  
- [ ] Merge task-velocity.ts + task-velocity-v3.ts
  - Saves: 154-164 LOC
  
- [ ] Consolidate list-tags.ts + list-tags-v3.ts
  - Saves: 240-286 LOC

### 🟡 MEDIUM (Extract shared patterns)
- [ ] Extract analytics common patterns
  - Affects: 11 analyzer scripts
  - Saves: ~200-300 LOC total
  
- [ ] Extract date handling patterns
  - Affects: 12+ scripts
  - Saves: ~100-150 LOC total

### 🔵 LOW (Cleanup & optimization)
- [ ] Audit date-range-queries.ts (335 LOC)
  - Determine if active or legacy
  
- [ ] Review routing files (288 LOC total)
  - Verify needed with unified API

## Helper Dependencies Quick Reference

### Universal Dependencies
- `helpers.ts` - Used by ALL 62 scripts
  - safeGet() - Most common usage
  - safeGetDate() - Date operations
  - safeGetProject() - Task → project mapping
  - Error formatting functions

### Domain-Specific Dependencies

**Task Creation/Update:**
- minimal-tag-bridge.ts (3 scripts)
- repeat-helpers.ts (4 scripts)

**Date Enrichment:**
- date-fields-bridge.ts (1 script: list-tasks.ts)

**Bridge Operations:**
- bridge-template.ts (2 scripts: complex updates)
- bridge-helpers.ts (legacy, check usage)

**Repetition Rules:**
- repeat-helpers.ts (4 scripts)
- repeat-translation.ts (for user intent conversion)

## Performance Notes

### Fastest Script Patterns
1. Pure JXA simple ops (delete, complete)
   - Execution: <100ms
   - Example: delete-task.ts (44 LOC)

2. OmniJS bulk operations
   - Execution: <500ms for 100+ items
   - Example: complete-tasks-bulk.ts

3. Optimized bridges with fixed size
   - Issue #27: No embedded task IDs
   - Example: list-tags.ts (96.3% optimized)

### Slowest Script Patterns
1. Deep JXA loops with per-item access
   - Execution: 5-25+ seconds for 100+ items
   - Example: Old list-tasks.ts variant
   - Solution: Use OmniJS bridge instead

2. Heavy analysis with multiple passes
   - Execution: 2-5 seconds for full database
   - Example: workflow-analysis.ts (738 LOC)
   - Reason: Complex calculations, appropriate complexity

## Architecture Decision Tree

When creating new scripts:

```
Simple deletion/status change?
  → Pure JXA (44-111 LOC)
  
Creating/updating single item?
  → JXA + bridge (180-310 LOC)
  
Querying many items (>50)?
  → OmniJS bridge + JXA wrapper (200-500 LOC)
  
Complex analysis on many items?
  → OmniJS bridge for counting + filtering (300-700 LOC)
  
Need tag assignment?
  → Use minimal-tag-bridge (required for persistence)
  
Need date enrichment?
  → Use date-fields-bridge (for added/modified/dropDate)
  
Need repetition rules?
  → Use repeat-helpers (handles complex rule objects)
```

## File Navigation

- **Operation scripts:** `src/omnifocus/scripts/{tasks,projects,tags,folders,...}/`
- **Shared helpers:** `src/omnifocus/scripts/shared/`
- **Type definitions:** `src/omnifocus/api/OmniFocus.d.ts`

## Testing Scripts

To test a script:

```bash
# List available scripts
grep -r "export const.*_SCRIPT" src/omnifocus/scripts/ --include="*.ts"

# Test single script execution
npm test -- scripts/tasks/list-tasks.test.ts

# Run all script tests
npm run test:integration
```

## Documentation References

- Full inventory: `SCRIPT_INVENTORY.md`
- Dependency analysis: `SCRIPT_DEPENDENCIES.md`
- Architecture guide: `docs/dev/ARCHITECTURE.md`
- Pattern library: `docs/dev/PATTERN_INDEX.md`

