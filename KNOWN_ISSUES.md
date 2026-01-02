# Known Issues

## OmniFocus Script Errors

### Count-Only Query Timeout (All Filters, Not Just Flagged)

**Status:** FIXED (2026-01-01) - Now uses pure JXA instead of OmniJS bridge

**Issue:** Count-only queries timeout after ~2 minutes with "Failed to count tasks" error. This affects ALL count-only
queries, not just flagged filtering.

**Affected Tests:**

- [`tests/integration/tools/unified/end-to-end.test.ts`](tests/integration/tools/unified/end-to-end.test.ts)
  (line 239) - "should return count-only for flagged tasks"

**Root Cause:** OmniJS bridge performance is ~40x slower than pure JXA for iterating tasks.

| Method                                      | Time for 2,264 tasks |
| ------------------------------------------- | -------------------- |
| Pure JXA: `doc.flattenedTasks().length`     | ~3 seconds           |
| OmniJS: `flattenedTasks.length` via bridge  | ~2 minutes (timeout) |
| Pure JXA: iterate + check flagged/completed | ~42 seconds          |

The `buildTaskCountScript()` in `src/contracts/ast/script-builder.ts` uses OmniJS bridge (`app.evaluateJavascript()`)
which triggers the AppleEvent 2-minute timeout before completion.

**Error Message:**

```
AppleEvent timed out. (-1712)
Script execution failed with code null
```

**Workaround:**

- Use `{ filters: { flagged: true }, limit: 100 }` instead of `countOnly: true`
- OR skip count-only tests temporarily

**Fix Required:**

Rewrite `buildTaskCountScript()` to use pure JXA instead of OmniJS bridge:

```javascript
// Current (slow - uses OmniJS bridge)
const omniJsScript = `flattenedTasks.forEach(task => { ... })`;
app.evaluateJavascript(omniJsScript);

// Fixed (fast - pure JXA)
const tasks = doc.flattenedTasks();
for (let i = 0; i < tasks.length; i++) {
  if (tasks[i].flagged() && !tasks[i].completed()) count++;
}
```

**File to Update:** [`src/contracts/ast/script-builder.ts`](src/contracts/ast/script-builder.ts) -
`buildTaskCountScript()` function (lines 1328-1422)

**Resolution:**

The fix in `buildTaskCountScript()` switched from OmniJS bridge to pure JXA:

- Before: 2+ minutes (AppleEvent timeout)
- After: ~50 seconds for 2,255 tasks

Additionally, an optimization was added to only fetch tags when the filter actually uses them, saving ~40 seconds for
simple boolean filters like `flagged: true`.

**Commit:** See git history for the fix in `src/contracts/ast/script-builder.ts`.
