# Helper Pain Points Log

**Purpose:** Track every helper issue encountered during Phase 1 consolidation to inform Phase 2 helper refactoring.

**Instructions:** Add entries in real-time as you encounter issues. Include:
- Date/time
- Which script/task you were working on
- What helper problem you encountered
- What you wished existed instead

---

## Pain Points

### 2025-11-06 - create-task consolidation - Duplicate implementations with different capabilities

**Context:** Consolidating create-task.ts and create-task-with-bridge.ts

**Problem:** Duplication with feature disparity
- Two create-task scripts with overlapping functionality but different capabilities
- create-task.ts (239 LOC): Full-featured with tags, repetition, plannedDate via bridge
- create-task-with-bridge.ts (180 LOC): Simpler, tags only, missing repetition & plannedDate support
- create-task-with-bridge.ts had inline helper duplicates (formatError, validateProject) instead of using shared helpers
- Both used same base helpers (`getUnifiedHelpers()` + `getMinimalTagBridge()`)

**Workaround:** Kept create-task.ts (full-featured version), deleted create-task-with-bridge.ts

**Ideal:** Single create-task implementation with:
- All features (tags, repetition, plannedDate) in one place
- No inline helper duplication - use shared helpers consistently
- Clear documentation of which features require bridge vs JXA

**Impact:**
- Updated: BatchCreateTool to use create-task.ts
- Tests: edge-case-escaping.test.ts already using create-task.ts (correct version)
- Deleted: create-task-with-bridge.ts (180 LOC)
- Result: Single source of truth for task creation with all capabilities

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
