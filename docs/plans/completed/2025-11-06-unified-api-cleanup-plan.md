# Unified API: ID Filter Fix & Codebase Cleanup for Main Merge

**Date:** November 6, 2025
**Status:** Ready for implementation
**Branch:** `feature/three-tool-builder-api` (to be renamed `feature/unified-api`)

## Overview
Prepare the unified 4-tool API for merge to main by fixing the ID filter issue and cleaning up the codebase for optimal PR reviewability.

## Phase 1: ID Filter Investigation & Fix

### 1.1 Synthetic Test (Controlled Environment)
**Goal:** Prove filtering logic works correctly in isolation

**Steps:**
1. Create test script that:
   - Creates a task with known ID
   - Queries by exact ID using `omnifocus_read`
   - Verifies exactly 1 result returned
   - Validates returned task matches created task
2. Test with direct MCP call (bypass Claude Desktop)
3. Document expected vs actual behavior

**Success Criteria:** Single task returned with exact ID match

### 1.2 Real Data Test (User Testing Scenario)
**Goal:** Reproduce User Testing issue with ID `"gwJ3pmhNozU"`

**Steps:**
1. Query by exact ID: `{"query": {"type": "tasks", "filters": {"id": "gwJ3pmhNozU"}}}`
2. Count results (User Testing reported 25 tasks)
3. Examine returned tasks - do they contain the target ID?
4. Trace through code path:
   - OmniFocusReadTool → QueryCompiler → QueryTasksToolV2
   - Check how ID filter is passed to script
   - Verify script uses exact match (`===`)

**Success Criteria:** Identify root cause of 25-task result

### 1.3 Root Cause Analysis
**Investigate:**
- Is ID being used for text search instead of exact match?
- Is filter being applied to wrong field (name/note instead of ID)?
- Is there a cache issue returning broader results?
- Is Claude Desktop corrupting the ID parameter?

### 1.4 Fix Implementation
**Based on findings, likely fixes:**
- **If exact match broken:** Fix comparison in script to use `===`
- **If wrong field:** Ensure ID filter targets `task.id()` not `task.name()`
- **If cache issue:** Fix cache key generation or invalidation
- **If Claude Desktop bug:** Add validation + clear error message

**Testing:** Re-run both synthetic and real data tests to confirm fix

---

## Phase 2: Documentation & Naming Cleanup (Priority B)

### 2.1 Branch Rename
**Current:** `feature/three-tool-builder-api` (misleading - has 4 tools)
**New:** `feature/unified-api`

**Steps:**
1. Rename local branch: `git branch -m feature/unified-api`
2. Update remote: `git push origin -u feature/unified-api`
3. Delete old remote branch: `git push origin --delete feature/three-tool-builder-api`

### 2.2 Update API Terminology
**Changes:**
- Remove "V2" from user-facing documentation
- Standardize on "unified API" not "builder API"
- Update tool descriptions to drop version numbers
- Update README, TESTING_PROMPT, USER_TESTING_INSTRUCTIONS

**Files to update:**
- `README.md` - API description
- `CLAUDE.md` - Remove V2 references in descriptions
- `package.json` - Description field
- Tool descriptions in `src/tools/unified/*.ts`

### 2.3 Consistency in Error Messages
**Standardize:**
- Error message format across all unified tools
- Logging format (consistent prefixes, levels)
- Response structure (already good, just verify)

---

## Phase 3: Code Cleanup (Priority C)

### 3.1 Dead Code Removal
**Search for and remove:**
- Commented-out code blocks
- Unused imports
- Disabled/archived files that aren't needed
- Old experiment code that didn't make it to production
- TODO comments that are completed

**Approach:**
1. Search for `// TODO`, `// FIXME`, `// XXX` - resolve or remove
2. Find commented code blocks - delete if obsolete
3. Check for unused exports using TypeScript analysis
4. Remove any `.disabled` or `.old` files if truly obsolete

### 3.2 Consistency Fixes
**Ensure consistency in:**
- Function naming conventions (camelCase, descriptive)
- File organization (similar tools in similar locations)
- Import ordering (external → internal → types)
- Error handling patterns (consistent use of McpError)

### 3.3 Light Reorganization (Priority A - minimal)
**Only if quick wins:**
- Group related schema files together
- Consolidate scattered type definitions
- **Avoid:** Moving files around extensively (risky close to merge)

---

## Phase 4: PR Preparation

### 4.1 Update Checkpoint Document
**Create:** `CHECKPOINT_2025-11-06.md`

**Include:**
- User Testing results (100% success rate)
- ID filter investigation findings + fix
- Codebase cleanup summary
- Branch rename rationale
- What's ready for main merge

### 4.2 Update User Documentation
**Create/Update:**
- User guide for 4-tool unified API
- Migration guide from legacy tools (if applicable)
- Quick reference with examples
- Troubleshooting section (including ID filter caveats)

### 4.3 PR Description Draft
**Prepare comprehensive PR description:**
- Overview: 17 tools → 4 unified tools
- Rationale: Better LLM experience, cleaner API surface
- Architecture: Routing layer over existing V2 tools
- Testing: User Testing results (100% success)
- Breaking changes: None (both APIs work in parallel)
- Known issues: Document any remaining non-blocking issues

### 4.4 Commit Cleanup (Optional)
**Consider:**
- Interactive rebase to clean up commit history
- Squash fixup commits
- Clear, descriptive commit messages
- **Risk:** Only if comfortable with git history rewriting

---

## Success Criteria

**Phase 1 Complete:**
- ✅ ID filter returns exactly 1 result for exact ID match
- ✅ Root cause identified and documented
- ✅ Fix implemented and tested

**Phase 2 Complete:**
- ✅ Branch renamed to `feature/unified-api`
- ✅ No "V2" in user-facing docs
- ✅ Consistent "unified API" terminology

**Phase 3 Complete:**
- ✅ No commented-out dead code
- ✅ All TODOs resolved or removed
- ✅ Consistent error handling patterns

**Phase 4 Complete:**
- ✅ Checkpoint document created
- ✅ User documentation updated
- ✅ PR description drafted
- ✅ Ready to merge to main

---

## Estimated Effort
- Phase 1 (Investigation + Fix): 1-2 hours
- Phase 2 (Documentation): 30-45 minutes
- Phase 3 (Code Cleanup): 1-2 hours
- Phase 4 (PR Prep): 30-45 minutes

**Total: 3-5 hours**

---

## Research Findings: ID Handling

### ID Stability in OmniFocus
- **IDs ARE STABLE** - OmniFocus uses persistent `ObjectIdentifier` types
- **IDs DO NOT CHANGE** during updates, moves, or property changes
- Evidence from codebase shows defensive checking but IDs remain constant

### Filter Implementation
- **EXACT MATCH** - Uses strict equality (`===`) for ID comparison
- No fuzzy matching or text search on IDs
- Direct ID extraction: `task.id()` comparison

### Known Issues
- **Claude Desktop Bug (documented in TROUBLESHOOTING.md):**
  - Extracts numeric portions from alphanumeric IDs
  - Example: `"az5Ieo4ip7K"` → `"547"`
  - Affects projectId parameters before reaching MCP tool

### Investigation Target
- User Testing reported: ID `"gwJ3pmhNozU"` returned 25 tasks instead of 1
- This is a full alphanumeric ID (not truncated)
- Need to verify if this is the Claude Desktop bug or something else

---

## Notes
- All changes will be made on the renamed `feature/unified-api` branch
- Each phase will be committed separately for clear history
- Testing after each phase to ensure nothing breaks
- User Testing can re-run if needed to validate ID filter fix

---

## Continuation Instructions

When resuming this work:

1. **Start with Phase 1** - ID filter investigation is highest priority
2. **Test thoroughly** - Both synthetic and real data scenarios
3. **Document findings** - Update this plan with results
4. **Commit incrementally** - One phase at a time
5. **Update checkpoint** - Final `CHECKPOINT_2025-11-06.md` when complete

**Current Build:** `7622acd` (docs: improve complex filter test to increase match probability)
