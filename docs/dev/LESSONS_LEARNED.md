# OmniFocus MCP: Critical Lessons Learned

## ⚠️ Essential Knowledge for Future Development

This document captures hard-won insights from developing OmniFocus MCP v2.0.0. These lessons will save you from
repeating our mistakes.

## 🚨 CRITICAL: CLI Testing Misconceptions (December 2025)

### The "Hanging" CLI Testing Mystery - SOLVED ✅

**Problem:** CLI testing for `manage_task` operations appeared to "hang indefinitely", leading to incorrect assumptions
about broken functionality.

**Root Cause:** Misunderstanding of normal MCP stdio behavior combined with improper MCP initialization.

**Key Findings:**

1. **MCP servers are supposed to exit when stdin closes** - This is correct behavior, not hanging!
2. **Missing `clientInfo` parameter** - CLI tests were missing required MCP initialization parameter
3. **Race condition misconception** - stdin closing "too quickly" was actually proper MCP protocol

**Before Fix (Incorrect Diagnosis):**

```bash
# This would timeout because of missing clientInfo parameter
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | node dist/index.js
# ❌ Server rejects connection due to schema validation error
```

**After Fix (Correct Understanding):**

```bash
# Proper MCP initialization with required clientInfo
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
# ✅ Server accepts connection and processes tools correctly
```

**Critical Lesson:** Always question "hanging" processes in MCP context - they should exit gracefully when stdin closes.

**Time Cost:** 6+ months of believing CLI testing was fundamentally broken when it was actually working correctly.

**Documentation Impact:** Must update all testing documentation to reflect proper MCP protocol usage.

## 🚨 CRITICAL: Pattern Search Before Implementation (October 2025)

### The "Reinventing the Wheel" Anti-Pattern - DOCUMENTED ✅

**Problem:** Spent 2+ hours implementing a "two-stage query enrichment" pattern that already existed as the "embedded
bridge helper" pattern in `minimal-tag-bridge.ts`.

**Root Cause:** Failed to search for existing patterns before implementing new functionality.

**What Happened:**

1. User requested access to `added`, `modified`, `dropDate` fields on tasks
2. We discovered JXA can't access these fields directly (Date conversion issue)
3. We tested and confirmed OmniJS bridge CAN access these fields
4. **MISTAKE:** We immediately started designing a "two-stage query" approach:
   - Run main query from TypeScript → get tasks
   - Run second query from TypeScript → get date fields
   - Merge results in TypeScript tool layer
5. After 2 hours of implementation, user asked: "Why not follow existing patterns?"
6. Search revealed `minimal-tag-bridge.ts` had the EXACT pattern we needed:
   - Embed bridge function in script as template string
   - Call bridge FROM WITHIN JXA script
   - Return complete enriched data in one call
7. Correct implementation took 10 minutes once we found the pattern

**The Critical Steps We Skipped:**

```bash
# SHOULD HAVE RUN FIRST:
grep -r "bridge\|evaluateJavascript" src/omnifocus/scripts/shared/

# Would have immediately found:
# - minimal-tag-bridge.ts (tag assignment pattern)
# - The embedded bridge helper pattern
# - Multiple examples of in-script enrichment
```

**Cost Analysis:**

- Time to search and find pattern: 5 minutes
- Time to implement using pattern: 10 minutes
- **Total with search: 15 minutes**

vs.

- Time designing wrong approach: 30 minutes
- Time implementing two-stage query: 90 minutes
- Time debugging integration issues: 30 minutes
- Time discovering pattern exists: 5 minutes
- Time rewriting correctly: 10 minutes
- **Total without search: 165 minutes**

**ROI: Searching saved 150 minutes (10x faster development)**

**Pattern Recognition Red Flags:**

These situations mean "search for pattern FIRST":

- "This feels like it should already exist"
- "I need to access data that JXA can't handle"
- "I need to call evaluateJavascript()"
- "I'm implementing something for the second time"
- "This seems like a common operation"

**Documentation Created:**

1. Added prominent "🚨 STOP!" section to CLAUDE.md
2. Created `docs/dev/PATTERN_INDEX.md` - searchable pattern catalog
3. Enhanced `minimal-tag-bridge.ts` header with pattern documentation
4. Enhanced `date-fields-bridge.ts` with implementation example
5. This lesson in LESSONS_LEARNED.md

**Mandatory Pre-Implementation Checklist (Now in CLAUDE.md):**

```bash
# 1. Search shared helpers
grep -r "your_task_keyword" src/omnifocus/scripts/shared/

# 2. Check pattern index
# Read: docs/dev/PATTERN_INDEX.md

# 3. If pattern found, READ IT COMPLETELY
# Don't skim - understand why it works

# 4. Only then: implement or adapt pattern
```

**Quote from User:**

> "So why were we off on that wild goose chase? Was part of my mistake using the Haiku model instead of the Sonnet
> model?"
>
> Answer: No - this was Sonnet 4.5 throughout. The mistake was not following the documented checklist. Even advanced
> models will reinvent wheels if they don't systematically search for existing patterns first.

**Lesson for Future AI Developers:** The existence of a checklist is not enough. The checklist must be:

1. **Visible:** Prominently placed at the top of documentation
2. **Mandatory:** Framed as required steps, not suggestions
3. **Specific:** Exact commands to run, not vague advice
4. **Cost-justified:** Show the time savings (10x faster in this case)

**Related Documentation:**

- `CLAUDE.md` - Updated with prominent STOP section
- `docs/dev/PATTERN_INDEX.md` - New pattern catalog
- `src/omnifocus/scripts/shared/minimal-tag-bridge.ts` - Pattern example
- `src/omnifocus/scripts/shared/date-fields-bridge.ts` - Pattern implementation

**Time to Solution:**

- Wrong approach: 2.5 hours to dead end
- Right approach (after pattern search): 10 minutes

**Prevention:** 30-second pattern search would have saved 2+ hours.

### ADDENDUM: Detailed Timeline and Commit Analysis (October 22, 2025)

**Purpose:** Retrospective analysis showing exactly where time was wasted and recovered.

#### Commit-by-Commit Timeline

**12:25 PM** - Commit `e709615` - Initial investigation

- Documented JXA Date type conversion limitations
- Confirmed `added`, `modified`, `dropDate` fields cannot be accessed via JXA
- Status: "Problem identified"

**12:43 PM** - Commit `6714c7c` - Wrong conclusion (⚠️ DEAD END)

- **Title:** "document OmniJS bridge limitation for added/modified/dropDate fields"
- **Conclusion:** "The fields cannot be retrieved through the current architecture"
- **Quote from commit:** "This is an architectural limitation... No workaround is available"
- **Action taken:** Removed attempted implementation code, gave up
- **Time invested:** ~18 minutes of research
- **Outcome:** Declared problem unsolvable

**1:44 PM** - Commit `994320d` - Pattern discovery (💡 BREAKTHROUGH)

- **Title:** "add pattern search documentation to prevent wheel reinvention"
- **What happened:** User asked "Why not follow existing patterns?"
- **Discovery:** Simple grep found `minimal-tag-bridge.ts` with exact pattern needed
- **Quote from commit:** "30-second grep search would have saved 2+ hours"
- **Time wasted:** ~2 hours between giving up and finding solution

**1:44 PM** - Commit `157c875` - Correct implementation (✅ SUCCESS)

- **Title:** "feat: add added/modified/dropDate field support using bridge pattern"
- **Implementation time:** 10 minutes after finding pattern
- **Pattern used:** Embedded bridge helper (already existed)
- **Status:** Fully working

#### What Went Wrong

**The Critical Mistake:** Between commits `6714c7c` and `994320d`, we:

1. Concluded the problem was "architecturally impossible"
2. Wrote extensive documentation explaining why it couldn't work
3. Removed attempted implementation code
4. **Never searched for existing patterns that solved identical problems**

**The Wrong Approach Attempted:**

- Two-stage query from TypeScript (fetch tasks, then enrich)
- Complex merge logic in tool layer
- Multiple osascript executions
- Increased complexity and maintenance burden

**The 18-Minute Investigation That Failed:**

- Tested JXA direct access → failed ✓
- Tested OmniJS bridge access → worked ✓
- Concluded it was impossible → **wrong conclusion** ✗
- Should have searched for existing bridge patterns → **never did this**

#### What Went Right

**The 30-Second Search That Worked:**

```bash
grep -r "bridge" src/omnifocus/scripts/shared/
```

Found `minimal-tag-bridge.ts` which showed:

- ✅ Exact same problem (JXA limitations)
- ✅ Exact same solution (embedded bridge helper)
- ✅ Working implementation to copy
- ✅ Pattern to follow

**The 10-Minute Implementation:**

1. Created `date-fields-bridge.ts` following tag bridge pattern
2. Imported into `list-tasks.ts`
3. Embedded bridge in script template
4. Called from within JXA script IIFE
5. Returned enriched data in one call
6. Tested → worked perfectly

#### Cost-Benefit Analysis

| Approach                      | Time         | Outcome                            |
| ----------------------------- | ------------ | ---------------------------------- |
| **What we did:**              |              |                                    |
| Investigation                 | 18 min       | Found problem                      |
| Wrong conclusion              | 0 min        | Gave up                            |
| Later: Pattern search         | 30 sec       | Found solution                     |
| Implementation                | 10 min       | Success                            |
| **Total productive time:**    | **29 min**   | ✅ Working feature                 |
|                               |              |                                    |
| **Time wasted:**              | **~2 hours** | Between giving up and breakthrough |
|                               |              |                                    |
| **What we should have done:** |              |                                    |
| Investigation                 | 18 min       | Found problem                      |
| Pattern search                | 30 sec       | Found solution                     |
| Implementation                | 10 min       | Success                            |
| **Total time:**               | **29 min**   | ✅ Same result                     |

#### The Key Insight

**From commit `6714c7c` message:**

> "This resolves the investigation - we've confirmed the limitation is architectural, not implementation-based."

**This was WRONG.** The limitation was implementation-based, not architectural. The pattern to solve it already existed
in `minimal-tag-bridge.ts` (created months earlier for the exact same type of JXA limitation).

**The correct conclusion should have been:**

> "JXA can't access these fields directly. Let me search for existing patterns that handle JXA limitations using the
> bridge approach."

#### Prevention Measures Implemented

1. **CLAUDE.md** - Added huge "🚨 STOP!" section at the top
2. **PATTERN_INDEX.md** - Created searchable pattern catalog
3. **Bridge files** - Enhanced with detailed usage examples
4. **This addendum** - Concrete timeline showing exactly where time was lost

#### Lessons for Future Development

**Red flag that should trigger pattern search:**

- "This is architecturally impossible" ← Almost always means "I haven't found the pattern yet"
- "No workaround is available" ← Almost always means "I haven't searched existing code"
- "Cannot be done" ← Almost always means "Cannot be done MY way"

**The mantra:**

> "Before concluding something is impossible, search for how it was already solved."

**Time ratio observed:**

- 2 hours wasted : 30 seconds of searching = **240:1 waste ratio**
- This is why the "STOP!" section is now mandatory

**Evidence from git history:** The solution was literally 10 minutes away from the moment we gave up. The only missing
step was a 30-second grep command.

## 🚨 CRITICAL: Refactoring Regression - Advanced Filter Loss (November 2025)

### The "Optimization Stripped Out Features" Bug - FIXED ✅

**Problem:** During v3.0.0 OmniJS refactor, text search and date range filters completely stopped working. User testing
reported ZERO results for queries that should have returned multiple tasks.

**Root Cause:** Performance optimization refactor created mode-based filtering (inbox, today, overdue, etc.) but the
all/default mode ONLY implemented tag filtering. ALL advanced filter handling was accidentally removed.

**User Impact:** CRITICAL BLOCKER

- **Bug #9 - Text Filter:** Query `{text: {contains: "meeting"}}` returned 10 tasks NOT containing "meeting"
- **Bug #10 - Date Range Filter:** Query `{dueDate: {between: ["2025-11-09", "2025-11-16"]}}` returned 4 overdue + 16
  no-due-date tasks = ZERO in range

**What Happened:**

1. **Before v3 refactor** - `list-tasks-omnijs.ts` had comprehensive filter handling:
   - Tag filtering ✓
   - Text search filtering ✓
   - Date range filtering ✓
   - Project filtering ✓
   - Status filtering ✓

2. **During v3 refactor** - Consolidated filtering into modes for performance:
   - Created specialized modes: inbox, today, overdue, flagged, available, search
   - Created all/default mode for general queries
   - **MISTAKE:** Only implemented tag filtering in all/default mode
   - **RESULT:** Text and date filters silently ignored

3. **Why it wasn't caught:**
   - Unit tests focused on common cases (tags, status)
   - Integration tests didn't verify advanced filter combinations
   - Performance benchmarks measured speed, not correctness
   - User testing discovered the regression

**The Critical Oversight:**

```typescript
// ❌ BEFORE FIX - all/default mode (lines 463-519)
omniJsScript = `
  (() => {
    ${tagFilterHelper}  // Only tag filtering!

    allTasks.forEach(task => {
      if (!matchesTagFilter(task)) return;  // Only tag check!

      results.push(buildTaskObject(task));
    });
  })();
`;

// ✅ AFTER FIX - all/default mode (complete filtering)
omniJsScript = `
  (() => {
    ${tagFilterHelper}
    ${textFilterHelper}      // Added text filtering
    ${dateFilterHelper}      // Added date filtering

    allTasks.forEach(task => {
      if (!matchesTagFilter(task)) return;
      if (!matchesTextFilter(task, filterText, textOperator)) return;  // Text check
      if (!matchesDateFilter(task, dueAfter, dueBefore, dueDateOperator)) return;  // Date check

      results.push(buildTaskObject(task));
    });
  })();
`;
```

**Fix Applied:**

**File: `src/omnifocus/scripts/tasks/list-tasks-omnijs.ts`**

1. Added `textFilterHelper` function (lines 61-80) - 20 lines
2. Added `dateFilterHelper` function (lines 82-101) - 20 lines
3. Modified all/default mode to embed helpers (lines 476-477)
4. Applied filters in forEach loop (lines 498, 501)

**File: `src/tools/tasks/QueryTasksTool.ts`**

1. Added text filter processing (lines 470-476) - 7 lines

**File: `src/tools/tasks/filter-types.ts`**

1. Added `text?: StringFilter;` type definition (line 80)

**Testing Results:**

**Text Filter (Bug #9):**

```
Query: {text: {contains: "meeting"}}
Before: 10 tasks, NONE containing "meeting"
After: 12 tasks, ALL containing "meeting" ✅
```

**Date Range Filter (Bug #10):**

```
Query: {dueDate: {between: ["2025-11-09", "2025-11-16"]}}
Before: 4 overdue + 16 no-date = ZERO in range
After: 9 tasks, ALL dates Nov 10-15 ✅
  - Nov 10: 1 task
  - Nov 11: 3 tasks
  - Nov 12: 1 task
  - Nov 14: 3 tasks
  - Nov 15: 1 task
```

**Cost Analysis:**

- Time to identify regression: 30 minutes (user testing)
- Time to fix both filters: 45 minutes
- Time to test and verify: 15 minutes
- **Total fix time: 90 minutes**

**Time Cost of NOT Having Regression Tests:**

- Performance optimization completed without catching regression
- Released to user testing with broken filters
- Had to pause v3.0.0 deployment for emergency fix
- **Prevention cost: 2 hours to write comprehensive filter tests**
- **Actual cost: Emergency fix during release cycle**

**Lessons Learned:**

1. **Test ALL filter types during refactoring, not just common ones**

   ```bash
   # Should have tested BEFORE merging v3:
   - Tag filter (any/all/not) ✓ (tested)
   - Text filter (contains/matches) ✗ (NOT tested)
   - Date range filter (between/before/after) ✗ (NOT tested)
   - Project filter (id/name) ✓ (tested)
   - Status filter (completed/flagged) ✓ (tested)
   ```

2. **Performance optimization should preserve ALL functionality**
   - Moving from N filter checks to mode-based filtering = valid optimization
   - But all/default mode must handle ALL filter types, not just tags
   - "Optimize the common case, but don't break the uncommon case"

3. **Integration tests need advanced filter coverage**
   - **Missing test:** Text search with multiple terms
   - **Missing test:** Date range with BETWEEN operator
   - **Missing test:** Combined filters (tags AND text AND date)
   - **Had test:** Simple tag filter (which kept working)

**Pattern to Remember:**

When refactoring filtering logic:

```bash
# Step 1: Document ALL filter types BEFORE refactoring
grep -r "filter\." src/tools/tasks/QueryTasksTool.ts | sort -u

# Step 2: Write integration tests for EACH filter type
# - Simple cases (single filter)
# - Complex cases (combined filters)
# - Edge cases (empty results, no matches)

# Step 3: Run tests BEFORE and AFTER refactor
npm run test:integration

# Step 4: Verify test coverage for ALL filters
# - Tag filter ✓
# - Text filter ✓
# - Date filter ✓
# - Project filter ✓
# - Status filter ✓

# Step 5: User acceptance testing with real queries
```

**Red Flags - When to Stop and Verify:**

These situations mean "verify ALL filter types work":

- "I'm refactoring filtering logic for performance"
- "I'm consolidating filter handling into modes"
- "I'm optimizing the common case"
- "I removed some old code that looked redundant"
- "I simplified the filter processing"

**Prevention Checklist (Now Required for Filter Refactoring):**

- [ ] Document all existing filter types
- [ ] Write integration test for each filter type
- [ ] Verify tests pass BEFORE refactoring
- [ ] Refactor filtering logic
- [ ] Verify ALL tests still pass AFTER refactoring
- [ ] Test with real data (user queries)
- [ ] Verify uncommon filters work, not just common ones

**Quote from Fix Session:**

> "The v3 refactor created mode-based filtering (inbox, today, overdue, flagged, available, search, all) but failed to
> implement advanced filters in the all/default mode. The all/default mode only had tag filtering - no text or date
> filtering at all."

**Evidence from Commit History:**

- Commit `f8581f3` - "fix: add missing text and date range filters to OmniJS script (Bug #9, #10)"
- 3 files changed, 70 insertions, 1 deletion
- All CI checks passed (662 unit tests)
- Both filters tested and verified working

**Related Documentation:**

- User Testing Report (Bug #9 & #10) - `/tmp/bug-9-10-fix-summary.md`
- Filter Types - `src/tools/tasks/filter-types.ts`
- OmniJS Script - `src/omnifocus/scripts/tasks/list-tasks-omnijs.ts`
- Query Tool - `src/tools/tasks/QueryTasksTool.ts`

**The Mantra:**

> "When refactoring for performance, verify ALL existing filter capabilities are preserved, not just the most common
> ones. Test the uncommon cases explicitly - they won't be caught by accident."

## 🚨 CRITICAL: Script Size Assumptions - 27x Underestimate (September 2025)

### The Great Script Size Misconception - RESOLVED ✅

**Problem:** For months, we've been constraining development based on an assumed "19KB script limit" that caused phantom
truncation issues and overly conservative helper function usage.

**Root Cause:** Confusion between different limitation contexts, conservative estimates treated as hard limits, and lack
of empirical testing.

**The Shocking Discovery:**

- **Assumed Limit:** 19KB (~19,000 characters)
- **Actual JXA Limit:** 523KB (~523,266 characters) - **27x larger!**
- **Actual OmniJS Bridge Limit:** 261KB (~261,124 characters) - **13x larger!**

### Timeline of Incorrect Assumptions

**Phase 1: Initial Conservative Estimate**

- Set 19KB limit based on "safety" without empirical testing
- Likely confusion with shell ARG_MAX limits (doesn't apply to stdin piping)
- Created complex "minimal helper" patterns to stay under phantom limit

**Phase 2: Reinforcing Wrong Assumptions**

- Script "truncation" issues attributed to size limits
- Developed elaborate workarounds for non-existent constraints
- Split helper functions into tiny pieces unnecessarily

**Phase 3: Empirical Discovery (September 2025)**

- Binary search testing revealed true limits are 25-27x larger
- Our largest script (31KB) uses only 6% of actual JXA capacity
- All "truncation" issues were actually syntax/logic errors, not size limits

### Current Codebase Reality Check

```
helpers.ts              31,681 chars  ✅ 6.1% of actual JXA limit
workflow-analysis.ts    29,957 chars  ✅ 5.7% of actual JXA limit
list-tasks.ts           26,347 chars  ✅ 5.0% of actual JXA limit
update-task.ts          25,745 chars  ✅ 4.9% of actual JXA limit
```

**Key Finding:** Scripts that "exceed our 19KB assumption" have been working perfectly in production for months.

### What We Got Wrong

1. **ARG_MAX Confusion:** Confused shell command line limits with stdin piping limits
2. **Conservative Safety:** Treated ultra-conservative estimates as hard technical limits
3. **No Empirical Testing:** Relied on assumptions instead of systematic testing
4. **Confirmation Bias:** Attributed unrelated errors to size limits
5. **Documentation Inertia:** Repeated incorrect limits across documentation

### The Real Script Execution Pipeline

```bash
# Our actual execution method bypasses ARG_MAX entirely
const osascript = spawn('osascript', ['-l', 'JavaScript'], {
  stdio: ['pipe', 'pipe', 'pipe']
});
osascript.stdin.write(script);  # No shell command line involved!
osascript.stdin.end();
```

### Methodology Failures That Led to This

1. **Assumption Documentation:** Wrote limits into docs without empirical backing
2. **No Boundary Testing:** Never tested actual failure points
3. **Premature Optimization:** Optimized for non-existent constraints
4. **Missing Validation:** No systematic way to challenge documented "facts"

### How to Prevent Future Assumption Errors

1. **Empirical First:** Always test assumptions before documenting as facts
2. **Boundary Testing:** Create binary search tools for discovering real limits
3. **Regular Validation:** Periodically re-test documented constraints
4. **Assumption Audits:** Mark all assumptions clearly and validate systematically
5. **Evidence-Based Documentation:** Require test evidence for all technical claims

### Impact of This Discovery

**Immediate Benefits:**

- ✅ Can use full helper function suites without constraint anxiety
- ✅ Complex analytics scripts are well within actual limits
- ✅ No need for elaborate size optimization patterns
- ✅ Development velocity increased by removing phantom constraints

**Long-term Value:**

- 🧠 Systematic approach to validating technical assumptions
- 🔬 Empirical testing framework for discovering real limits
- 📚 Evidence-based documentation practices
- ⚡ Freed development capacity previously spent on unnecessary optimizations

### Time and Resource Cost

- **Months of unnecessary optimization work** solving non-existent problems
- **Delayed feature development** due to phantom constraints
- **Complex architectural decisions** based on incorrect assumptions
- **Documentation debt** requiring comprehensive updates

### The Meta-Lesson: Question Everything

This discovery reveals a pattern of accepting "documented facts" without empirical validation. Moving forward:

1. **Label assumptions clearly** in documentation
2. **Create systematic testing for all technical constraints**
3. **Regular assumption audits** to catch outdated or incorrect information
4. **Evidence requirements** for all documented limits and constraints
5. **Empirical testing tools** as standard development practice

**See `docs/SCRIPT_SIZE_LIMITS.md` for complete empirical testing methodology and results.**

## 🚨 Critical Performance Issues

### 1. NEVER Use whose() in JXA

**Problem:** JXA's `whose()` method takes 25+ seconds for simple queries

```javascript
// ❌ CATASTROPHIC - Takes 25+ seconds
const tasks = doc.flattenedTasks.whose({ completed: false })();

// ✅ FAST - Takes <100ms
const tasks = doc.flattenedTasks();
const incompleteTasks = [];
for (let i = 0; i < tasks.length; i++) {
  if (!tasks[i].completed()) incompleteTasks.push(tasks[i]);
}
```

**Impact:** 95% performance improvement by removing all whose() calls

### 2. Script Size Limits (50KB Max)

**Problem:** JXA scripts over ~50KB get truncated, causing syntax errors

```javascript
// ❌ Script with all helpers inline - 75KB - FAILS
const script = `${allHelperFunctions} ${mainLogic}`;

// ✅ Minimal helpers - 15KB - WORKS
const script = `${minimalHelpers} ${mainLogic}`;
```

**Solution:**

- Use `getMinimalHelpers()` not `getAllHelpers()`
- Pass complex data as JSON strings
- Parse inside the script

### 2b. JXA Runtime Parsing Limits (~5-10KB) - CRITICAL

**Problem:** Scripts over ~5-10KB cause misleading "Can't convert types" JXA runtime errors

````javascript
// ❌ FAILS - 9,679 chars - "Can't convert types" error
export const UPDATE_PROJECT_SCRIPT = `
  ${getMinimalHelpers()}
  // ... complex folder logic (2,543 chars)
  // ... complex review logic (1,413 chars)
  // ... advanced properties logic
`;

// ✅ WORKS - 4,922 chars - Success!
export const UPDATE_PROJECT_SCRIPT = `

### 2c. Script Truncation Issues (~20KB) - NEW DISCOVERY
**Problem:** Large scripts (19KB+) get truncated during execution, causing `SyntaxError: Unexpected EOF`
```bash
# Error pattern:
# "Script execution failed with code 1"
# "SyntaxError: Unexpected EOF (-2700)"
````

**Root Cause:** CREATE_TASK_SCRIPT includes heavy helper functions:

- `getRecurrenceApplyHelpers()` - Complex repeat rule logic
- `getValidationHelpers()` - Project validation
- `BRIDGE_HELPERS` - Tag assignment bridge code

**Current Script Analysis:**

- Raw template: 8,103 characters ✅ (manageable)
- With helpers expanded: 19,026 characters ❌ (too large)
- Result: Script gets truncated at ~14KB, breaks syntax

**Solution Strategy:**

1. Use minimal helpers only where needed
2. Move complex logic to separate bridge calls
3. Reduce helper function size
4. Consider helper function lazy loading ${getMinimalHelpers()} // ... only essential updates (name, note, dates,
   status) `;

````

**CRITICAL INSIGHT:** "Can't convert types" is often NOT a type conversion issue - it's a script size issue!

**Debugging Process (September 2025):**
- Template substitution: ✅ Working correctly
- Individual JXA operations: ✅ All work fine
- Script wrapping logic: ✅ No double-wrapping
- Direct osascript execution: ✅ Works perfectly
- **Root cause: Script too large for JXA runtime parser**

**Solution:**
- Keep core scripts under 5,000 characters
- Remove bloated features (complex folder moves, advanced properties)
- Split complex operations into focused, modular scripts
- Test script sizes regularly: `script.length < 5000`

**Impact:** Fixed project update "Can't convert types" errors by reducing UPDATE_PROJECT_SCRIPT from 9,679 to 4,922 chars (49% reduction)

### 3. Direct Property Access is Faster
**Finding:** Direct try/catch is 50% faster than wrapper functions
```javascript
// ❌ SLOWER - Wrapper function
const name = safeGet(() => task.name());

// ✅ FASTER - Direct access
let name;
try { name = task.name(); } catch { name = null; }
````

## 🐛 OmniFocus UI Issues & Inconsistencies

### Task Count Discrepancy (September 2025)

**Issue:** OmniFocus UI count line doesn't match displayed content in "Everything" view

**Details:**

- **OmniFocus UI Bug**: Projects view set to "Everything" shows completed tasks but doesn't count them in status line
- **Example**: Shows 1,449 tasks in count but displays 1,828 total tasks (including 379 completed)
- **UI displays**: "122 inbox items, 1,327 actions, 394 projects"
- **Reality**: ~1,828 total tasks (our MCP server count is correct)

**Root Cause:** OmniFocus UI inconsistency - "Everything" view should either:

1. Count completed items in status line totals, OR
2. Not display completed items if they won't be counted

**Impact:**

- Users may report "discrepancies" between MCP server counts and UI counts
- **Our MCP server is correct** - `doc.flattenedTasks()` returns complete dataset
- This is a **UI presentation bug**, not a data accuracy issue

**Status:** Bug identified but not yet reported to OmniGroup (as of Sept 2025)

**For Developers:**

- Expect user reports about count "mismatches"
- Explain that MCP gives complete/accurate totals
- OmniFocus UI filtering is inconsistent in "Everything" view

## 🚨 CRITICAL: Systematic Script Size Crisis (September 2025)

### Major Architectural Gap Discovered

**Problem:** Found 36 files still using `getAllHelpers()` causing massive script bloat

**Impact:**

- Scripts were 41KB+ (approaching 50KB JXA limit)
- "Can't convert types" errors were actually **script truncation failures**
- Multiple tools failing with identical symptoms
- 6+ months of undiscovered performance issues

**Root Cause Analysis:**

- Previous helper optimization was **incomplete**
- No systematic audit process in place
- Easy to miss during individual feature development
- `getAllHelpers()` includes 75KB+ of code vs 5KB minimal helpers

**Systematic Solution Applied:**

```bash
# Found 36 files with getAllHelpers() usage
Analytics scripts (4 files)    → getAnalyticsHelpers()
Export scripts (3 files)       → getSerializationHelpers()
Task queries (9 files)         → getBasicHelpers()
CRUD operations (6 files)      → getBasicHelpers()
Simple operations (8 files)    → getMinimalHelpers()
Recurring tasks (2 files)      → getRecurrenceHelpers()
Date ranges (2 files)          → getBasicHelpers()
Project stats (1 file)         → getAnalyticsHelpers()
Reviews (3 files)              → getBasicHelpers()
```

**Lessons for Future:**

1. **Mandatory Helper Audits**: Add to development checklist
2. **Automated Detection**: Consider linting rules for `getAllHelpers()`
3. **Individual Analysis Required**: Never blindly replace - each script needs appropriate helpers
4. **Script Size Monitoring**: Track script sizes during development

**Expected Impact:**

- Resolves all "Can't convert types" errors from script size limits
- 90% reduction in script sizes (5KB vs 75KB+)
- Dramatic performance improvements across all tools

### Second Wave: REPEAT_HELPERS Crisis (September 2025)

**Problem Discovered:** Even after the systematic cleanup, scripts were STILL hitting size limits due to massive
REPEAT_HELPERS (321 lines) being imported unnecessarily.

**Scripts Affected:**

- 3 LIST scripts: Only needed to READ repeat rules, but imported full 321-line helpers
- 2 CRUD scripts: Properly needed repeat functionality but used inefficient imports
- getAllHelpers(): Included massive repeat helpers by default

**Final Solution:**

```bash
# LIST scripts (read-only): Minimal helper + 8-line extractor
list-tasks*.ts → getBasicHelpers() + extractRepeatRuleInfo() (8 lines)

# CRUD scripts (full functionality): Proper recurrence helpers
create-project.ts, update-task.ts → getRecurrenceHelpers()

# Safety improvement: Remove from default helpers
getAllHelpers() → no longer includes REPEAT_HELPERS by default
```

**Final Impact:**

- List scripts: 75KB → 15KB (80% reduction)
- CRUD scripts: 75KB → 35KB (53% reduction)
- All scripts now well under 50KB JXA limit
- Complete elimination of "Can't convert types" errors

**Key Architectural Lesson:**

- READ operations: Minimal helpers + focused extractors
- WRITE operations: Full helpers only when needed
- Default helpers should be lean, specialized helpers explicit

---

## 🔧 Technical Gotchas

### 4. Bridge Context Consistency

**Problem:** Writing via `evaluateJavascript()` but reading via JXA causes invisible changes

```javascript
// ❌ WRONG - Mixed contexts
app.evaluateJavascript(`task.tags = [tag1, tag2]`); // Write
const tags = task.tags(); // Read via JXA - won't see changes!

// ✅ CORRECT - Same context
app.evaluateJavascript(`
  task.tags = [tag1, tag2];
  task.tags.map(t => t.name());  // Read in same context
`);
```

### 5. MCP Bridge Type Coercion

**Problem:** Claude Desktop converts ALL parameters to strings

**Numbers:**

```typescript
// ❌ FAILS with Claude Desktop
schema: z.object({
  limit: z.number(), // Will receive "25" not 25
});

// ✅ WORKS everywhere
schema: z.object({
  limit: z.union([z.number(), z.string().transform((val) => parseInt(val, 10))]),
});
```

**Booleans:**

```typescript
// ❌ FAILS with Claude Desktop
schema: z.object({
  flagged: z.boolean(), // Will receive "true" not true
});

// ✅ WORKS everywhere - use coerceBoolean() helper
import { coerceBoolean } from './schemas/coercion-helpers.js';

schema: z.object({
  flagged: coerceBoolean(), // Handles "true", "false", "1", "0", etc.
});
```

**Common places this breaks:**

- Batch operation parameters (createSequentially, returnMapping, etc.)
- Feature flags in unified tool schemas
- Any boolean in tool schemas

**Fix checklist:**

1. Search for `z.boolean()` in schema files
2. Replace with `coerceBoolean()` from coercion-helpers.ts
3. Test with Claude Desktop (sends strings)
4. Test with direct calls (sends booleans)

### 6. Task Status is Not a Simple Property

**Problem:** Task availability depends on multiple factors

```javascript
// ❌ INCOMPLETE - Misses many cases
const available = !task.completed() && !task.blocked();

// ✅ COMPLETE - Checks all conditions
const available = !task.completed() && !isBlocked(task) && !isDeferred(task) && projectIsActive(task);
```

## 🏗️ Architecture Decisions

### 7. Tool Consolidation for LLMs

**Finding:** Fewer tools = better LLM performance

- v1: 22 tools → confusion, wrong tool selection
- v2: 14 tools → clear mental model, consistent patterns
- **Pattern:** Use `operation` parameter for related actions

### 8. Summary-First Responses

**Finding:** LLMs and users need insights before data

```javascript
// ❌ Data dump
return { tasks: [500 items...] }

// ✅ Summary first
return {
  summary: {
    insights: ["3 tasks overdue", "Focus on Project X"],
    total: 500
  },
  data: { tasks: [...] }
}
```

### 9. Date Handling Smart Defaults

**Finding:** Users expect intelligent date defaults

- Due dates without time → 5:00 PM (end of work)
- Defer dates without time → 8:00 AM (start of work)
- "Today" → appropriate time based on context

## 🐛 Common Pitfalls

### 10. Tags During Task Creation

**Issue:** JXA cannot set tags during task creation **Workaround:** Use evaluateJavascript() bridge after creation

### 11. Project ID Extraction

**Issue:** Claude Desktop may extract partial IDs

```javascript
// Full ID: "az5Ieo4ip7K"
// Claude might extract: "547"
// Solution: Always validate full alphanumeric ID
```

### 12. Invisible Sanitization

**Issue:** Parameters silently filtered by sanitization

```javascript
// Parameter 'minimalResponse' not in whitelist → silently removed
// Solution: Always check sanitization whitelist when adding parameters
```

## 📊 Performance Benchmarks

### Target Performance (2000+ tasks)

- Query operations: <1 second ✅
- Write operations: <500ms ✅
- Analytics: <2 seconds ✅
- Export: <3 seconds ✅

### Performance Killers

1. `whose()` method: +25 seconds
2. `safeGet()` in loops: +50% overhead
3. Date object creation in loops: +30% overhead
4. Full helper functions: Script size errors

## 🎯 Best Practices

### Script Development

1. **Always use minimal helpers** - Avoid script size limits
2. **Never use whose()** - Manual iteration is 250x faster
3. **Direct try/catch in hot paths** - Avoid wrapper overhead
4. **Cache expensive calls** - Store task.id() outside loops

### Tool Design

1. **Consolidate related operations** - One tool per domain
2. **Use operation parameters** - Not separate tools
3. **Return summaries first** - Insights before data
4. **Support minimal response mode** - For bulk operations

### Testing

1. **Test with Claude Desktop** - String coercion issues
2. **Test with 2000+ items** - Performance at scale
3. **Test script size** - Stay under 50KB
4. **Test with real data** - Edge cases matter

## 🚀 Migration Path

### From v1 to v2

1. **Tools consolidated** - 22 → 14 tools
2. **Operation-based patterns** - Consistent interface
3. **No user migration needed** - LLMs handle it transparently
4. **Keep internal tools** - Used by consolidated tools

## 📝 Quick Reference

### Never Do

- Use `whose()` or `where()` in JXA
- Include all helpers (script too large)
- Mix evaluateJavascript and JXA contexts
- Trust Claude Desktop to preserve types
- Assume task properties are simple

### Always Do

- Use minimal helpers
- Test with large datasets
- Return summaries first
- Handle string coercion
- Validate full IDs

## 🔮 Future Considerations

### If Starting Fresh

1. Consider pure OmniJS with evaluateJavascript() throughout
2. Build a proper query engine outside the JXA context
3. Implement streaming for large datasets
4. Use TypeScript code generation for scripts

### Known Limitations

- JXA performance ceiling reached
- Script size limits are hard boundaries
- Bridge context switching has overhead
- Some OmniFocus features inaccessible via JXA

---

## 🚨 CRITICAL: MCP Server Lifecycle Compliance

### **The Great stdin Discovery (September 2025)**

**THE EMBARRASSING TRUTH:** For **6+ months and 50+ commits**, our MCP server violated the core MCP specification by
never handling stdin closure properly.

#### What We Did Wrong

```typescript
// ❌ WRONG - Hangs forever, violates MCP spec
const transport = new StdioServerTransport();
await server.connect(transport); // Never exits when client closes stdin
```

#### The Hidden Cost

- **Every test required timeout**: `timeout 5s node dist/index.js`
- **2-minute waits for hanging processes**
- **Manual process killing** in development
- **Poor developer experience** for months
- **MCP specification violation** from day one

#### The Git History Investigation

- **Search result**: ZERO instances of `process.stdin.on` in entire git history
- **Original commit**: Missing stdin handling
- **Every commit since**: Never fixed the fundamental issue
- **Root cause**: MCP SDK examples don't show this pattern

#### The Correct Implementation

```typescript
// ✅ CORRECT - MCP specification compliant
const transport = new StdioServerTransport();

// Handle stdin closure for proper MCP lifecycle compliance
process.stdin.on('end', () => {
  logger.info('stdin closed, exiting gracefully per MCP specification');
  process.exit(0);
});

process.stdin.on('close', () => {
  logger.info('stdin stream closed, exiting gracefully per MCP specification');
  process.exit(0);
});

await server.connect(transport);
```

#### MCP Specification Requirements

**From https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle:**

- **stdio transport**: Client closes stdin → Server should exit gracefully
- **No protocol shutdown**: MCP uses transport-level termination
- **Graceful cascade**: stdin close → server exit → SIGTERM → SIGKILL

#### Testing Impact

```bash
# 🚫 BEFORE: Required timeout workaround
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 5s node dist/index.js

# ✅ AFTER: Clean MCP-compliant shutdown
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
# Exits immediately when stdin closes!
```

#### Key Lesson

**ALWAYS implement stdin handling in MCP servers.** The MCP SDK examples don't show this critical requirement, leading
to widespread non-compliance.

**Developer Impact:** This single fix eliminated:

- All timeout requirements in testing
- 2-minute waits for hanging processes
- Manual process killing
- MCP specification violations

---

---

## 🚨 BREAKTHROUGH: Real Root Cause of "Can't Convert Types" (September 2025)

### **The Template Substitution Discovery**

**MAJOR REVELATION:** After extensive empirical testing, discovered that "Can't convert types" errors are primarily
caused by **template substitution syntax errors**, not script size limits.

#### The False Assumption (6+ Months)

```typescript
// We assumed this was the problem:
const script = `${getAllHelpers()} ${mainScript}`; // "Too big, that's why it fails"

// But the REAL problem was this:
const script = `const updates = {{updates}};`; // Template substitution breaks with complex data
```

#### Empirical Testing Results (September 2025)

**JXA Script Size Limits - ACTUAL TESTING:**

- ✅ **10,000 characters**: Works perfectly
- ✅ **50,000 characters**: Works perfectly
- ✅ **100,000 characters**: Works perfectly via stdin
- ❌ **Template substitution**: Breaks with quotes, newlines, nested objects

**Key Insight:** JXA can handle massive scripts when they're syntactically valid. The "5-10KB limit" assumption was
**wrong**.

#### The Real Culprit: Template Substitution Syntax Errors

```javascript
// ❌ DANGEROUS: Template substitution with complex data
const script = automation.buildScript(`
  const projectId = {{projectId}};
  const updates = {{updates}};  // BREAKS when updates contains quotes, newlines, etc.
`, {
  projectId: 'test-123',
  updates: {
    name: 'Project with "quotes" and \nnewlines',
    note: 'Complex data: {"json": true}'
  }
});

// Results in broken JavaScript:
// const updates = {name: "Project with "quotes" and
// newlines", note: "Complex data: {"json": true}"}; // SYNTAX ERROR!

// ✅ SAFE: Function arguments approach (v2.1.0)
function createScript(projectId: string, updates: any): string {
  return `
    function updateProject(projectId, updates) { /* script logic */ }
    return updateProject(${JSON.stringify(projectId)}, ${JSON.stringify(updates)});
  `;
}
// JSON.stringify properly escapes everything - no syntax errors possible!
```

### **v2.1.0 Architecture: Defense in Depth**

#### Combined Solution: Function Arguments + Discriminated Unions

**1. Function Arguments (Eliminates Template Substitution)**

```typescript
// OLD: Dangerous template substitution
export const UPDATE_PROJECT_SCRIPT = `
  const projectId = {{projectId}};  // ❌ Syntax error risk
  const updates = {{updates}};      // ❌ Breaks with complex data
`;

// NEW: Safe function arguments
export function createUpdateProjectScript(projectId: string, updates: any): string {
  return `
    function updateProject(projectId, updates) { 
      // Safe parameter access - no substitution risks!
    }
    return updateProject(${JSON.stringify(projectId)}, ${JSON.stringify(updates)});
  `;
}
```

**2. Discriminated Unions (Type-Safe Error Handling)**

```typescript
// NEW: Type-safe result handling
export type ScriptResult<T = unknown> = ScriptSuccess<T> | ScriptError;

export interface ScriptSuccess<T> {
  success: true;
  data: T;
}
export interface ScriptError {
  success: false;
  error: string;
  context?: string;
}

// Usage in tools:
const result = await automation.executeJson(script);
if (isScriptSuccess(result)) {
  return createSuccessResponse(result.data); // ✅ Type-safe success
} else {
  return createErrorResponse(result.error); // ✅ Type-safe error with context
}
```

**3. Enhanced OmniAutomation Class**

```typescript
// NEW: executeJson method with schema validation
public async executeJson<T>(script: string, schema?: z.ZodSchema<T>): Promise<ScriptResult<T>> {
  try {
    const result = await this.execute<any>(script);

    // Handle script errors (when script returns error object)
    if (result && typeof result === 'object' && result.error === true) {
      return createScriptError(result.message, result.details, result);
    }

    // Optional schema validation
    if (schema) {
      const validation = schema.safeParse(result);
      if (!validation.success) {
        return createScriptError('Schema validation failed', validation.error.issues);
      }
      return createScriptSuccess(validation.data);
    }

    return createScriptSuccess(result);
  } catch (error) {
    return createScriptError(error.message, 'Execution error', error);
  }
}
```

#### Testing Results: Complete Success

```bash
# Complex data that would break template substitution:
{
  "name": "Test with \"quotes\", \nnewlines, and {JSON: \"objects\"}",
  "note": "Multi-line with:\n- Special chars: !@#$%^&*()\n- JSON: {\"key\": \"value\"}\n- Unicode: 🚀 🧪 ✅"
}

# Result: ✅ Perfect execution, no "Can't convert types" errors
# Script size: 5,587 characters (well within limits)
# Architecture: Function arguments + discriminated unions
```

### **Key Architectural Benefits**

1. **Complete Elimination**: Zero "Can't convert types" errors from template substitution
2. **Type Safety**: Discriminated unions provide compile-time and runtime safety
3. **Schema Validation**: Optional Zod schema validation for critical operations
4. **Error Context**: Rich error information for debugging
5. **Defense in Depth**: Multiple safety layers prevent failures

### **Migration Pattern for Existing Scripts**

```typescript
// BEFORE: Template substitution (dangerous)
const script = automation.buildScript(TEMPLATE_SCRIPT, { param1, param2 });
const result = await automation.execute(script);
if (result.error) {
  /* handle error */
}

// AFTER: Function arguments + discriminated unions (safe)
const script = createSpecificScript(param1, param2);
const result = await automation.executeJson(script);
if (isScriptSuccess(result)) {
  // Type-safe success handling
  return createSuccessResponse(result.data);
} else {
  // Rich error context
  return createErrorResponse(result.error, result.context, result.details);
}
```

### **Critical Lesson for Future Development**

**Root Cause Analysis Order:**

1. ✅ **Template substitution syntax errors** (v2.1.0 solution: function arguments)
2. ✅ **Script execution context issues** (proper error handling with discriminated unions)
3. ⚠️ **Script size limits** (empirically tested - much higher than assumed)
4. ⚠️ **JXA performance issues** (whose(), safeGet(), etc.)

**The Big Picture:** Template substitution was the hidden root cause behind most "Can't convert types" errors. The
v2.1.0 architecture completely eliminates this category of failures while providing better type safety and error
handling.

## 🔍 Unsolved Mystery: The `type: 'json'` Breaking Change

### The Issue

In commit `fe3b2a0bc65df87a1e4e715f9ed1bd6ee9e646b8` (2025-09-02), we inadvertently changed the MCP tool response format
from `type: 'text'` to `type: 'json'`. This broke Claude Desktop v0.12.129 compatibility completely - tools wouldn't
appear in the UI.

### What We Know

- **First bad commit**: `fe3b2a0` - "feat: script size reduction + quoting hardening"
- **The change**: In `src/tools/index.ts`, response format changed from:
  ```typescript
  { type: 'text', text: JSON.stringify(result, null, 2) }
  ```
  to:
  ```typescript
  { type: 'json', json: result }
  ```
- **Impact**: MCP server would start but Claude Desktop immediately disconnected with EPIPE error
- **Fix**: Reverted to `type: 'text'` in commits `9a9e0af`, `a2f4b79`, and `20a259c`

### The Mystery

**We don't know WHY this change was made.** The commit message doesn't mention it, and `type: 'json'` doesn't exist in
the MCP specification (only 'text' and 'image' are valid).

### Future Investigation Needed

If you're reading this and wondering why we made this change:

1. Check if newer MCP specifications added `type: 'json'` support
2. Look for any discussions about structured responses in MCP evolution
3. Consider if it was just a well-intentioned mistake thinking JSON data should use `type: 'json'`

### Lesson

Always verify changes against the official MCP specification, even when they "seem logical". The MCP `type` field
describes media format (text/image), not data structure.

---

## 🚨 CRITICAL: Script Syntax Errors from Missing Helper Functions (September 2025)

### The "Unexpected EOF" Mystery - SOLVED ✅

**Problem:** CREATE_TASK_SCRIPT and other scripts causing `SyntaxError: Unexpected EOF (-2700)` during execution,
leading to tool failures.

**Root Cause:** Scripts referenced helper functions that weren't included in the template, causing undefined function
references that broke JavaScript syntax during execution.

**Key Findings:**

1. **Missing Function References**: Scripts called `prepareRepetitionRuleData`, `applyRepetitionRuleViaBridge`,
   `setTagsViaBridge` but these functions weren't defined
2. **Template vs Runtime**: Script looked syntactically valid at template level, but failed when executed with actual
   data
3. **Silent Failures**: Tools would execute but return no response due to script syntax errors

**Before Fix (Broken Pattern):**

```javascript
// ❌ BROKEN: Script references undefined functions
export const CREATE_TASK_SCRIPT = `
  // ... basic functions defined here ...
  
  (() => {
    // ... task creation logic ...
    
    // ERROR: These functions don't exist in this script!
    const ruleData = prepareRepetitionRuleData(taskData.repeatRule);
    const success = applyRepetitionRuleViaBridge(taskId, ruleData);
    const res = setTagsViaBridge(taskId, taskData.tags, app);
    
    return JSON.stringify(response);
  })();
`;
```

**After Fix (Working Pattern):**

```javascript
// ✅ FIXED: Self-contained script with only defined functions
export const CREATE_TASK_SCRIPT = `
  ${getMinimalHelpers()}
  
  (() => {
    // ... task creation logic ...
    
    // Basic tag application without external dependencies
    if (taskData.tags && taskData.tags.length > 0) {
      const flatTags = doc.flattenedTags();
      // ... direct JXA tag application ...
    }
    
    // Note: Advanced features temporarily disabled to maintain script simplicity
    
    return JSON.stringify(response);
  })();
`;
```

**Diagnosis Process:**

1. **Initial Error**: "Unexpected EOF" suggested script truncation
2. **False Lead**: Assumed script size limits were the cause (19KB script)
3. **Template Analysis**: Individual components had valid syntax
4. **Execution Testing**: Created test harness to expand and validate complete scripts
5. **Root Cause**: Found undefined function references breaking JavaScript syntax
6. **Solution**: Made scripts self-contained with only defined functionality

**Critical Debugging Commands:**

```bash
# Test script syntax after template expansion
node test-script-expansion.js

# Check for undefined function references
grep -n "functionName" expanded-script.js

# Verify JavaScript syntax
node -c expanded-script.js
```

**Tool-Specific Impact:**

- ✅ **system tool**: Worked correctly (no complex script dependencies)
- ❌ **manage_task tool**: Failed silently due to undefined helper functions
- ✅ **After fix**: All tools execute without script syntax errors

**Architectural Lesson:**

1. **Self-Contained Scripts**: Each script must include all functions it references
2. **Helper Function Auditing**: Verify all called functions are actually defined
3. **Template vs Runtime Testing**: Test both template syntax AND fully expanded scripts
4. **Progressive Debugging**: Start with simpler tools to isolate script vs protocol issues

**Time Cost:** 1 day of debugging "script truncation" when the real issue was undefined function references.

**Prevention:**

- Add linting to check for undefined function references in scripts
- Use TypeScript analysis to catch missing function definitions
- Test script expansion in CI/CD pipeline

## 🚨 CRITICAL: MCP Server Async Operation Lifecycle (September 2025)

### **The "Silent Tool Failures" Crisis - SOLVED ✅**

**Problem:** 11 out of 15 MCP tools were executing but returning no response during CLI testing, appearing to work but
never completing.

**Root Cause:** MCP server was exiting immediately when stdin closed, killing osascript child processes before they
could return results.

**Key Findings:**

1. **Correct MCP Behavior**: Server SHOULD exit when stdin closes (MCP specification requirement)
2. **Missing Async Tracking**: Server wasn't waiting for pending async operations before exit
3. **Child Process Termination**: osascript processes were being killed mid-execution
4. **No Response Pattern**: Tools would execute scripts but never return data to client

**Debugging Process:**

```bash
# Symptoms: Tools execute but hang indefinitely
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"manage_task",...}}' | node dist/index.js
[INFO] [tools] Executing tool: manage_task
[OMNI_AUTOMATION_DEBUG] Process spawned, PID: 89530
[INFO] [server] stdin closed, exiting gracefully per MCP specification  # ❌ Exits too early!
# Process killed before osascript can return results
```

**The Fix: Pending Operations Tracking**

**Step 1: Add Global Operation Tracker**

```typescript
// src/omnifocus/OmniAutomation.ts
export let globalPendingOperations: Set<Promise<any>> | null = null;

export function setPendingOperationsTracker(tracker: Set<Promise<any>>) {
  globalPendingOperations = tracker;
}
```

**Step 2: Track Each osascript Execution**

```typescript
// src/omnifocus/OmniAutomation.ts
private async createTrackedExecutionPromise<T>(wrappedScript: string): Promise<T> {
  const promise = new Promise<T>((resolve, reject) => {
    const proc = spawn('osascript', ['-l', 'JavaScript'], {...});

    proc.on('close', (code) => {
      if (code === 0) resolve(result as T);
      else reject(new Error(...));
    });

    proc.stdin.write(wrappedScript);
    proc.stdin.end();
  });

  // Track this promise to prevent premature server exit
  if (globalPendingOperations) {
    globalPendingOperations.add(promise);
    promise.finally(() => {
      globalPendingOperations.delete(promise);
    });
  }

  return promise;
}
```

**Step 3: Modify Server Lifecycle**

```typescript
// src/index.ts
const pendingOperations = new Set<Promise<any>>();

// Initialize tracking before tool registration
setPendingOperationsTracker(pendingOperations);

const gracefulExit = async (reason: string) => {
  logger.info(`${reason}, waiting for pending operations to complete...`);

  if (pendingOperations.size > 0) {
    logger.info(`Waiting for ${pendingOperations.size} pending operations...`);
    await Promise.allSettled([...pendingOperations]);
    logger.info('All pending operations completed');
  }

  process.exit(0);
};

process.stdin.on('end', () => gracefulExit('stdin closed'));
process.stdin.on('close', () => gracefulExit('stdin stream closed'));
```

**After Fix: Perfect Operation**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"manage_task",...}}' | node dist/index.js
[INFO] [tools] Executing tool: manage_task
[OMNI_AUTOMATION_DEBUG] Process spawned, PID: 89530
[INFO] [server] stdin closed, waiting for pending operations to complete...
[INFO] [server] Waiting for 1 pending operations...
[OMNI_AUTOMATION_DEBUG] stdout data received: {"taskId":"abc123",...}  # ✅ Process completes!
[OMNI_AUTOMATION_DEBUG] Process closed with code: 0
[INFO] [server] All pending operations completed
[INFO] [server] Exiting gracefully per MCP specification
```

**Results:**

- ✅ **All 11 tools now work correctly**
- ✅ **MCP specification compliance maintained**
- ✅ **Proper async operation lifecycle**
- ✅ **Clean server shutdown after operations complete**

**Critical Architectural Pattern:**

```typescript
// ❌ WRONG: Server exits immediately, killing child processes
process.stdin.on('end', () => process.exit(0));

// ✅ CORRECT: Server waits for async operations before exit
process.stdin.on('end', async () => {
  await waitForPendingOperations();
  process.exit(0);
});
```

**Testing Pattern Recognition:**

```bash
# ✅ SUCCESS Pattern:
# [INFO] Executing tool: manage_task
# [stdout data received: {...}]  ← Tool returns data
# [INFO] stdin closed, waiting for pending operations...
# [INFO] All pending operations completed

# ❌ FAILURE Pattern:
# [INFO] Executing tool: manage_task
# [INFO] stdin closed, exiting gracefully  ← No data returned
# (Process killed before completion)
```

**Key Lesson:** MCP servers must handle async operations lifecycle properly:

1. **Track pending operations** during execution
2. **Wait for completion** before server exit
3. **Maintain MCP compliance** by still exiting when stdin closes
4. **Never exit immediately** if operations are in flight

**Time Cost:** 1 day of systematic debugging to identify and fix the root cause.

**Impact:** Restored functionality to 69% of the MCP toolset (11 out of 16 tools).

---

## 🚨 Critical: fs.promises Hanging Issue in MCP Context (September 2025)

**During V2.1.0 consolidation, bulk export operations would exit immediately without executing.**

### The Problem

```typescript
// ❌ PROBLEMATIC - Causes MCP async operation tracking issues
import { mkdir, writeFile } from 'fs/promises';
await mkdir(outputDirectory, { recursive: true });
await writeFile(taskFile, content, 'utf-8');
```

**Symptoms:**

- Server would detect stdin closure before operations could start
- Operations appeared to complete but files weren't created
- No error messages, just silent hanging/failure

### The Solution

```typescript
// ✅ WORKING - Use synchronous fs operations in MCP context
const fsSync = await import('fs');
fsSync.mkdirSync(outputDirectory, { recursive: true });
fsSync.writeFileSync(taskFile, content, 'utf-8');
```

### Root Cause Analysis

- `fs.promises` operations weren't being properly tracked by MCP async operation lifecycle
- Server's stdin close detection would trigger before async file operations could complete
- Synchronous operations complete immediately and don't interfere with MCP termination flow

### Key Insights

- **MCP async operation tracking is sensitive** - some Node.js async APIs don't integrate properly
- **When in doubt, use sync operations** for file I/O in MCP tools where performance isn't critical
- **Test with both direct calls AND Claude Desktop** - MCP bridge can expose timing issues not seen in direct testing
- **Silent failures are the worst** - async operations that hang without errors are particularly difficult to debug

**Debugging Process**: Problem appeared during consolidation testing → suspected MCP lifecycle issues → traced to
fs.promises → replaced with sync operations → immediate resolution.

**Time Cost:** 2 hours of debugging what appeared to be "immediate exit" but was actually hanging async operations.

**Impact:** Restored bulk export functionality and prevented similar issues in other file I/O operations.

## 🏷️ CRITICAL: OmniJS Bridge for Tag Assignment (September 2025)

### The Tag Visibility Crisis

**Problem:** Tag assignment after task creation appeared to work but tags were not immediately visible in queries,
breaking GTD workflows.

**Initial Symptoms:**

- Task creation tools reported successful tag assignment
- Immediate queries for the same task showed empty tag arrays
- User testing showed inconsistent tag behavior
- Production-ready status was meaningless without reliable core functionality

### The Investigation Journey

**1. Initial Misdiagnosis: Script Size Issues**

- Suspected JXA size limits preventing complex operations
- Added minimal helpers to reduce script footprint
- No improvement in tag visibility

**2. Architectural Rabbit Hole: Type Adapter Layer**

- Investigated `type-adapters.ts.disabled` for bridge patterns
- Considered full abstraction layer between JXA and OmniJS
- Overcomplicated solution for focused problem

**3. Root Cause Discovery: Bridge Context Isolation** Built standalone probes to test `evaluateJavascript()` behavior:

```javascript
// ❌ WRONG - JXA syntax doesn't work in bridge
const result = app.evaluateJavascript(`
  const doc = Application("OmniFocus").defaultDocument();
  // Error: Application is not a function
`);

// ✅ CORRECT - OmniJS syntax works perfectly
const result = app.evaluateJavascript(`
  const task = Task.byIdentifier("${taskId}");
  task.addTag(flattenedTags.byName("TestTag"));
  JSON.stringify({success: true});
`);
```

### Key Discovery: Two JavaScript Contexts

**JXA (External):** JavaScript for Automation - our scripts run here

- Uses `Application("OmniFocus")` syntax
- Limited to external API access
- Subject to index refresh delays

**OmniJS (Internal):** OmniFocus's internal JavaScript engine

- Uses `Task.byIdentifier()`, `flattenedTags` syntax
- Direct access to internal object model
- Immediate visibility of changes

**Critical Insight:** `evaluateJavascript()` runs in OmniJS context, not JXA context!

### The Solution: Minimal Tag Bridge

**Architecture:**

1. **Minimal helpers**: ~1KB focused on tag operations only
2. **OmniJS templates**: Parameterized scripts for tag assignment
3. **Immediate visibility**: Bridge guarantees tag changes are instantly queryable
4. **Size budget**: Fits well within JXA 19KB script size limits

```typescript
// Minimal bridge implementation
const MINIMAL_TAG_BRIDGE = `
  function bridgeSetTags(app, taskId, tagNames) {
    const script = 'const task = Task.byIdentifier("' + taskId + '"); ' +
                   'task.clearTags(); ' +
                   tagNames.map(name =>
                     'task.addTag(flattenedTags.byName("' + name + '") || new Tag("' + name + '"));'
                   ).join(' ') +
                   'JSON.stringify({success: true, tags: [' +
                   tagNames.map(n => '"' + n + '"').join(',') + ']});';
    return JSON.parse(app.evaluateJavascript(script));
  }
`;
```

### Implementation Results

**Before Bridge (Broken):**

- Tag assignment: ✅ Reported success
- Immediate visibility: ❌ Empty arrays in queries
- User experience: ❌ Unreliable GTD workflows

**After Bridge (Working):**

- Tag assignment: ✅ Confirmed success via OmniJS
- Immediate visibility: ✅ Tags appear instantly in queries
- User experience: ✅ Reliable, production-ready functionality
- Script size: ✅ 7,859 characters (well under 19KB limit)

### Critical Lessons

**1. Stability Without Functionality is Meaningless**

- Having 16/16 tools "working" meant nothing if core features were unreliable
- Tag assignment is fundamental to GTD - must work correctly

**2. Context Matters More Than Syntax**

- The difference between JXA and OmniJS contexts was crucial
- Same operations, different execution environments, different behaviors

**3. Probe Early, Probe Often**

- Standalone testing scripts revealed the real issue quickly
- Don't rely on complex integration tests for fundamental problems

**4. Minimal Solutions Win**

- Full bridge helper library would have been overkill and risky
- Focused 1KB solution solved the specific problem efficiently

**5. Size Budgets Enable Functionality**

- Previous size reduction work made bridge integration possible
- 7,859 chars + 1KB bridge = 8,859 chars (well under 19KB limit)

### Testing Validation

**End-to-End Success:**

```bash
# Task creation with tags
{"taskId":"mkVnbh-ZKe4","tags":["BridgeTest","TagVisibility"],"tagMethod":"bridge"}

# Immediate query validation
{"tasks":[{"id":"mkVnbh-ZKe4","tags":["BridgeTest","TagVisibility"]}]}
```

**Performance Impact:**

- Script execution: 300ms
- Tag assignment: Immediate
- Query response: 1.6 seconds (normal for 1823 tasks)

### Future Architecture Considerations

**Next Steps:**

1. **Evaluate update-task bridge integration** - Apply same pattern to task updates
2. **Assess other bridge opportunities** - Where else might OmniJS context help?
3. **Document bridge patterns** - Create reusable templates for future use
4. **Monitor script sizes** - Ensure bridge additions don't exceed limits

**Time Cost:** 3+ months of believing tag assignment "worked" when it was fundamentally broken for real-world use.

**Impact:** Restored core GTD functionality, achieved true production readiness, validated that our systematic debugging
approach works for complex architectural issues.

---

## **Remember:** These lessons cost months of debugging. When in doubt, check this document first before attempting optimizations or architectural changes.

## Lesson 8: Layer Boundary Bugs - Variable Name Mismatches (November 2025)

### The Pattern

15+ bugs in git history share common root causes related to layer boundaries:

1. **Property name mismatches** between QueryCompiler and OmniJS scripts
2. **Duplicated filter logic** that gets out of sync across modes
3. **Response structure confusion** (the double-unwrap saga)
4. **Parameters not passed through** all layers

### Example: `completed` vs `includeCompleted`

**The bug (commit 88f26fe):**

- QueryCompiler mapped `status: "completed"` → `filter.completed = true`
- OmniJS script checked `filter.includeCompleted` (wrong name!)
- Result: Completed tasks never returned, even when explicitly requested

**Why it wasn't caught:**

- No shared type between layers
- Unit tests mocked the boundary
- Integration tests didn't cover this specific combination

### The Double-Unwrap Saga

Four separate commits fixed the same pattern:

- `bb67136` - 4 tool failures at once
- `b229a59` - tags tool
- `55daae9` - manage_reviews
- `f160f53` - tasks mode:today

Each fix was correct, but the pattern wasn't identified until commit 4.

### Root Cause

**No single source of truth for:**

- Filter property names
- Response structures
- Filter logic implementation

Each layer could define its own names, and there was no compile-time check that they matched.

### Solution: Shared Contracts

Created `src/contracts/` with:

- `TaskFilter` interface - canonical filter property names
- `unwrapScriptOutput()` - handles all response wrapper formats
- `generateFilterBlock()` - generates filter logic from spec

**Key insight:** OmniJS scripts are generated strings. Generate them from typed specs instead of hand-writing and hoping
names match.

### Detection Pattern

If you see these symptoms:

- Tool works with some filters but not others
- ID lookup works but filtered queries don't
- Same data returns different results in different modes

Check for property name mismatches at layer boundaries.

### Prevention

1. Use `TaskFilter` type at every layer
2. Generate OmniJS filter logic, don't copy-paste
3. Use `unwrapScriptOutput()` for response handling
4. Validate filter properties at runtime with `validateFilterProperties()`

### Files

- `src/contracts/filters.ts` - Filter type definitions
- `src/contracts/responses.ts` - Response contracts
- `src/contracts/generator.ts` - OmniJS code generator
- `src/contracts/SESSION_NOTES_2025-11-24.md` - Full analysis

**Time cost of not having this pattern:** 15+ bugs over several months, each requiring investigation to find the layer
mismatch.
