# Lessons Learned

Hard-won insights from developing OmniFocus MCP. Check here before repeating our mistakes.

---

## CLI Testing "Hanging" (December 2025)

**Problem:** CLI tests "hang indefinitely."

**Reality:** MCP servers exit when stdin closes (correct behavior). Tests failed due to missing `clientInfo` parameter.

```bash
# ❌ Missing clientInfo
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | node dist/index.js

# ✅ Correct
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
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

| Never                         | Always                              |
| ----------------------------- | ----------------------------------- |
| Use `whose()` in JXA          | Use minimal helpers                 |
| Mix bridge and JXA contexts   | Test with large datasets            |
| Trust Claude Desktop types    | Return summaries first              |
| Assume without testing        | Handle string coercion              |
| Skip pattern search           | Validate full IDs                   |
| Drop stash after failed apply | Verify file contents after recovery |

---

## Related Docs

- **PATTERNS.md** - Symptom → solution lookup
- **ARCHITECTURE.md** - JXA vs Bridge decisions
- **DEBUGGING_WORKFLOW.md** - Systematic approach
