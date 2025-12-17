# OmniFocus Query Alternatives to flattenedTasks()

## Performance Optimization Guide

**Problem:** `doc.flattenedTasks()` returns ALL tasks (1,599 in your case) and requires linear scanning to filter. This
is slow, especially on thermally-constrained hardware like M2 Air.

---

## Available Query Paths in OmniFocus API

### 1. **Inbox Collection** (Fastest for inbox queries)

```javascript
// OmniJS (in evaluateJavascript)
inbox.forEach((task) => {
  // Only inbox tasks, no scanning needed
});
```

**Use cases:**

- "What's in my inbox?"
- "Show me unprocessed tasks"

**Performance:** ~100-200 tasks typical, no need to scan 1,599

**Already implemented:** ✅ Yes (see `query-perspective.ts:14-48`)

---

### 2. **Tag-Based Queries** (Filter by specific tags)

```javascript
// Get specific tag
const tag = flattenedTags.byName("Work");

// Available tasks with this tag (ready to work on)
tag.availableTasks.forEach(task => { ... });

// All remaining (incomplete) tasks with this tag
tag.remainingTasks.forEach(task => { ... });
```

**Use cases:**

- "Show me @Work tasks"
- "What tasks are tagged with @Waiting?"

**Performance:** Only scans tasks with that specific tag

**Currently:** ❌ Not implemented - we scan all tasks then filter by tag

**Potential improvement:** If user asks for tasks with specific tags, query via `tag.remainingTasks` instead of scanning
flattenedTasks

---

### 3. **Project-Based Queries** (Filter by specific project)

```javascript
const project = doc.flattenedProjects.byName("Project Name");

// All tasks in this project (including subtasks)
project.flattenedTasks.forEach(task => { ... });

// Just direct children
project.tasks.forEach(task => { ... });
```

**Use cases:**

- "Show me tasks in Project X"
- "What's left in this project?"

**Performance:** Only scans tasks within that project

**Currently:** ✅ Partially - we support `project` filter, but still scan all tasks first

**Potential improvement:** When `project` filter specified, query project directly instead of flattenedTasks

---

### 4. **Perspective-Based Queries** (Use built-in filtering)

```javascript
// Built-in perspectives have native collections
const perspectives = {
  Inbox: 'inbox',
  // Others use custom filtering
};
```

**Use cases:**

- "Show me my Forecast"
- "What's in my Today perspective?"

**Performance:** Depends on perspective implementation

**Currently:** ✅ Implemented for Inbox, Projects, Tags perspectives

**Custom perspectives:** ⚠️ Currently scan flattenedTasks with filtering

---

### 5. **Folder-Based Queries** (Filter by folder hierarchy)

```javascript
const folder = doc.flattenedFolders.byName('Folder Name');

// Projects in this folder
folder.flattenedProjects.forEach((project) => {
  // Then get tasks from each project
});
```

**Use cases:**

- "Show me everything in the Work folder"

**Performance:** Reduces project scope before getting tasks

**Currently:** ❌ Not implemented

---

## What We CANNOT Do (API Limitations)

### ❌ No direct date-range queries

```javascript
// This doesn't exist:
doc.tasksWithDueDateBetween(startDate, endDate);
```

**Workaround:** Still need to scan flattenedTasks and filter by date

### ❌ No "available tasks" global collection

```javascript
// This doesn't exist:
doc.availableTasks;
```

**Workaround:** Scan flattenedTasks and check `task.taskStatus === Task.Status.Available`

### ❌ No "flagged tasks" direct query

```javascript
// This doesn't exist:
doc.flaggedTasks;
```

**Workaround:** Scan flattenedTasks and check `task.flagged === true`

### ❌ No combined filters at API level

```javascript
// This doesn't exist:
doc.tasksWhere({ flagged: true, dueDate: '<today' });
```

**Workaround:** Must scan and filter manually

---

## Optimization Strategies for Your Use Case

### Problem: "Today's tasks" query (overdue OR due_today OR flagged)

**Current implementation (slow):**

```javascript
const allTasks = doc.flattenedTasks(); // Get ALL 1,599 tasks
for (let i = 0; i < allTasks.length; i++) {
  // Scan until finding 25 matches
}
```

**Why it's slow:** Scans linearly through all tasks

### Optimization Option 1: **Tag-based segmentation**

If user consistently tags time-sensitive work:

```javascript
// Get tag for urgent/today work
const todayTag = flattenedTags.byName('Today');
const availableTasks = todayTag.availableTasks;

// Much smaller set to scan
```

**Pros:** Dramatically reduces scan size **Cons:** Requires user to tag appropriately **Applicability:** Limited - not
how most people use OmniFocus

### Optimization Option 2: **Multi-pass filtered scanning**

Instead of one linear scan, do multiple targeted scans:

```javascript
// Pass 1: Get flagged tasks (usually small set)
const flaggedTasks = [];
flattenedTasks.forEach((task) => {
  if (task.flagged && !task.completed) {
    flaggedTasks.push(task);
  }
});

// Pass 2: Scan for due dates only
const dueSoonTasks = [];
flattenedTasks.forEach((task) => {
  if (!task.completed && task.dueDate) {
    const dueTime = task.dueDate.getTime();
    if (dueTime < tomorrow.getTime()) {
      dueSoonTasks.push(task);
    }
  }
});

// Merge and deduplicate
```

**Pros:** Can early-exit on flagged pass if enough results **Cons:** Still scans all tasks, just in multiple passes
**Applicability:** ❌ Actually SLOWER - scanning twice!

### Optimization Option 3: **OmniJS bridge for better performance**

Use evaluateJavascript with OmniJS for faster property access:

```javascript
const script = `
  const results = [];
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  flattenedTasks.forEach(task => {
    if (task.completed) return; // Early exit

    const shouldInclude = task.flagged ||
      (task.dueDate && task.dueDate < tomorrow);

    if (shouldInclude) {
      results.push({
        id: task.id.primaryKey,
        name: task.name,
        // ... other fields
      });

      if (results.length >= 25) {
        return; // Can't actually early-exit forEach :(
      }
    }
  });

  return JSON.stringify(results.slice(0, 25));
`;

const results = app.evaluateJavascript(script);
```

**Pros:** Faster property access in OmniJS (you're already using this!) **Cons:** Still scans all tasks, can't truly
early-exit from forEach **Applicability:** ✅ Already implemented - this is what you're using!

---

## The Brutal Truth

### For "Today's tasks" type queries, there's NO way to avoid scanning all tasks

**Why OmniFocus doesn't provide filtered collections:**

1. **Dynamic nature** - "Due today" changes every day at midnight
2. **Complex rules** - Deferred dates, project availability, tags, etc.
3. **Database architecture** - Likely not indexed by arbitrary date ranges

**The only real optimization is:**

- ✅ Use OmniJS bridge (faster than JXA) - **Already doing this**
- ✅ Early exit when limit reached - **Can't with forEach**
- ✅ Skip completed tasks immediately - **Already doing this**
- ✅ Minimize property access per task - **Already optimized**

---

## What CAN Be Optimized (For Your Codebase)

### 1. **Project-filtered queries**

**Current code (hypothetical):**

```javascript
// If user asks for tasks in specific project
const allTasks = doc.flattenedTasks();
const filtered = allTasks.filter((task) => task.containingProject?.id === projectId);
```

**Optimized:**

```javascript
// Query project directly
const project = doc.flattenedProjects.byIdentifier(projectId);
const tasks = project ? project.flattenedTasks : [];
```

**Impact:** Scans 10-100 tasks instead of 1,599

### 2. **Tag-filtered queries**

**Current code:**

```javascript
// If user asks for tasks with specific tag
const allTasks = doc.flattenedTasks();
const filtered = allTasks.filter((task) => task.tags.some((t) => t.name === 'Work'));
```

**Optimized:**

```javascript
// Query tag directly
const tag = doc.flattenedTags.byName('Work');
const tasks = tag ? tag.remainingTasks : [];
```

**Impact:** Scans 50-200 tasks instead of 1,599

### 3. **Inbox queries**

**Current code:**

```javascript
// If mode === 'inbox'
const allTasks = doc.flattenedTasks();
const inboxTasks = allTasks.filter((task) => task.inInbox);
```

**Optimized:**

```javascript
// Use inbox collection directly
const inboxTasks = inbox; // OmniJS global
```

**Impact:** Scans 10-100 tasks instead of 1,599 **Status:** ✅ Already implemented in perspectives

---

## Recommendations for Your MCP Server

### ✅ Already Optimized

- Inbox queries via `inbox` collection
- OmniJS bridge for fast property access
- Early exits on completed tasks

### 🔄 Can Be Optimized

1. **When `project` parameter provided:** Query `project.flattenedTasks` directly
2. **When `tags` parameter provided:** Query `tag.remainingTasks` directly
3. **When `mode=available`:** Could use `tag.availableTasks` if tags specified

### ❌ Cannot Be Optimized (API Limitation)

- Date-based queries (overdue, due_today, upcoming)
- Flagged-only queries
- Complex combined queries ("today's tasks")

**For these, linear scan is unavoidable**

---

## M2 Air Thermal Throttling Solutions

Since we **cannot avoid scanning all tasks** for date/flag queries, we need other solutions:

### 1. **Chunked processing with cooling breaks** (Transparent to client)

```typescript
async function scanTasksWithCooling(tasks: Task[], limit: number) {
  const results = [];
  const chunkSize = 200;

  for (let i = 0; i < tasks.length && results.length < limit; i += chunkSize) {
    const chunk = tasks.slice(i, Math.min(i + chunkSize, tasks.length));

    // Process chunk
    for (const task of chunk) {
      if (meetsFilter(task)) {
        results.push(task);
        if (results.length >= limit) break;
      }
    }

    // Brief cooling pause between chunks (not between tasks)
    if (i + chunkSize < tasks.length && results.length < limit) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return results;
}
```

**Impact:** Prevents sustained CPU load, allows cooling **Downside:** Adds ~50ms delay per 200 tasks (small price for M2
Air usability)

### 2. **Cache results and reuse**

- Cache "Today's tasks" query result
- Invalidate cache at midnight or on task changes
- M2 Air reads from cache (no heavy computation)

**Impact:** First query slow, subsequent queries instant

### 3. **Accept limitations**

- M2 Air is fundamentally unsuited for sustained task scanning
- Use for quick lookups only
- Heavy queries run on desktop machines

---

## Summary

**What you CAN use instead of `flattenedTasks()` linear scans:**

- ✅ `inbox` - For inbox-only queries
- ✅ `tag.remainingTasks` - For tag-specific queries
- ✅ `tag.availableTasks` - For available tasks with tag
- ✅ `project.flattenedTasks` - For project-specific queries

**What you CANNOT avoid scanning for:**

- ❌ Date-range queries (overdue, due today, upcoming)
- ❌ Flagged-only queries
- ❌ Combined queries ("today's tasks" = overdue OR due_today OR flagged)

**For your specific "Today's tasks" query:**

- Already optimized with OmniJS bridge
- Linear scan is unavoidable (OmniFocus API limitation)
- M2 Air thermal throttling needs chunked processing or caching
