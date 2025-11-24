# Session Notes: 2025-11-24 - Shared Contracts Design

## Session Summary

This session started with bug fixes and evolved into architectural analysis that led to designing a shared contracts system.

---

## Bugs Fixed This Session

### 1. Delete Task Performance (Commit: 66aaad8)
- **Problem:** Delete task took ~32.6 seconds
- **Root Cause:** Linear JXA search with safeGet() - same as complete-task
- **Fix:** Applied OmniJS bridge pattern for fast ID lookup
- **Result:** ~30s → <2s

### 2. Completed Task Filtering (Commit: 88f26fe)
- **Problem:** Queries with `status: "completed"` AND tag filters returned 0 results
- **Root Cause:** Variable name mismatch - script checked `filter.includeCompleted` but compiler set `filter.completed`
- **Fix:** Proper three-way handling of completion filter in list-tasks-omnijs.ts
- **Location:** Lines 463-498 in `src/omnifocus/scripts/tasks/list-tasks-omnijs.ts`

---

## Git History Analysis

Reviewed ~50 commits and found **15+ bugs** in recurring patterns:

### Pattern 1: Filter/Property Name Mismatches
- `88f26fe` - `filter.completed` vs `filter.includeCompleted` (today)
- `6db45d9` - Bug #8 - filterStatus double-quoting
- `8e6fcdc` - template substitution and schema bugs

### Pattern 2: Missing Duplicated Logic
- `3d266fa` - Bug #7 - missing `matchesTagFilter` in default mode
- `f8581f3` - Bug #9/#10 - missing text/date filters in OmniJS
- `0436baa` - missing addTags/removeTags support

### Pattern 3: Response Structure Confusion (Double-Unwrap)
- `bb67136` - **fixed 4 tool failures at once**
- `b229a59` - double-unwrap for tags (all 3 operations)
- `55daae9` - double-unwrap for manage_reviews
- `f160f53` - double-unwrap in tasks mode:today

### Pattern 4: Parameter Routing
- `8d9f9e5` - v3.0.0 routing issues
- `2022dfc` - limit not passed to projects

---

## Key Insight

> "This is NOT gilding the lily. This is paying down real technical debt that's costing debugging time on nearly every feature."

The double-unwrap pattern alone was replicated across 4+ files before being identified as a pattern. Each fix was surgical but the root cause was architectural.

---

## Design Decision: Shared Contracts

Instead of a full DSL/AST (overkill), we designed a **lightweight shared contract system**:

### Core Components

1. **`filters.ts`** - Single source of truth for filter property names
   - `TaskFilter` interface enforces correct property names
   - TypeScript catches typos at compile time
   - `validateFilterProperties()` catches typos at runtime

2. **`responses.ts`** - Response structure contracts
   - `unwrapScriptOutput()` handles all wrapper formats (fixes double-unwrap bugs)
   - Type guards for safe response handling
   - `buildSuccessResponse()` / `buildErrorResponse()` for consistency

3. **`generator.ts`** - OmniJS code generator
   - `generateFilterBlock()` generates filter logic from spec
   - `generateTaskIterationScript()` for complete scripts
   - Eliminates copy-paste of filter logic across modes

### How It Catches Each Bug Class

| Bug Class | Contract Solution |
|-----------|------------------|
| `completed` vs `includeCompleted` | `TaskFilter` interface - TypeScript errors on wrong name |
| Missing `matchesTagFilter` in mode | `generateFilterBlock()` includes all filters automatically |
| Double-unwrap confusion | `unwrapScriptOutput()` handles all wrapper formats |
| Parameter not passed through | `TaskFilter` type at every layer makes gaps visible |

---

## Files Created

```
src/contracts/
├── DESIGN.md                    # Architecture overview
├── SESSION_NOTES_2025-11-24.md  # This file
├── index.ts                     # Public exports
├── filters.ts                   # Filter property definitions
├── responses.ts                 # Response structure contracts
├── generator.ts                 # OmniJS code generator
└── examples/
    └── migration-example.ts     # How to migrate existing code
```

---

## Next Steps (For Future Session)

1. **Add tests** for contracts themselves
2. **Migrate list-tasks-omnijs.ts "all" mode** to use generator
3. **Verify** same behavior with generated code
4. **Gradually migrate** other modes/scripts
5. **Consider**: Integration with QueryCompiler to use TaskFilter type

---

## Questions to Resolve

1. Should `TaskFilter` be used directly in QueryCompiler, or have a separate input type?
2. How to handle mode-specific logic (e.g., "today" needs date comparison)?
3. Should we generate the entire script or just the filter block?
4. Testing strategy: unit tests for generator output, or integration tests?

---

## Commands for Quick Reference

```bash
# Build
npm run build

# Quick tests
npm run test:quick

# Full tests
npm test

# View git history for bug patterns
git log --oneline --all --grep="fix" -50
git log --oneline --all --grep="Bug #" -20
```
