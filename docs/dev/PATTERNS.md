# Symptom → Solution Lookup

Check here BEFORE debugging.

---

## Discriminated Unions Failing in Claude Desktop

| Symptom                                    | Cause                                      |
| ------------------------------------------ | ------------------------------------------ |
| Claude sends JSON string instead of object | Missing ZodDiscriminatedUnion handler      |
| `Expected object, received string`         | BaseTool.zodTypeToJsonSchema missing case  |
| Works in CLI, fails in Claude Desktop      | Schema falls through to `{type: "string"}` |

**Fix:** Add handler to `src/tools/base.ts:187`:

```typescript
if (schema instanceof z.ZodDiscriminatedUnion) {
  return {
    oneOf: schema._def.options.map((opt) => this.zodTypeToJsonSchema(opt)),
    discriminator: { propertyName: schema._def.discriminator },
  };
}
```

**Verify:**
`echo '...' | node dist/index.js | jq '.result.tools[] | select(.name == "omnifocus_write") | .inputSchema.properties.mutation'`
should show `{oneOf: [...]}`, not `{type: "string"}`.

---

## Tags Not Working

| Symptom                               | Solution                  |
| ------------------------------------- | ------------------------- |
| Tags in response but not in query     | Use `bridgeSetTags()`     |
| Empty array when should have values   | JXA methods fail silently |
| Tags saved but invisible in OmniFocus | Bridge required           |

```javascript
// ❌ JXA methods fail silently
task.addTags(tags);

// ✅ Bridge works
bridgeSetTags(app, taskId, taskData.tags); // minimal-tag-bridge.ts:41
```

---

## Task Creation Failing

| Error              | Check                             |
| ------------------ | --------------------------------- |
| Project not found  | Verify project exists first       |
| Invalid parameter  | See ARCHITECTURE.md decision tree |
| Task not appearing | Use bridge for tags/repetition    |

```
Task Creation:
├── Without tags → Pure JXA
├── With tags → JXA + Bridge (required)
├── With repetition → JXA + Bridge (required)
└── In project → Validate project, then JXA
```

---

## Performance / Timeouts

| Symptom                  | Fix                                       |
| ------------------------ | ----------------------------------------- |
| Script takes 25+ seconds | Remove `.where()`/`.whose()`              |
| Timeout with 2000+ tasks | Use direct iteration                      |
| Queries hang             | Add early exits, set `skipAnalysis: true` |

```javascript
// ❌ Takes 25+ seconds
doc.flattenedTasks.whose({ completed: false })();

// ✅ Fast
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  try {
    if (!allTasks[i].completed()) tasks.push(allTasks[i]);
  } catch (e) {
    /* skip */
  }
}
```

---

## Date Handling

| Problem            | Solution                                   |
| ------------------ | ------------------------------------------ |
| Dates off by hours | Use local time, not ISO with Z             |
| Timezone confusion | Format: `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` |
| Wrong time saved   | Smart defaults: 5pm due, 8am defer         |

```javascript
// ❌ Wrong time
dueDate: '2025-03-15T17:00:00Z';

// ✅ Correct
dueDate: '2025-03-15 17:00';
dueDate: '2025-03-15'; // Defaults to 5pm
```

---

## MCP Testing Hangs

| Symptom                | Reality                                      |
| ---------------------- | -------------------------------------------- |
| CLI tests hang forever | MCP servers exit when stdin closes (correct) |
| No JSON response       | Missing clientInfo parameter                 |
| Server doesn't exit    | Use proper test pattern                      |

```bash
# ✅ Includes required clientInfo
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
```

---

## Script Size Limits

| Symptom              | Reality                      |
| -------------------- | ---------------------------- |
| "Script too large"   | Unlikely (limits are 500KB+) |
| Truncation issues    | Check syntax, not size       |
| Syntax errors at end | Probably a real syntax error |

| Context | Limit | Our Max |
| ------- | ----- | ------- |
| JXA     | 523KB | ~31KB   |
| OmniJS  | 261KB | ~16KB   |

---

## Can't Find Helper

| Function                         | File                  |
| -------------------------------- | --------------------- |
| `safeGet()`, `validateProject()` | helpers.ts            |
| `bridgeSetTags()`                | minimal-tag-bridge.ts |
| `getBridgeOperations()`          | bridge-helpers.ts     |

**Always:** Use `getUnifiedHelpers()` (~16KB, includes everything).

---

## Integration Tests Failing

| Symptom                  | Check                     |
| ------------------------ | ------------------------- |
| Tests timeout            | 60s requests, 90s tests   |
| Server won't exit        | Track pending operations  |
| Pending operations stuck | Graceful shutdown pattern |

---

## Tool Returns Zeros But Logs Show Data

**Symptoms:** Tool returns `totalTasks: 0` but logs show `completedInPeriod: 95`.

**Rule:** Test MCP integration FIRST!

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"TOOL","arguments":{}}}' | node dist/index.js 2>&1 | tee debug.log

grep "stdout data received" debug.log  # What script returns
grep -A 20 '"result":' debug.log       # What tool returns
```

**If script correct but tool wrong → response wrapping issue.**

| Cause                   | Fix                                             |
| ----------------------- | ----------------------------------------------- |
| Double-wrapping         | Unwrap both layers before accessing data        |
| Under-unwrapping        | Check nesting level matches script output       |
| Error detection failure | Verify `isScriptError()` catches wrapped errors |

```typescript
// Unwrap ALL layers
let data = result?.data; // First layer
if (data && 'ok' in data && 'data' in data) {
  data = data.data; // Second layer
}
// NOW access actual fields
```

**Lesson:** ALWAYS test MCP integration BEFORE opening script files.

---

## Response Structure Mismatches

**Symptom:** Test expects `response.data.id` but gets `undefined`.

### Standard Response (Internal Tool Output)

```typescript
{ success: boolean; data?: {...}; error?: {...}; metadata?: {...}; }
```

### Internal Tool Response Structures

These are the response shapes from internal tools that the unified API wraps:

| Internal Tool/Operation | Structure                          |
| ----------------------- | ---------------------------------- |
| ManageTaskTool create   | `data.task.{taskId, name, ...}`    |
| tasks query             | `data.tasks[].{taskId, name, ...}` |
| tags manage             | `data.{tagName, action, ...}`      |
| tags list               | `data.items[].{name, id, ...}`     |

**Diagnostic:**

```bash
echo '...tools/call...' | node dist/index.js 2>&1 | grep '"result":' | jq '.result.content[0].text | fromjson'
```

**Prevention:**

```typescript
// ❌ Assumes structure
expect(response.data.id).toBeDefined();

// ✅ Tests structure first
expect(response.success).toBe(true);
expect(response.data?.task?.taskId).toBeDefined();
```

---

## Complex Filter Operators

| API Input                    | Internal Output                       |
| ---------------------------- | ------------------------------------- |
| `status: 'active'`           | `completed: false`                    |
| `status: 'completed'`        | `completed: true`                     |
| `tags: { any: [...] }`       | `tags: [...], tagsOperator: 'OR'`     |
| `tags: { all: [...] }`       | `tags: [...], tagsOperator: 'AND'`    |
| `tags: { none: [...] }`      | `tags: [...], tagsOperator: 'NOT_IN'` |
| `dueDate: { before: '...' }` | `dueBefore: '...'`                    |
| `project: null`              | `inInbox: true`                       |

**Supported:** `AND: [...]`, simple `NOT: {...}`. **Logged but flattened:** `OR: [...]` (uses first condition only).

---

## General Debugging Workflow

1. **STOP** - Don't code yet
2. **SEARCH** - `grep -r "keyword" docs/`
3. **CHECK** - This file
4. **VERIFY** - Existing helpers in `src/omnifocus/scripts/shared/`
5. **READ** - ARCHITECTURE.md decision tree
6. **THEN** - Begin implementation

**30 minutes searching > 2 hours reinventing.**

---

## Documentation Map

| Doc                   | Content                     |
| --------------------- | --------------------------- |
| PATTERNS.md           | This file - symptom lookup  |
| ARCHITECTURE.md       | JXA vs Bridge decisions     |
| LESSONS_LEARNED.md    | War stories, empirical data |
| DEBUGGING_WORKFLOW.md | Systematic approach         |
| PATTERN_INDEX.md      | Pattern search reference    |
