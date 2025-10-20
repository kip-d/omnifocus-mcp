# JXA vs OmniJS Bridge - Property Access Patterns

**Last Updated:** 2025-10-20
**Critical Reference:** Use this guide when working with OmniFocus automation

---

## Table of Contents

1. [Execution Contexts](#execution-contexts)
2. [Property Access Rules](#property-access-rules)
3. [Common Patterns](#common-patterns)
4. [When to Use Bridge](#when-to-use-bridge)
5. [Troubleshooting](#troubleshooting)
6. [Examples](#examples)

---

## Execution Contexts

### JXA Context (Direct Automation)

**Used in:** Scripts executed directly via `osascript -l JavaScript`

**File pattern:** `src/omnifocus/scripts/**/*.ts` files that get wrapped in JXA

**Execution:**
```typescript
const script = `
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    // ... your code here
  })()
`;
await execScript(script);
```

### OmniJS Context (Bridge)

**Used in:** Code executed inside `app.evaluateJavascript()`

**File pattern:** Bridge operations, typically in helper files

**Execution:**
```typescript
const omniJsCode = `
  (() => {
    const task = Task.byIdentifier("${taskId}");
    task.tags = [...];  // OmniJS API
  })()
`;
const result = app.evaluateJavascript(omniJsCode);
```

---

## Property Access Rules

### ✅ JXA: Use Method Calls

In JXA context, almost **all properties must be accessed as method calls** with parentheses.

| Property Type | JXA Pattern | Example |
|---------------|-------------|---------|
| **ID** | `obj.id()` | `task.id()` → `"abc123"` |
| **String** | `obj.name()` | `task.name()` → `"Task name"` |
| **Boolean** | `obj.completed()` | `task.completed()` → `true` |
| **Date** | `obj.dueDate()` | `task.dueDate()` → `Date object` |
| **Object** | `obj.containingProject()` | `task.containingProject()` → `Project object` |
| **Array** | `obj.tags()` | `task.tags()` → `[Tag, Tag]` |
| **Complex** | `obj.repetitionRule()` | `task.repetitionRule()` → `{recurrence: "...", ...}` |

### ❌ JXA: Property Access Fails

These patterns **will throw errors** in JXA:

```javascript
// ❌ WRONG - These all fail in JXA:
task.id.primaryKey      // ERROR: "Can't convert types"
task.name               // ERROR: Not a method
task.completed          // ERROR: Not a method
task.dueDate            // ERROR: Not a method
```

### ✅ OmniJS: Use Property Access

In OmniJS context (inside `evaluateJavascript()`), use **property access** not method calls.

```javascript
// ✅ CORRECT in OmniJS:
task.id.primaryKey      // Returns string
task.tags = [...]       // Sets tags (works!)
task.plannedDate = new Date()  // Sets date (works!)
```

---

## Common Patterns

### 1. Reading Task Properties (JXA)

```typescript
function buildTaskObject(omniJsTask) {
  const task = {};

  // ✅ IDs - use method calls
  task.id = omniJsTask.id();

  // ✅ Strings - use method calls
  task.name = omniJsTask.name();
  task.note = omniJsTask.note() || '';

  // ✅ Booleans - use method calls
  task.completed = omniJsTask.completed() || false;
  task.flagged = omniJsTask.flagged() || false;

  // ✅ Dates - use method calls, then convert
  const dueDate = omniJsTask.dueDate();
  task.dueDate = dueDate ? dueDate.toISOString() : null;

  const plannedDate = omniJsTask.plannedDate();
  task.plannedDate = plannedDate ? plannedDate.toISOString() : null;

  // ✅ Objects - use method calls
  const project = omniJsTask.containingProject();
  task.project = project ? project.name() : null;
  task.projectId = project ? project.id() : null;

  // ✅ Arrays - use method call to get array, then iterate
  const tags = omniJsTask.tags();
  task.tags = tags ? tags.map(t => t.name()) : [];

  // ✅ Complex objects - use method call, get plain object
  const rule = omniJsTask.repetitionRule();
  task.repetitionRule = rule || null;  // Already a plain object

  return task;
}
```

### 2. Setting Task Properties (Requires Bridge)

**JXA property assignment FAILS for complex properties:**

```javascript
// ❌ WRONG - These silently fail in JXA:
task.tags = [tag1, tag2];            // Doesn't persist
task.plannedDate = new Date();        // Doesn't persist
```

**✅ CORRECT - Use OmniJS bridge:**

```javascript
// Create task in JXA
const task = app.Task({name: "Test"});
inbox.push(task);
const taskId = task.id();  // Get ID with method call

// Use bridge to set complex properties
const bridgeScript = `
  (() => {
    const task = Task.byIdentifier("${taskId}");
    task.plannedDate = new Date("${dateValue}");
    return JSON.stringify({success: true});
  })()
`;
const result = app.evaluateJavascript(bridgeScript);
```

### 3. Checking for Null/Undefined

```javascript
// ✅ Always call the method first, then check result
const dueDate = task.dueDate();
if (dueDate) {
  taskData.dueDate = dueDate.toISOString();
}

// ✅ For arrays, check if array exists
const tags = task.tags();
if (tags && Array.isArray(tags)) {
  taskData.tags = tags.map(t => t.name());
}

// ❌ WRONG - Checking method itself
if (task.dueDate) {  // This checks if METHOD exists, not if date exists
  // ...
}
```

---

## When to Use Bridge

### ✅ Bridge Required For:

1. **Setting complex properties**
   - Tags assignment: `task.tags = [...]`
   - PlannedDate: `task.plannedDate = new Date()`
   - Repetition rules: `task.repetitionRule = {...}`
   - Task movement: Moving tasks between projects

2. **Bulk operations on many items**
   - Processing 100+ tasks in single call
   - Complex filtering/mapping operations
   - Calculating aggregate statistics

### ❌ Bridge NOT Required For:

1. **Reading properties** - Use JXA method calls directly
2. **Simple property setting** - Name, note, etc. work in JXA
3. **Task creation** - JXA `app.Task({...})` works fine
4. **Simple operations** - Single task operations in JXA are fine

---

## Troubleshooting

### Error: "Can't convert types"

**Symptom:**
```javascript
const id = task.id.primaryKey;
// ERROR: Can't convert types
```

**Fix:**
```javascript
const id = task.id();  // ✅ Use method call
```

### Error: "X is not a function"

**Symptom:**
```javascript
const name = task.name;
// ERROR: task.name is not a function
```

**Fix:**
```javascript
const name = task.name();  // ✅ Add parentheses
```

### Property Sets But Doesn't Persist

**Symptom:**
```javascript
task.tags = [tag1, tag2];
// No error, but tags don't appear in OmniFocus
```

**Fix:**
```javascript
// Use bridge for complex properties
const script = `
  const task = Task.byIdentifier("${taskId}");
  task.tags = Task.byName("tag1").tags;
`;
app.evaluateJavascript(script);
```

### repetitionRule Returns [object Object]

**Symptom:**
```javascript
const rule = task.repetitionRule();
console.log(rule);  // [object Object]
```

**Fix:**
```javascript
const rule = task.repetitionRule();
console.log(JSON.stringify(rule));  // Full object with properties
// Returns: {"recurrence": "FREQ=DAILY", "repetitionMethod": "...", ...}
```

---

## Examples

### Example 1: Reading All Task Properties (JXA)

```javascript
export const LIST_TASKS_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const allTasks = doc.flattenedTasks();
    const results = [];

    for (let i = 0; i < allTasks.length; i++) {
      const omniJsTask = allTasks[i];
      const task = {};

      // All properties use method calls
      task.id = omniJsTask.id();
      task.name = omniJsTask.name();
      task.completed = omniJsTask.completed();

      const dueDate = omniJsTask.dueDate();
      task.dueDate = dueDate ? dueDate.toISOString() : null;

      const plannedDate = omniJsTask.plannedDate();
      task.plannedDate = plannedDate ? plannedDate.toISOString() : null;

      const tags = omniJsTask.tags();
      task.tags = tags ? tags.map(t => t.name()) : [];

      const project = omniJsTask.containingProject();
      task.projectId = project ? project.id() : null;

      const rule = omniJsTask.repetitionRule();
      task.repetitionRule = rule || null;

      results.push(task);
    }

    return JSON.stringify({tasks: results});
  })()
`;
```

### Example 2: Creating Task with Bridge (Hybrid)

```javascript
export const CREATE_TASK_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskData = {{taskData}};

    // Step 1: Create task in JXA (simple properties)
    const task = app.Task({
      name: taskData.name,
      note: taskData.note || '',
      flagged: taskData.flagged || false
    });

    const inbox = doc.inboxTasks;
    inbox.push(task);

    // Get task ID using method call
    const taskId = task.id();

    // Step 2: Use bridge for complex properties
    if (taskData.plannedDate) {
      const bridgeScript = \`
        (() => {
          const task = Task.byIdentifier("\${taskId}");
          task.plannedDate = new Date("\${taskData.plannedDate}");
          return {success: true, plannedDate: task.plannedDate.toISOString()};
        })()
      \`;
      const result = app.evaluateJavascript(bridgeScript);
    }

    if (taskData.tags && taskData.tags.length > 0) {
      const bridgeScript = \`
        (() => {
          const task = Task.byIdentifier("\${taskId}");
          const tags = taskData.tags.map(name => Tag.byName(name));
          task.tags = tags;
          return {success: true};
        })()
      \`;
      app.evaluateJavascript(bridgeScript);
    }

    // Step 3: Return result using JXA method calls
    return JSON.stringify({
      taskId: taskId,
      name: task.name(),
      plannedDate: taskData.plannedDate
    });
  })()
`;
```

### Example 3: Bridge Helper Function

```javascript
/**
 * Set plannedDate using OmniJS bridge (required for persistence)
 */
function bridgeSetPlannedDate(app, taskId, dateValue) {
  try {
    const script = `
      (() => {
        const task = Task.byIdentifier("${taskId}");
        if (!task) return JSON.stringify({success: false, error: "task_not_found"});

        if (${dateValue === null}) {
          task.plannedDate = null;
        } else {
          task.plannedDate = new Date("${dateValue}");
        }

        return JSON.stringify({
          success: true,
          plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null
        });
      })()
    `;

    const result = app.evaluateJavascript(script);
    return JSON.parse(result);
  } catch (e) {
    return {success: false, error: e.message};
  }
}
```

---

## Quick Reference Card

| Task | JXA Pattern | OmniJS Pattern |
|------|-------------|----------------|
| **Get ID** | `task.id()` | `task.id.primaryKey` |
| **Get name** | `task.name()` | `task.name` |
| **Get date** | `task.dueDate()` | `task.dueDate` |
| **Get tags** | `task.tags()` | `task.tags` |
| **Get project** | `task.containingProject()` | `task.containingProject` |
| **Get project ID** | `project.id()` | `project.id.primaryKey` |
| **Set tags** | ❌ Use bridge | `task.tags = [...]` |
| **Set plannedDate** | ❌ Use bridge | `task.plannedDate = date` |
| **Create task** | ✅ `app.Task({...})` | ✅ `new Task(...)` |

---

## Key Takeaways

1. **JXA = Method Calls** - Almost everything needs `()`
2. **OmniJS = Property Access** - Standard JavaScript patterns
3. **Complex Sets = Bridge** - Tags, dates, rules need OmniJS
4. **Simple Gets = JXA** - Reading is fast and direct
5. **IDs are Special** - Different patterns in each context

**Golden Rule:** When in doubt in JXA, add `()` and call it as a method!

---

## Related Documentation

- `/docs/dev/ARCHITECTURE.md` - Unified execution patterns
- `/docs/dev/PATTERNS.md` - Common solutions
- `/docs/dev/LESSONS_LEARNED.md` - Historical context
- `src/omnifocus/scripts/shared/minimal-tag-bridge.ts` - Bridge examples
- `src/omnifocus/scripts/tasks/list-tasks.ts` - JXA property access examples

---

**Questions?** Search this document for your symptom or error message.
