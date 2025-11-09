# Phase 1: Script Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate 62 scripts to ~55 by eliminating duplicates and documenting helper pain points for Phase 2.

**Architecture:** Top-down approach - trace from unified API → backend tools → scripts to understand actual usage, then consolidate based on context-dependent performance/simplicity tradeoffs.

**Tech Stack:** TypeScript, Vitest, JXA/OmniJS bridge, OmniFocus 4.6.1 API

**Testing Philosophy:** Comprehensive - run full integration test suite after each consolidation to ensure no regressions.

---

## Part A: Discovery Phase (Documentation & Analysis)

### Task 1: Create Call Graph - Unified API to Backend Tools

**Goal:** Map which backend tools each unified API operation routes to.

**Files:**
- Create: `docs/consolidation/call-graph.md`
- Read: `src/tools/unified/compilers/QueryCompiler.ts`
- Read: `src/tools/unified/compilers/MutationCompiler.ts`
- Read: `src/tools/unified/compilers/AnalysisCompiler.ts`

**Step 1: Analyze QueryCompiler routing**

Open `src/tools/unified/compilers/QueryCompiler.ts` and document which backend tool each query type routes to:

```bash
grep -A 5 "case 'tasks':" src/tools/unified/compilers/QueryCompiler.ts
grep -A 5 "case 'projects':" src/tools/unified/compilers/QueryCompiler.ts
grep -A 5 "case 'tags':" src/tools/unified/compilers/QueryCompiler.ts
# ... etc for all query types
```

**Step 2: Analyze MutationCompiler routing**

Open `src/tools/unified/compilers/MutationCompiler.ts` and document routing:

```bash
grep -A 5 "case 'create':" src/tools/unified/compilers/MutationCompiler.ts
grep -A 5 "case 'update':" src/tools/unified/compilers/MutationCompiler.ts
# ... etc
```

**Step 3: Analyze AnalysisCompiler routing**

Open `src/tools/unified/compilers/AnalysisCompiler.ts` and document routing:

```bash
grep -A 5 "case 'productivity_stats':" src/tools/unified/compilers/AnalysisCompiler.ts
# ... etc for all analysis types
```

**Step 4: Create call graph document**

Create `docs/consolidation/call-graph.md` with structure:

```markdown
# Call Graph: Unified API → Backend Tools

## omnifocus_read Routes

| Query Type | Backend Tool | Notes |
|------------|--------------|-------|
| tasks | TasksTool | ... |
| projects | ProjectsTool | ... |
| ... | ... | ... |

## omnifocus_write Routes

| Operation | Target | Backend Tool | Notes |
|-----------|--------|--------------|-------|
| create | task | ManageTaskTool | ... |
| ... | ... | ... | ... |

## omnifocus_analyze Routes

| Analysis Type | Backend Tool | Notes |
|---------------|--------------|-------|
| productivity_stats | ProductivityStatsTool | ... |
| ... | ... | ... |
```

**Step 5: Commit**

```bash
git add docs/consolidation/call-graph.md
git commit -m "docs: map unified API to backend tools call graph"
```

---

### Task 2: Create Call Graph - Backend Tools to Scripts

**Goal:** Map which scripts each backend tool uses.

**Files:**
- Modify: `docs/consolidation/call-graph.md`
- Read: `src/tools/tasks/TasksTool.ts` (and similar for other tools)

**Step 1: Analyze TasksTool script usage**

```bash
grep -r "import.*scripts" src/tools/tasks/TasksTool.ts
grep -r "LIST_TASKS" src/tools/tasks/TasksTool.ts
```

**Step 2: Analyze all backend tools systematically**

For each backend tool identified in Task 1:

```bash
# Find all script imports
find src/tools -name "*.ts" -exec grep -l "scripts/" {} \;

# For each tool file, document which scripts it imports
grep "from.*scripts" src/tools/tasks/TasksTool.ts
grep "from.*scripts" src/tools/projects/ProjectsTool.ts
# ... etc
```

**Step 3: Add backend→script mapping to call-graph.md**

Extend `docs/consolidation/call-graph.md`:

```markdown
## Backend Tools → Scripts

### TasksTool
- list-tasks.ts (or list-tasks-omniJS.ts?)
- ... (document all scripts used)

### ProjectsTool
- list-projects.ts
- ...

### ManageTaskTool
- create-task.ts (or create-task-with-bridge.ts?)
- ...
```

**Step 4: Identify conditional script selection**

Look for code that chooses between script versions:

```bash
# Search for conditional imports or script selection
grep -r "omniJS\|bridge" src/tools/ --include="*.ts" -B 2 -A 2
```

Document any conditional logic in call-graph.md.

**Step 5: Commit**

```bash
git add docs/consolidation/call-graph.md
git commit -m "docs: map backend tools to scripts"
```

---

### Task 3: Identify Dead Code

**Goal:** Find backend tools and scripts NOT called by unified API.

**Files:**
- Create: `docs/consolidation/dead-code.md`
- Reference: `docs/consolidation/call-graph.md`

**Step 1: List all backend tools**

```bash
find src/tools -name "*Tool.ts" | sort > /tmp/all-tools.txt
```

**Step 2: Cross-reference with call graph**

Compare tools in `/tmp/all-tools.txt` with tools mentioned in `call-graph.md`.

Tools NOT in call graph = potentially unused.

**Step 3: List all scripts**

```bash
find src/omnifocus/scripts -name "*.ts" ! -path "*/shared/*" | sort > /tmp/all-scripts.txt
```

**Step 4: Cross-reference scripts with tool imports**

```bash
# For each script, check if any tool imports it
for script in $(cat /tmp/all-scripts.txt); do
  scriptname=$(basename "$script")
  if ! grep -r "$scriptname" src/tools/ --include="*.ts" > /dev/null; then
    echo "UNUSED: $script"
  fi
done
```

**Step 5: Create dead-code.md**

```markdown
# Potentially Dead Code

## Backend Tools Not Called by Unified API

- Tool: src/tools/path/to/Tool.ts
  - Reason: Not referenced in any compiler
  - Action: Verify and delete if truly unused

## Scripts Not Imported by Any Backend Tool

- Script: src/omnifocus/scripts/path/to/script.ts
  - Reason: No grep matches in src/tools/
  - Action: Verify and delete if truly unused
```

**Step 6: Commit**

```bash
git add docs/consolidation/dead-code.md
git commit -m "docs: identify potentially dead code"
```

---

### Task 4: Create Helper Pain Points Log

**Goal:** Set up document to track helper issues during consolidation.

**Files:**
- Create: `docs/consolidation/helper-pain-points.md`

**Step 1: Create template**

```markdown
# Helper Pain Points Log

**Purpose:** Track every helper issue encountered during Phase 1 consolidation to inform Phase 2 helper refactoring.

**Instructions:** Add entries in real-time as you encounter issues. Include:
- Date/time
- Which script/task you were working on
- What helper problem you encountered
- What you wished existed instead

---

## Pain Points

### [DATE] - [Script Name] - [Issue Summary]

**Context:** What were you trying to do?

**Problem:** What helper issue did you encounter?
- Missing function?
- Awkward API?
- Performance issue?
- Duplication?
- Other?

**Workaround:** What did you do instead?

**Ideal:** What would you have preferred to exist?

---

## Helper Usage Tracking

Track which helpers are actually used during consolidation:

| Helper File | Used By Scripts | Frequency | Notes |
|-------------|-----------------|-----------|-------|
| helpers.ts | (track as we go) | ... | ... |
| minimal-tag-bridge.ts | ... | ... | ... |
| ... | ... | ... | ... |
```

**Step 2: Commit**

```bash
git add docs/consolidation/helper-pain-points.md
git commit -m "docs: create helper pain points tracking log"
```

---

## Part B: Consolidation Phase (Eliminate Duplicates)

**Strategy:** Start with highest-impact consolidations first (performance wins, then duplicates, then patterns).

### Task 5: Consolidate list-tasks (High Impact - 13-22x Performance Win)

**Goal:** Migrate to OmniJS version exclusively for massive performance improvement.

**Context:** Two versions exist:
- `list-tasks.ts` (JXA - slower)
- `list-tasks-omniJS.ts` (OmniJS bridge - 13-22x faster)

**Decision:** Use OmniJS version (performance difference > 10x = always use faster).

**Files:**
- Read: `src/omnifocus/scripts/tasks/list-tasks.ts`
- Read: `src/omnifocus/scripts/tasks/list-tasks-omniJS.ts`
- Modify: Backend tool that imports list-tasks
- Delete: `src/omnifocus/scripts/tasks/list-tasks.ts`
- Test: Integration tests

**Step 1: Identify which tool uses list-tasks**

```bash
grep -r "list-tasks" src/tools/ --include="*.ts" -l
```

Expected: Find the tool file (likely `src/tools/tasks/TasksTool.ts` or similar).

**Step 2: Check current import statement**

```bash
grep "from.*list-tasks" <tool-file-from-step-1>
```

Expected: See which version is currently imported.

**Step 3: Update tool to use OmniJS version**

In the tool file, change import from:
```typescript
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks/list-tasks.js';
```

To:
```typescript
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks/list-tasks-omniJS.js';
```

(Adjust path based on actual import location)

**Step 4: Run integration tests for tasks tool**

```bash
npm run build
npm run test:integration -- tests/integration/tools/tasks
```

Expected: All tests pass.

**Step 5: Run full integration test suite**

```bash
npm run test:integration
```

Expected: All tests pass (comprehensive validation).

**Step 6: Delete old JXA version**

```bash
git rm src/omnifocus/scripts/tasks/list-tasks.ts
```

**Step 7: Update documentation**

Add to `docs/consolidation/helper-pain-points.md`:

```markdown
### 2025-11-06 - list-tasks consolidation

**Decision:** Migrated to list-tasks-omniJS.ts exclusively
**Reason:** 13-22x performance improvement (>10x threshold)
**Impact:** All task queries significantly faster
**Helper observations:**
- OmniJS bridge pattern works well for bulk operations
- No helper issues encountered in this consolidation
```

**Step 8: Commit**

```bash
git add .
git commit -m "perf: migrate to OmniJS list-tasks (13-22x faster)

Consolidated list-tasks variants by removing slower JXA version.
OmniJS version provides 13-22x performance improvement for task queries.

Deleted: src/omnifocus/scripts/tasks/list-tasks.ts
Using: src/omnifocus/scripts/tasks/list-tasks-omniJS.ts"
```

---

### Task 6: Consolidate create-task Variants

**Goal:** Consolidate create-task.ts and create-task-with-bridge.ts into single implementation.

**Context:** Two versions exist:
- `create-task.ts` (239 LOC)
- `create-task-with-bridge.ts` (180 LOC - simpler)

**Decision:** Need to determine which handles tags/repetition correctly (bridge required for these).

**Files:**
- Read: `src/omnifocus/scripts/tasks/create-task.ts`
- Read: `src/omnifocus/scripts/tasks/create-task-with-bridge.ts`
- Modify: Backend tool (ManageTaskTool?)
- Delete: One of the create-task files
- Test: Integration tests

**Step 1: Analyze create-task.ts capabilities**

```bash
grep -A 10 "tags" src/omnifocus/scripts/tasks/create-task.ts
grep -A 10 "repetition" src/omnifocus/scripts/tasks/create-task.ts
```

Document: Does it handle tags? Repetition rules?

**Step 2: Analyze create-task-with-bridge.ts capabilities**

```bash
grep -A 10 "tags" src/omnifocus/scripts/tasks/create-task-with-bridge.ts
grep -A 10 "repetition" src/omnifocus/scripts/tasks/create-task-with-bridge.ts
grep -A 10 "bridgeSetTags" src/omnifocus/scripts/tasks/create-task-with-bridge.ts
```

Expected: This version uses bridge for tags/repetition (required per CLAUDE.md).

**Step 3: Identify which tool uses each version**

```bash
grep -r "create-task" src/tools/ --include="*.ts"
```

Document which tool imports which script.

**Step 4: Record helper pain point**

Add to `docs/consolidation/helper-pain-points.md`:

```markdown
### 2025-11-06 - create-task analysis

**Context:** Consolidating create-task variants
**Observation:** Need to understand why two versions exist
**Analysis:**
- create-task.ts: [document capabilities]
- create-task-with-bridge.ts: [document capabilities]
**Helper needs:** Tag and repetition operations require bridge helpers
```

**Step 5: Make consolidation decision**

Based on analysis:
- If bridge version handles all cases → use it (simpler, 180 LOC)
- If non-bridge has needed features → extract and add to bridge version
- Document decision in helper-pain-points.md

**Step 6: Update tool to use chosen version**

Update import in backend tool:

```typescript
// Use the consolidated version
import { CREATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks/create-task-with-bridge.js';
```

**Step 7: Run integration tests**

```bash
npm run build
npm run test:integration -- tests/integration/tools/tasks
```

Expected: All tests pass, including tag creation tests.

**Step 8: Run full suite**

```bash
npm run test:integration
```

Expected: All pass.

**Step 9: Delete deprecated version**

```bash
git rm src/omnifocus/scripts/tasks/create-task.ts
# or
git rm src/omnifocus/scripts/tasks/create-task-with-bridge.ts
```

**Step 10: Commit**

```bash
git add .
git commit -m "refactor: consolidate create-task scripts

Merged create-task variants into single implementation.
[Chosen version] handles all cases including tags and repetition.

Deleted: [deprecated file]
Using: [chosen file]"
```

---

### Task 7: Consolidate productivity-stats Variants

**Goal:** Merge productivity-stats.ts and productivity-stats-v3.ts.

**Context:**
- `productivity-stats.ts` (321 LOC)
- `productivity-stats-v3.ts` (283 LOC - 12% smaller)

**Decision:** Likely use v3 (smaller), but verify functionality first.

**Files:**
- Read: `src/omnifocus/scripts/analytics/productivity-stats.ts`
- Read: `src/omnifocus/scripts/analytics/productivity-stats-v3.ts`
- Modify: `src/tools/analytics/ProductivityStatsTool.ts`
- Delete: One version
- Test: Integration tests

**Step 1: Compare implementations**

```bash
# Check key differences
diff src/omnifocus/scripts/analytics/productivity-stats.ts \
     src/omnifocus/scripts/analytics/productivity-stats-v3.ts | head -50
```

**Step 2: Check which version is currently used**

```bash
grep "productivity-stats" src/tools/analytics/ProductivityStatsTool.ts
```

**Step 3: Record helper observations**

Add to `helper-pain-points.md`:

```markdown
### 2025-11-06 - productivity-stats consolidation

**Context:** Two versions, v3 is 12% smaller (283 vs 321 LOC)
**Observations:**
- [Document key differences found in diff]
- [Any date handling patterns?]
- [Any helper usage differences?]
**Decision:** [Which to keep and why]
```

**Step 4: Test both versions if unclear**

If uncertain which is better:

```bash
# Run integration test with current version
npm run test:integration -- tests/integration/tools/analytics

# Note performance/correctness
# Check test output for any issues
```

**Step 5: Update tool to use chosen version**

```typescript
import { PRODUCTIVITY_STATS_SCRIPT } from '../../omnifocus/scripts/analytics/productivity-stats-v3.js';
```

**Step 6: Run integration tests**

```bash
npm run build
npm run test:integration -- tests/integration/tools/analytics
```

Expected: All pass.

**Step 7: Run full suite**

```bash
npm run test:integration
```

Expected: All pass.

**Step 8: Delete deprecated version**

```bash
git rm src/omnifocus/scripts/analytics/productivity-stats.ts
```

**Step 9: Commit**

```bash
git add .
git commit -m "refactor: consolidate productivity-stats to v3

v3 is 12% smaller (283 vs 321 LOC) with equivalent functionality.
All integration tests pass.

Deleted: productivity-stats.ts
Using: productivity-stats-v3.ts"
```

---

### Task 8: Consolidate task-velocity Variants

**Goal:** Merge task-velocity.ts and task-velocity-v3.ts.

**Context:** Nearly identical (158 vs 156 LOC - only 2 line difference).

**Files:**
- Read: Both versions
- Modify: `src/tools/analytics/TaskVelocityTool.ts`
- Delete: One version

**Step 1: Compare implementations**

```bash
diff src/omnifocus/scripts/analytics/task-velocity.ts \
     src/omnifocus/scripts/analytics/task-velocity-v3.ts
```

Expected: Minimal differences (2 LOC).

**Step 2: Identify which is used**

```bash
grep "task-velocity" src/tools/analytics/TaskVelocityTool.ts
```

**Step 3: Record observation**

Add to `helper-pain-points.md`:

```markdown
### 2025-11-06 - task-velocity consolidation

**Context:** Essentially identical (2 LOC difference)
**Observation:** Why do near-duplicates exist?
**Action:** Keep v3, delete other
```

**Step 4: Use v3 (consistency with other v3 consolidations)**

```typescript
import { TASK_VELOCITY_SCRIPT } from '../../omnifocus/scripts/analytics/task-velocity-v3.js';
```

**Step 5: Test**

```bash
npm run build
npm run test:integration -- tests/integration/tools/analytics
npm run test:integration
```

**Step 6: Delete old version**

```bash
git rm src/omnifocus/scripts/analytics/task-velocity.ts
```

**Step 7: Commit**

```bash
git add .
git commit -m "refactor: consolidate task-velocity to v3

Nearly identical implementations (2 LOC difference).
Standardizing on v3 versions for consistency.

Deleted: task-velocity.ts
Using: task-velocity-v3.ts"
```

---

### Task 9: Consolidate list-tags Variants

**Goal:** Merge list-tags.ts and list-tags-v3.ts.

**Context:**
- `list-tags.ts` (287 LOC)
- `list-tags-v3.ts` (219 LOC - 24% smaller)

**Files:**
- Read: Both versions
- Modify: Tags backend tool
- Delete: Larger version

**Step 1: Compare implementations**

```bash
diff src/omnifocus/scripts/tags/list-tags.ts \
     src/omnifocus/scripts/tags/list-tags-v3.ts | head -100
```

**Step 2: Check current usage**

```bash
grep -r "list-tags" src/tools/ --include="*.ts"
```

**Step 3: Record helper observations**

Add to `helper-pain-points.md`:

```markdown
### 2025-11-06 - list-tags consolidation

**Context:** v3 is 24% smaller (219 vs 287 LOC)
**Observations:**
- [Key differences]
- [Any tag helper patterns worth noting?]
**Decision:** Use v3 (smaller, likely more optimized)
```

**Step 4: Update tool**

```typescript
import { LIST_TAGS_SCRIPT } from '../../omnifocus/scripts/tags/list-tags-v3.js';
```

**Step 5: Test**

```bash
npm run build
npm run test:integration -- tests/integration/tools/tags
npm run test:integration
```

**Step 6: Delete old version**

```bash
git rm src/omnifocus/scripts/tags/list-tags.ts
```

**Step 7: Commit**

```bash
git add .
git commit -m "refactor: consolidate list-tags to v3

v3 is 24% smaller (219 vs 287 LOC).
All integration tests pass.

Deleted: list-tags.ts
Using: list-tags-v3.ts"
```

---

### Task 10: Review and Clean Up Dead Code

**Goal:** Remove backend tools and scripts not used by unified API.

**Files:**
- Reference: `docs/consolidation/dead-code.md`
- Delete: Files identified as unused

**Step 1: Review dead-code.md findings**

```bash
cat docs/consolidation/dead-code.md
```

**Step 2: For each potentially dead backend tool**

Verify it's truly unused:

```bash
# Search entire codebase for references
grep -r "ToolName" src/ --include="*.ts"
grep -r "ToolName" tests/ --include="*.ts"
```

If no references outside the tool itself → safe to delete.

**Step 3: For each potentially dead script**

Verify it's truly unused:

```bash
# Search for imports
grep -r "script-name" src/ --include="*.ts"
```

If no imports → safe to delete.

**Step 4: Delete confirmed dead code**

```bash
git rm src/tools/path/to/UnusedTool.ts
git rm src/omnifocus/scripts/path/to/unused-script.ts
```

**Step 5: Run tests to verify nothing broke**

```bash
npm run build
npm test
```

Expected: All pass (dead code shouldn't affect anything).

**Step 6: Update dead-code.md**

Mark items as deleted or keep if uncertain.

**Step 7: Commit**

```bash
git add .
git commit -m "chore: remove dead code

Removed backend tools and scripts not called by unified API:
- [list deleted files]

All tests pass after removal."
```

---

### Task 11: Review Helper Pain Points

**Goal:** Review all helper observations to prepare for Phase 2.

**Files:**
- Read: `docs/consolidation/helper-pain-points.md`
- Create: `docs/consolidation/phase1-summary.md`

**Step 1: Review pain points log**

```bash
cat docs/consolidation/helper-pain-points.md
```

Count and categorize pain points:
- Missing functions: X
- Awkward APIs: Y
- Performance issues: Z
- Duplication: W

**Step 2: Summarize helper usage**

Based on consolidation work, document:
- Which helpers were used most frequently
- Which helpers had issues
- Patterns that repeated across scripts

**Step 3: Create Phase 1 summary**

```markdown
# Phase 1 Summary: Script Consolidation

**Date Completed:** 2025-11-06

## Results

**Scripts:** 62 → [actual final count] files
**LOC Reduced:** [calculate from diffs]
**Performance Improvements:**
- list-tasks: 13-22x faster (migrated to OmniJS)
- [other improvements]

## Scripts Consolidated

1. list-tasks variants → list-tasks-omniJS.ts (performance)
2. create-task variants → [chosen version]
3. productivity-stats variants → productivity-stats-v3.ts
4. task-velocity variants → task-velocity-v3.ts
5. list-tags variants → list-tags-v3.ts

## Dead Code Removed

- Backend tools: [list]
- Scripts: [list]

## Helper Pain Points Summary

**Total observations:** [count]

**Categories:**
- Missing functionality: [list key items]
- Awkward APIs: [list key items]
- Performance concerns: [list key items]
- Duplication found: [list key items]

**Most-used helpers:**
1. helpers.ts - Used by X scripts
2. minimal-tag-bridge.ts - Used by Y scripts
3. [others]

**Recommendations for Phase 2:**
1. [Key insight 1]
2. [Key insight 2]
3. [Key insight 3]

## Test Status

✅ All integration tests passing
✅ No regressions introduced
✅ Performance improvements validated

## Next Steps

Ready for Phase 2: Helper Refactoring
- Use pain points to design new helper architecture
- Address identified issues systematically
- Build helpers we know we need (not guessing)
```

**Step 4: Commit summary**

```bash
git add docs/consolidation/phase1-summary.md
git commit -m "docs: Phase 1 consolidation complete

Summary of consolidation results, helper insights, and Phase 2 readiness."
```

---

## Success Criteria

**Phase 1 Complete When:**

- ✅ Call graph documented (API → tools → scripts)
- ✅ Dead code identified and removed
- ✅ Helper pain points logged (20+ observations)
- ✅ Major duplicate scripts consolidated:
  - list-tasks (OmniJS version)
  - create-task variants
  - productivity-stats (v3)
  - task-velocity (v3)
  - list-tags (v3)
- ✅ All integration tests passing (100% pass rate)
- ✅ No performance regressions
- ✅ Phase 1 summary document created

**Metrics:**
- Scripts: 62 → ~55-58 files
- Integration tests: 100% passing
- Helper observations: 20+ documented
- Performance: Equal or better (list-tasks 13-22x faster)

---

## Testing Strategy

**After Each Consolidation:**
1. Run affected tool's integration tests
2. Run full integration test suite
3. Verify all pass before proceeding

**Commands:**
```bash
# Build
npm run build

# Specific tool tests
npm run test:integration -- tests/integration/tools/tasks
npm run test:integration -- tests/integration/tools/analytics

# Full integration suite
npm run test:integration

# All tests (unit + integration)
npm test
```

**Known Issue:** Integration tests may be flaky when run as full suite (see `docs/consolidation/flaky-integration-tests.md`). Run individually if full suite fails.

---

## Helper Pain Points - Recording Guidelines

**When to record:**
- Every time you encounter a helper issue
- When you write inline code that should be in a helper
- When you find duplicated logic between helpers
- When helper API is confusing or awkward
- When helper causes performance issue

**What to record:**
- Context: Which script/task you're working on
- Problem: Specific helper issue
- Workaround: What you did instead
- Ideal: What you wish existed

**Why this matters:**
Phase 2 success depends on Phase 1 observations. The more detailed your helper pain points log, the better the Phase 2 helper architecture will be.

---

## References

- Design doc: `docs/plans/2025-11-06-script-helper-consolidation-design.md`
- Architecture: `docs/dev/ARCHITECTURE.md`
- Patterns: `docs/dev/PATTERNS.md`
- Script analysis: `SCRIPT_INVENTORY.md`, `SCRIPT_DEPENDENCIES.md`
