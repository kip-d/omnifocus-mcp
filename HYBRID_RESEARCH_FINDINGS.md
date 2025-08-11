# Hybrid Implementation Research Findings

## Why Our Hybrid Approach Failed

### The Fatal Flaw
We used `flattenedTasks.where()` which **DOES NOT EXIST** in the OmniFocus JavaScript API!

```javascript
// THIS DOESN'T WORK - where() is not a method
const query = flattenedTasks.where(task => { ... });
```

### What Actually Exists
The OmniFocus JavaScript API provides:
- `filter()` - Standard JavaScript array method
- `apply()` - For hierarchical iteration with early stopping
- `tasksMatching(search)` - For text search (optimized)
- `projectsMatching(search)` - For project search
- Task status filtering via `task.taskStatus`

## The Real Performance Problem

### Why flattenedTasks is Slow
1. `flattenedTasks` returns **ALL** tasks in the database
2. Even with `filter()`, it must iterate through every single task
3. With 2,194 tasks, that's 2,194 iterations before any filtering

### Why JXA whose() is Actually Better (Sometimes)
```javascript
// JXA can pre-filter at the database level
doc.flattenedTasks.whose({completed: false})()
```
This filters at the AppleScript/database level BEFORE creating JavaScript objects.

## Better Implementation Strategies

### Strategy 1: Smart JXA + Minimal Omni Automation
Use JXA for initial filtering, Omni Automation ONLY for data that JXA can't access reliably:

```javascript
// JXA does the heavy filtering
const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
const matchingTasks = [];

// Filter in JXA (fast iteration)
for (const task of incompleteTasks) {
  if (task.dueDate() && task.dueDate() < targetDate) {
    matchingTasks.push(task.id());
  }
}

// Use Omni Automation ONLY to get properties JXA struggles with
const omniScript = `
  const ids = ${JSON.stringify(matchingTasks)};
  const results = [];
  for (const id of ids) {
    const task = Task.byIdentifier(id);
    if (task) {
      results.push({
        id: task.id.primaryKey,
        tags: task.tags.map(t => t.name),  // JXA can't get tags reliably
        // other hard-to-get properties
      });
    }
  }
  JSON.stringify(results);
`;
```

### Strategy 2: Use tasksMatching() for Search
For search operations, use the optimized `tasksMatching()`:

```javascript
const omniScript = `
  const matches = tasksMatching("${searchTerm}");
  const results = matches.map(task => ({
    id: task.id.primaryKey,
    name: task.name,
    // ... properties
  }));
  JSON.stringify(results);
`;
```

### Strategy 3: Status-Based Pre-Filtering
Use task status for initial filtering:

```javascript
const omniScript = `
  const availableTasks = flattenedTasks.filter(task => 
    task.taskStatus === Task.Status.Available ||
    task.taskStatus === Task.Status.Next
  );
  // Then apply additional filters
`;
```

### Strategy 4: Early Exit with apply()
For finding specific items, use `apply()` with early exit:

```javascript
const omniScript = `
  let found = [];
  inbox.apply(task => {
    if (task.dueDate && task.dueDate < targetDate) {
      found.push(task);
      if (found.length >= limit) {
        return ApplyResult.Stop;
      }
    }
  });
`;
```

## Performance Comparison

| Approach | 2,194 Tasks Time | Pros | Cons |
|----------|------------------|------|------|
| Pure JXA whose() | 3-5s | Predictable, proven | Limited filtering |
| Hybrid (broken where()) | 22s | None | Doesn't work |
| Hybrid (filter all) | 4-7s | Gets all properties | Iterates everything |
| Smart JXA + Targeted Omni | ~1-2s | Fast filtering + reliable data | Complex |
| tasksMatching() | <1s | Very fast for search | Only for text search |

## Recommendations

1. **Don't use evaluateJavascript() for bulk filtering** - It's slower than JXA whose()
2. **Use evaluateJavascript() selectively** - Only for properties JXA can't get (tags, certain dates)
3. **Use tasksMatching() for search** - It's optimized for text search
4. **Keep JXA whose() for basic filtering** - It's actually efficient for simple queries
5. **Consider caching aggressively** - The real performance win is not querying at all

## Conclusion

The hybrid approach CAN work, but only if:
1. We use real API methods (filter, not where)
2. We minimize what we do in Omni Automation
3. We use JXA for bulk filtering
4. We use specialized methods like tasksMatching() when available

The v1.13.0-1.13.1 implementation failed because:
1. Used non-existent where() method
2. Tried to do ALL filtering in Omni Automation
3. Iterated through entire database multiple times
4. Added overhead without benefit

The lesson: Sometimes "clever" optimizations make things worse. The original JXA implementation, while not blazing fast, at least works correctly.