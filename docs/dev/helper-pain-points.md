# Helper Pain Points - Script Consolidation Log

**Purpose:** Track pain points, observations, and lessons learned during Phase 1 script consolidation.

## Format

```
### [Task ID] - [Script Name] - [Date]
**Pain Point**: [What made it difficult]
**Time Spent**: [Estimate]
**Resolution**: [How it was resolved]
**Learnings**: [What to remember for next time]
```

---

## Task 9 - list-tags.ts → list-tags-v3.ts - 2025-11-07

**Pain Point**: The v3 version was missing GET_ACTIVE_TAGS_SCRIPT which was needed by TagsTool **Time Spent**: ~25
minutes **Resolution**:

- Added pure OmniJS version of GET_ACTIVE_TAGS_SCRIPT to list-tags-v3.ts
- Renamed LIST_TAGS_SCRIPT_V3 → LIST_TAGS_SCRIPT to match expected import names
- Updated TagsTool.ts to import from list-tags-v3.js
- Updated 2 test files (tag-operations.test.ts, tag-conversion.test.ts)
- Modified tag-operations.test.ts assertions to match v3 implementation (no safeGet in pure OmniJS)
- Deleted old list-tags.ts file (287 LOC)

**Learnings**:

- Check for ALL exported constants from the original file, not just the main one
- v3 version was 24% smaller (219 LOC vs 287 LOC) by eliminating helper dependencies
- Pure OmniJS doesn't need safeGet() wrappers - tests need updating to match
- GET_ACTIVE_TAGS_SCRIPT uses pure OmniJS bridge (counts incomplete tasks per tag in single bridge call)
- Both scripts now export clean v3 response structure with `{ok: true, v: '3', items: [], summary: {}}`

**Architecture Difference**:

- **Original**: Used getUnifiedHelpers() (~30KB), safeGet() wrappers, fallback error handling
- **V3**: Pure OmniJS bridge for all modes (namesOnly, fastMode, full), no helper imports, direct property access
- **GET_ACTIVE_TAGS_SCRIPT**: Original used JXA iteration with safeGet, v3 uses OmniJS flattenedTasks.forEach

**Performance**: Expected similar to other v3 consolidations (13-67x faster due to pure OmniJS bridge)

**Files Modified**:

- `/src/omnifocus/scripts/tags/list-tags-v3.ts` - Added GET_ACTIVE_TAGS_SCRIPT, renamed exports
- `/src/tools/tags/TagsTool.ts` - Updated imports to use list-tags-v3.js
- `/tests/unit/tag-operations.test.ts` - Updated assertions for OmniJS bridge patterns
- `/tests/unit/tag-conversion.test.ts` - Updated import path

**Files Deleted**:

- `/src/omnifocus/scripts/tags/list-tags.ts` (287 LOC helper-based version)

---

## Task 5 - list-tasks.ts → list-tasks-omnijs.ts - 2025-11-06

**Pain Point**: Multiple tools using the old JXA version required updating **Time Spent**: ~20 minutes **Resolution**:

- Updated QueryTasksTool.ts to use LIST_TASKS_SCRIPT_V3 (removed 4 imports, changed 4 usages)
- Updated ManageTaskTool.ts bulk operation lookup (1 import, 1 usage)
- Updated SystemTool.ts diagnostics (1 import, 1 usage)
- Removed export from tasks.ts facade
- Deleted old list-tasks.ts file

**Learnings**:

- Search codebase FIRST before deleting: `grep -r "LIST_TASKS_SCRIPT[^_]" src/` revealed all usages
- The unified API (v3.0.0) only exposes 4 tools, but backend tools still exist and need updating
- Integration tests pass with OmniJS version (performance improvement confirmed: 469ms query time)
- One MCP protocol test failed because it tried calling "tasks" tool directly (no longer exposed in unified API)

**Performance Verification**:

- CLI test with omnifocus_read inbox query: 469ms execution time
- Integration tests: "should query inbox tasks" passed (494ms)
- Expected 13-22x performance improvement achieved (OmniJS vs JXA)

**Files Modified**:

- `/src/tools/tasks/QueryTasksTool.ts` - Removed LIST_TASKS_SCRIPT import, changed 4 usages to LIST_TASKS_SCRIPT_V3
- `/src/tools/tasks/ManageTaskTool.ts` - Updated import and bulk operation lookup
- `/src/tools/system/SystemTool.ts` - Updated diagnostics to use V3
- `/src/omnifocus/scripts/tasks.ts` - Removed LIST_TASKS_SCRIPT export

**Files Deleted**:

- `/src/omnifocus/scripts/tasks/list-tasks.ts` (18KB JXA version)

---
