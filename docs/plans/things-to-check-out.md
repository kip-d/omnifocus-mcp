# Things to Check Out

> **Note:** Completed investigations have been archived to `.archive/completed-investigations-2025-12.md`

---

## 2. Unified API Filter Passthrough Issues (2025-11-27) → ✅ ALL FIXED (2025-12-26)

**Context:** When trying to query projects/tasks by folder or project name, filters were not being passed through the
unified API correctly.

### Issues Status - All Resolved

#### Issue 2.1: Project Folder Filtering → ✅ FIXED (2025-11-27)

See archived documentation for details.

#### Issue 2.2: Project Name Filtering → ✅ FIXED (2025-12-26)

**Was fixed as part of Issue 4.3** (archived). Verified working:

```typescript
// ✅ NOW WORKS - Returns only matching projects
{
  query: {
    type: "projects",
    filters: { name: { contains: "OmniFocus MCP" } }
  }
}
// Returns 3 projects: "OmniFocus MCP Server ongoing work", etc.
```

#### Issue 2.3: Search Mode Filter Handling → ✅ FIXED (2025-12-26)

**Root cause:** OmniFocusReadTool.routeToTasksTool was not passing the `search` filter to QueryTasksTool.

**Fix:** Added `search` filter mapping in `src/tools/unified/OmniFocusReadTool.ts`:
```typescript
if (compiled.filters.search) tasksArgs.search = compiled.filters.search;
```

Now works:
```typescript
// ✅ NOW WORKS - Searches tasks by name
{
  query: {
    type: "tasks",
    mode: "search",
    filters: { name: { contains: "MCP" } }
  }
}
// Returns tasks containing "MCP" in name or note
```

---

## 3. MCP Hot Reload for Development (2025-11-27)

**Context:** When developing this MCP server, code changes require restarting Claude Code to pick up the new code.

### Community Solution: mcp-hot-reload

**Repository:** https://github.com/data-goblin/claude-code-mcp-reload

A Python proxy wrapper that enables hot reloading of MCP servers during development.

### Native Feature Requests

No built-in support yet. Open issues requesting this:

- [#2756](https://github.com/anthropics/claude-code/issues/2756) - `/reload-mcps` command
- [#1026](https://github.com/anthropics/claude-code/issues/1026) - Reconnect MCP servers

### Current Workaround

Without hot-reload, use `claude --resume` to restart Claude Code while preserving conversation context.

---

## 7. Update Operations Test Consolidation (2025-11-28)

**Context:** The `update-operations.test.ts` integration test suite takes ~12.4 minutes to run 12 tests. Analysis shows
significant redundancy that can be consolidated without losing coverage.

### Proposed Consolidation

| Current Tests (12)                                  | Proposed Tests (7)                 |
| --------------------------------------------------- | ---------------------------------- |
| dueDate, deferDate, plannedDate, clearDueDate       | Date updates + clear, Planned date |
| tags replacement, addTags, removeTags, addTags dedup | Tags replacement, AddTags+dedup, RemoveTags |
| note, flagged, estimatedMinutes                     | Basic properties (combined)        |
| multiple updates                                    | Multiple updates (keep as-is)      |

**Estimated savings:** ~12.4 min → ~7 min

**File to modify:** `tests/integration/validation/update-operations.test.ts`

---

## 9. TypeScript Generics & Type Safety Improvements (2025-12-04)

**Priority:** Low - The codebase already uses generics effectively.

### Potential Improvements

#### 9.1: Branded Types for IDs (Low Priority)

Use TypeScript branded types to catch ID mixup bugs at compile time.

**Trade-offs:**
- Pro: Catches ID mixup bugs at compile time
- Con: Requires significant refactoring across codebase

**Status:** Partially implemented in `src/utils/branded-types.ts` (PR #41)

#### 9.2: AST Filter Output Typing (Low Priority)

Make AST filter system output strongly typed based on filter configuration.

**Trade-offs:**
- Pro: Type-safe script results
- Con: Runtime still dynamic (OmniJS scripts)

#### 9.3: CacheManager Generic Typing (Low Priority)

Add generic typing to cache entries.

**Recommendation:** None of these are urgent. Consider implementing branded types (9.1) only if ID mixup bugs become a
recurring problem.

---

## 10. Merged Utility PRs - Integration Notes (2025-12-10)

**Context:** Three PRs merged adding new utility code. These are opt-in additions not yet wired into the main codebase.

### 10.1: Branded Types (PR #41)

**Location:** `src/utils/branded-types.ts`

**Integration TODO:**

- [ ] Update function signatures in ManageTaskTool, QueryTasksTool to use branded types
- [ ] Add type assertions at API boundaries (where strings come in from MCP)
- [ ] Consider whether 8-50 char length validation is correct (OmniFocus IDs are typically 11 chars)

### 10.2: Error Handling Utilities (PR #40)

**Location:** `src/utils/circuit-breaker.ts`, `src/utils/error-recovery.ts`

**Integration TODO:**

- [x] ~~Consider wrapping OmniFocus script execution with circuit breaker~~ (Done in base.ts)
- [ ] Add retry logic for transient errors (timeouts, "not responding")
- [ ] Wire enhanced error context into tool error responses

### 10.3: AST Architecture Documentation (PR #39)

**Location:** `docs/dev/AST_ARCHITECTURE.md`

**No integration needed** - pure documentation of existing code.

### When to Integrate

| Utility         | Integrate When                                          |
| --------------- | ------------------------------------------------------- |
| Branded types   | ID mixup bugs become a problem                          |
| Circuit breaker | ✅ Done - integrated in base.ts                         |
| Retry logic     | Transient errors are common in production               |
| Enhanced errors | User feedback indicates error messages need improvement |
