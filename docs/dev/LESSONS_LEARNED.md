# Lessons Learned

Hard-won insights from developing OmniFocus MCP. Check here before repeating our mistakes.

---

## CLI Testing "Hanging" (December 2025)

**Problem:** CLI tests "hang indefinitely."

**Reality:** MCP servers exit when stdin closes (correct behavior). Tests failed due to missing `clientInfo` parameter.

```bash
# ❌ Missing clientInfo
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' | node dist/index.js

# ✅ Correct
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
```

**Cost:** 6+ months believing CLI testing was broken.

---

## Pattern Search Before Implementation (October 2025)

**Problem:** Spent 2+ hours implementing "two-stage query enrichment" that already existed as "embedded bridge helper"
in `minimal-tag-bridge.ts`.

**Rule:** Search before implementing.

```bash
grep -r "bridge\|evaluateJavascript" src/omnifocus/scripts/shared/
```

**Red flags that mean "search first":**

- "This feels like it should already exist"
- "I need to access data that JXA can't handle"
- "I'm implementing something for the second time"

**Cost:** 2+ hours vs 15 minutes if searched first. **ROI: 10x faster development.**

---

## Refactoring Regression - Advanced Filters (November 2025)

**Problem:** v3.0.0 refactor broke text search and date range filters. ZERO results for valid queries.

**Cause:** Mode-based filtering optimization only implemented tag filtering in all/default mode.

| Filter                       | Before Fix     | After Fix         |
| ---------------------------- | -------------- | ----------------- |
| Text `{contains: "meeting"}` | 10 wrong tasks | 12 matching tasks |
| Date range                   | 0 in range     | 9 in range        |

**Lesson:** When refactoring filters, test ALL filter types, not just common ones.

**Prevention:** Document all filter types BEFORE refactoring, write tests for each.

---

## Script Size Assumptions (September 2025)

**Problem:** Assumed 19KB script limit. **Reality: 523KB for JXA, 261KB for OmniJS (27x larger).**

| Context     | Assumed | Actual              |
| ----------- | ------- | ------------------- |
| JXA         | 19KB    | 523KB               |
| OmniJS      | 19KB    | 261KB               |
| Our largest | -       | 31KB (6% of actual) |

**Cost:** Months of unnecessary optimization solving non-existent problems.

**Lesson:** Empirically test assumptions before documenting as facts.

---

## Never Use whose() in JXA

```javascript
// ❌ Takes 25+ seconds
doc.flattenedTasks.whose({ completed: false })();

// ✅ Takes <100ms
const tasks = doc.flattenedTasks();
for (let i = 0; i < tasks.length; i++) {
  if (!tasks[i].completed()) result.push(tasks[i]);
}
```

---

## Bridge Context Consistency

```javascript
// ❌ Mixed contexts - changes invisible
app.evaluateJavascript(`task.tags = [tag1]`); // Write via bridge
const tags = task.tags(); // Read via JXA - won't see changes!

// ✅ Same context
app.evaluateJavascript(`
  task.tags = [tag1];
  task.tags.map(t => t.name());  // Read in same context
`);
```

---

## MCP Type Coercion

Claude Desktop converts ALL parameters to strings.

```typescript
// ❌ Fails with Claude Desktop
z.number(); // Receives "25" not 25
z.boolean(); // Receives "true" not true

// ✅ Works everywhere
z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]);
coerceBoolean(); // from coercion-helpers.ts
```

---

## MCP Server Lifecycle (September 2025)

**Problem:** 11/15 tools executed but returned no response.

**Cause:** Server exited immediately when stdin closed, killing osascript child processes.

```typescript
// ❌ Exits immediately, kills child processes
process.stdin.on('end', () => process.exit(0));

// ✅ Waits for pending operations
const pendingOps = new Set<Promise<any>>();
setPendingOperationsTracker(pendingOps);

process.stdin.on('end', async () => {
  await Promise.allSettled([...pendingOps]);
  process.exit(0);
});
```

---

## fs.promises in MCP Context

```typescript
// ❌ Hangs - not tracked by MCP async lifecycle
import { writeFile } from 'fs/promises';
await writeFile(path, content);

// ✅ Works
import fs from 'fs';
fs.writeFileSync(path, content);
```

---

## Tag Assignment Requires Bridge

JXA tag assignment doesn't persist. Use OmniJS bridge.

```javascript
// ❌ Fails silently
task.addTags(tags);

// ✅ Works
const script = `
  const task = Task.byIdentifier("${taskId}");
  task.clearTags();
  tagNames.forEach(n => task.addTag(flattenedTags.byName(n) || new Tag(n)));
`;
app.evaluateJavascript(script);
```

---

## Template Substitution Syntax Errors

**Problem:** "Can't convert types" errors blamed on script size.

**Reality:** Template substitution breaks with complex data (quotes, newlines, nested objects).

```typescript
// ❌ Breaks with complex data
const script = `const updates = {{updates}};`;

// ✅ Safe - JSON.stringify escapes everything
function createScript(updates: any): string {
  return `return updateProject(${JSON.stringify(updates)});`;
}
```

---

## Layer Boundary Bugs

**Pattern:** 15+ bugs from property name mismatches between layers.

| Layer         | Used              | Expected           |
| ------------- | ----------------- | ------------------ |
| QueryCompiler | `completed: true` | -                  |
| OmniJS script | -                 | `includeCompleted` |

**Solution:** Shared contracts in `src/contracts/`:

- `TaskFilter` interface - canonical names
- `unwrapScriptOutput()` - response handling
- `generateFilterBlock()` - generate, don't copy-paste

---

## Eliminating `any` with Destructuring (February 2026)

**Problem:** Filter normalization used `any` to handle legacy property migration, causing ESLint warnings and losing
type safety.

```typescript
// ❌ Uses any - no type checking, ESLint warnings
export function normalizeFilter(filter: TaskFilter): NormalizedTaskFilter {
  const normalized: any = { ...filter };
  if (normalized.includeCompleted !== undefined) {
    normalized.completed = normalized.includeCompleted;
    delete normalized.includeCompleted;
  }
  return normalized as NormalizedTaskFilter;
}
```

**Solution:** Use destructuring with rest spread to separate properties, then use `Omit<>` for the intermediate type.

```typescript
// ✅ Full type safety, no any needed
export function normalizeFilter(filter: TaskFilter): NormalizedTaskFilter {
  // Destructure separates legacy property from rest
  const { includeCompleted, ...rest } = filter;

  // rest is automatically typed as Omit<TaskFilter, 'includeCompleted'>
  const normalized: Omit<TaskFilter, 'includeCompleted'> = { ...rest };

  // Type-checked assignment
  if (includeCompleted !== undefined && normalized.completed === undefined) {
    normalized.completed = includeCompleted;
  }

  // Only assertion needed is for the brand
  return Object.assign(normalized, { [BRAND]: true }) as NormalizedTaskFilter;
}
```

**When to use this pattern:**

- Removing a property from an object while transforming it
- Migrating legacy property names to new names
- Any transformation where you'd otherwise reach for `any`

**Key insight:** Destructuring with `...rest` automatically creates a properly typed object without the extracted
properties. No `delete` needed, no `any` needed.

---

## Lint-Staged Stash Recovery (December 2025)

**Problem:** CLAUDE.md (1138 lines) was completely wiped and committed as empty.

**Cause:** lint-staged failed on a symlink, created a stash backup, then the restore failed due to a conflict. The stash
was dropped without proper recovery.

```bash
# ❌ What happened - lost all changes
git stash apply --index stash@{0}  # Failed with conflict
git stash drop stash@{0}           # Dropped backup without recovering!
git commit --no-verify             # Committed corrupted state

# ✅ What should have happened
git stash apply --index stash@{0}  # Failed with conflict
git stash show -p stash@{0}        # Inspect the stash contents
git checkout stash@{0} -- CLAUDE.md  # Recover specific files
git stash drop stash@{0}           # Only drop after recovery
```

**Prevention:**

1. Added `.prettierignore` to exclude symlinks
2. Never drop stash after failed apply without investigating
3. Always verify file contents after recovery: `wc -l FILE && head -5 FILE`
4. Use `git diff --staged` before committing after any recovery

**Cost:** Critical documentation file deleted, required git archaeology to restore.

---

## Overdue Mode AST Migration (February 2026)

**Problem:** The overdue mode used a hand-concatenated OmniJS script (`GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT`) that
broke when `//` comments were introduced — the string concatenation collapsed them into a single line, commenting out
everything after them. We patched the comments, but the root fix was migrating to the AST builder.

**Migration:** Replaced the legacy handler with `buildListTasksScriptV4()` using `dueBefore` + `dueDateOperator: '<'`.
This follows the same pattern as `handleAvailableTasks()` and gives overdue mode advanced filter support (tags, project,
text search) for free.

**Benchmark results (26 overdue tasks):**

| Metric           | Legacy  | AST (script only) | AST (total w/ MCP startup) |
| ---------------- | ------- | ----------------- | -------------------------- |
| Avg execution    | ~6800ms | ~6750ms           | ~17100ms                   |
| Task count       | 26      | 26                | 26                         |
| MCP startup cost | —       | —                 | ~10300ms                   |
| Routing/parsing  | —       | —                 | ~60ms                      |

**Key findings:** Script execution time is identical. The ~10s overhead in end-to-end MCP benchmarks is server cold
start (Node.js process + module loading), irrelevant in real usage where the server stays running.

**Lesson:** Hand-concatenated scripts and AST-generated scripts perform identically. Prefer the AST builder — it
eliminates string-construction bugs by design.

---

## Flagged & Upcoming Mode AST Migration (February 2026)

**Context:** After the overdue migration proved the AST builder works, we migrated the two remaining eligible modes.

### Flagged mode

Replaced `FLAGGED_TASKS_PERSPECTIVE_SCRIPT` (OmniJS-first template) with `buildListTasksScriptV4({ flagged: true })`.

**Benchmark results (8 flagged tasks):**

| Metric           | Legacy  | AST (script only) | AST (total w/ MCP startup) |
| ---------------- | ------- | ----------------- | -------------------------- |
| Avg execution    | ~6150ms | ~6480ms           | ~18100ms                   |
| Task count       | 8       | 8                 | 8                          |
| MCP startup cost | —       | —                 | ~11000ms                   |

**Finding:** Script execution parity. Task counts match exactly.

### Upcoming mode

Replaced `GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT` (JXA + unified helpers) with
`buildListTasksScriptV4({ dueAfter, dueBefore })`.

**Benchmark results (7 days ahead):**

| Metric           | Legacy            | AST (script only) | AST (total w/ MCP startup) |
| ---------------- | ----------------- | ----------------- | -------------------------- |
| Avg execution    | **timeout (60s)** | ~7860ms           | ~21300ms                   |
| Task count       | 0 (timeout)       | 13                | 13                         |
| MCP startup cost | —                 | —                 | ~9350ms                    |

**Finding:** The legacy JXA script timed out at 60s because `doc.flattenedTasks()` with per-task JXA method calls
(`.dueDate()`, `.name()`, `.id()`) is too slow. The AST builder uses OmniJS bridge (direct property access), completing
in ~8s. This migration is a clear performance win, not just a maintenance improvement.

**Gains from migration:**

- Advanced filter support (tags, project, text search) for free on both modes
- Sorting support (flagged didn't sort before; upcoming now defaults to soonest-due-first)
- Cache keys include filter params, preventing incorrect cache hits
- 837 lines of legacy script code deleted

**What stayed legacy:** Today mode (`TODAYS_AGENDA_SCRIPT`) — its OR logic (overdue OR due_today OR flagged) with
per-task reason fields can't be expressed by the AST `TaskFilter` (AND-only). Low ROI since the legacy script already
uses OmniJS bridge.

---

## Writing Integration Benchmarks for MCP Servers (February 2026)

**Problem:** The overdue AST benchmark took three iterations to work. Each fix revealed the next failure.

| Attempt | Failure                                   | Root Cause                                                                           | Fix                                                |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1       | Legacy: `SyntaxError: Invalid escape`     | `osascript -e` chokes on multi-line scripts with quotes                              | Write script to temp file, run `osascript FILE`    |
| 1       | AST: "Unexpected response format"         | Fixed 10s timeout, but `waitForJsonResponse` re-registered listeners                 | (deferred — masked by attempt 2)                   |
| 2       | AST: "Timeout waiting for response" (5s)  | `spawn` stdout listener removed after init, missed tool response                     | Replaced with persistent `MCPClient` class         |
| 3       | AST: "Timeout waiting for response" (10s) | `drain()` split on `\n` but response sat in buffer without trailing newline to flush | Abandoned `spawn`; used `execSync` with shell pipe |

**Root insight:** Three independent bugs stacked. Each fix only exposed the next. The spawn-based approach had a
fundamental design flaw: re-registering listeners between messages creates race conditions when data arrives between
unregister and re-register. The `MCPClient` class with a persistent buffer fixed that — but still failed because
`drain()` relied on `\n` splitting, and the last chunk (potentially the entire response) stayed in the buffer as
"incomplete."

**The fix that worked:** `execSync` with `cat input.txt | node server.js`. Shell pipe handles all buffering. Simple
beats clever.

**Rules for MCP integration benchmarks:**

1. **Never pass scripts to `osascript -e`** — write to a temp file
2. **Never re-register stdout listeners** between MCP messages — use a persistent buffer
3. **Send `notifications/initialized`** after init (MCP protocol requirement; easy to forget)
4. **Prefer shell pipes** (`execSync` with `cat | node`) over `spawn` for benchmarks — the shell handles buffering
   correctly and the code is 10x simpler
5. **Measure startup separately** — cold start dominates wall-clock time but is irrelevant for real usage

**Cost:** ~45 minutes debugging benchmark infrastructure instead of measuring what we built. The migration itself took
10 minutes.

---

## Performance Benchmarks

| Operation             | Target | Killers                     |
| --------------------- | ------ | --------------------------- |
| Queries (2000+ tasks) | <1s    | `whose()`: +25s             |
| Write operations      | <500ms | `safeGet()` in loops: +50%  |
| Analytics             | <2s    | Date objects in loops: +30% |

---

## Best Practices

### Scripts

- Use minimal helpers (avoid size bloat)
- Never use `whose()`
- Direct try/catch in hot paths
- Cache expensive calls outside loops

### Tools

- Consolidate related operations
- Use operation parameters, not separate tools
- Return summaries before data
- Support minimal response mode

### Testing

- Test with Claude Desktop (string coercion)
- Test with 2000+ items (performance)
- Test with real data (edge cases)

---

## Quick Reference

| Never                           | Always                                     |
| ------------------------------- | ------------------------------------------ |
| Use `whose()` in JXA            | Use minimal helpers                        |
| Mix bridge and JXA contexts     | Test with large datasets                   |
| Trust Claude Desktop types      | Return summaries first                     |
| Assume without testing          | Handle string coercion                     |
| Skip pattern search             | Validate full IDs                          |
| Drop stash after failed apply   | Verify file contents after recovery        |
| Use `any` for transformations   | Use destructuring + `Omit<>`               |
| Hand-concatenate OmniJS scripts | Use AST builder (`buildListTasksScriptV4`) |
| Pass multi-line scripts to `-e` | Write to temp file for `osascript`         |
| Re-register stdout listeners    | Use persistent buffer or shell pipe        |

---

## OmniFocus Forecast "Past" View Logic (February 2026)

**Problem:** Matching the task count in OmniFocus Forecast's "Past" section requires understanding three non-obvious
rules.

**Forecast "Past" definition:**

```
(dueDate < start_of_today OR plannedDate < start_of_today)
  AND NOT blocked
  AND NOT completed
```

| Rule                       | Detail                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Start-of-day boundary      | Tasks due/planned _today_ appear in the Today row, not Past — even if the specific time has passed                  |
| Blocked exclusion          | Tasks blocked by sequential project ordering or dependencies are excluded                                           |
| OR logic across date types | A task appears if _either_ date is in the past — overdue (past due) and past-planned are unioned, then deduplicated |

**Why this matters:** Our `overdue` mode uses `dueDate < now` (exact time, due dates only). Forecast "Past" is broader
(includes planned dates) but stricter (day boundary, no blocked tasks). In testing with live data:

| Bucket                             | Count  |
| ---------------------------------- | ------ |
| `dueDate < now` (our overdue mode) | 36     |
| `dueDate < start_of_today`         | 33     |
| `plannedDate < start_of_today`     | 19     |
| Overlap (both dates in past)       | -3     |
| Blocked                            | -1     |
| **Forecast "Past"**                | **48** |

**If you need to replicate Forecast "Past":** Query overdue tasks + past-planned tasks separately, merge by ID, then
exclude blocked tasks. There is no single-query mode for this yet — our filter system doesn't support OR across
different date fields (except the special `todayMode` for the Today perspective).

---

## Related Docs

- **PATTERNS.md** - Symptom → solution lookup
- **ARCHITECTURE.md** - JXA vs Bridge decisions
- **DEBUGGING_WORKFLOW.md** - Systematic approach
