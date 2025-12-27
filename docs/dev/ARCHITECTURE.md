# Architecture Guide

Hybrid JavaScript execution: JXA entry point with OmniJS bridge for operations JXA cannot handle.

---

## Execution Model

| Layer | Context | Use |
|-------|---------|-----|
| **JXA** | `osascript -l JavaScript` | Entry point, reads, simple CRUD |
| **Bridge** | `app.evaluateJavascript()` | Tag assignment, repetition rules, bulk ops |
| **Pure OmniJS** | N/A | Never used directly |

---

## Decision Tree

```
Operation needed?
├── Reading data → Pure JXA
├── Creating/Updating tasks
│   ├── Without tags → Pure JXA
│   ├── With tags → JXA + Bridge
│   └── With repetition → JXA + Bridge
├── Task movement → JXA + Bridge
└── Bulk (>100 items) → JXA + Bridge
```

**Bridge required for:** Tag assignment (JXA limitation), task movement (preserves IDs), repetition rules, perspective queries.

---

## Implementation Patterns

### Pure JXA

```typescript
export const SIMPLE_SCRIPT = `
  ${getUnifiedHelpers()}
  (() => {
    const app = Application('OmniFocus');
    const task = app.defaultDocument().flattenedTasks()
      .find(t => t.id() === taskId);
    if (task) task.name = newName;
    return JSON.stringify({ success: true });
  })()
`;
```

### JXA + Bridge

```typescript
export const COMPLEX_SCRIPT = `
  ${getUnifiedHelpers()}
  ${getBridgeOperations()}
  (() => {
    const app = Application('OmniFocus');
    const task = createTask(app.defaultDocument(), params);
    if (params.tags) {
      assignTagsViaBridge(app, task.id(), params.tags);
    }
    return JSON.stringify({ success: true, taskId: task.id() });
  })()
`;
```

---

## Helpers

```
src/omnifocus/scripts/shared/
├── helpers.ts            # getUnifiedHelpers() - use this (~16KB, 3% of limit)
├── bridge-helpers.ts     # getBridgeOperations()
├── minimal-tag-bridge.ts # Tag operations
└── repeat-helpers.ts     # Repetition rules
```

**Always use `getUnifiedHelpers()`.** Deprecated: getAllHelpers, getCoreHelpers, getMinimalHelpers.

---

## Script Size

| Context | Limit | Current Max |
|---------|-------|-------------|
| JXA Direct | 523KB | ~31KB (6%) |
| OmniJS Bridge | 261KB | Well under |

Size is rarely the limiting factor.

---

## Performance

| Rule | Why |
|------|-----|
| Never use `whose()`/`where()` | 25+ seconds |
| Direct iteration + try/catch | 50% faster than wrappers |
| Early exit conditions | Check completed/date first |
| Cache timestamps | Don't create Date objects in loops |

**Bridge for performance:** Bulk operations (>100 items), perspective queries.

---

## Error Handling

```javascript
// JXA
function safeGet(fn) {
  try { return fn(); }
  catch (e) { return null; }
}
const name = safeGet(() => task.name()) || 'Unnamed';

// Bridge
function executeBridgeOp(app, template, params) {
  try {
    const result = app.evaluateJavascript(formatBridgeScript(template, params));
    return JSON.parse(result);
  } catch (e) { return { success: false, error: String(e) }; }
}
```

---

## Security

**Never concatenate user input into scripts.** Use templates:

```javascript
const SAFE_TEMPLATE = [
  '(() => {',
  '  const task = Task.byIdentifier($TASK_ID$);',
  '  const tags = $TAGS$;',
  '  task.clearTags();',
  '  tags.forEach(n => task.addTag(Tag.byName(n) || new Tag(n)));',
  '  return JSON.stringify({ success: true });',
  '})()'
].join('\\n');
```

---

## Anti-Patterns

| Don't | Do |
|-------|-----|
| String concatenation: `` `task.name = "${userInput}"` `` | Template with `formatBridgeScript(template, params)` |
| `doc.flattenedTasks.whose({ completed: false })()` | Direct iteration with early exit |
| Pure OmniJS without JXA wrapper | `app.evaluateJavascript(omniJsScript)` |

---

## Testing

```bash
node test-single-tool.js tasks '{"mode":"today","limit":"3"}'
```

| Environment | Behavior |
|-------------|----------|
| CLI | Read operations work; write may fail |
| Claude Desktop | All operations work |

---

## Benchmarks

| Operation | Time |
|-----------|------|
| Task queries (2000+ tasks) | <1s |
| Task creation | <0.5s |
| Tag operations via bridge | <1s |
| Bulk exports | 2-5s |
| Using `whose()` | 25+s |

---

## Tool Architecture

4 unified tools (v3.0.0 Unified Builder API):

| Tool | Purpose |
|------|---------|
| `omnifocus_read` | Query tasks, projects, tags, folders, perspectives |
| `omnifocus_write` | Create, update, complete, delete tasks/projects |
| `omnifocus_analyze` | Productivity stats, velocity, overdue, patterns |
| `system` | Version, diagnostics, metrics |

Discriminated union schemas route to backend implementations.

---

## Related Docs

- **PATTERNS.md** - Symptom → solution lookup
- **PATTERN_INDEX.md** - Pattern search reference
- **LESSONS_LEARNED.md** - War stories
