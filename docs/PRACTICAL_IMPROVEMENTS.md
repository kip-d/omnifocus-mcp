# Practical Code Improvements

Based on the codebase analysis, here are **actual** improvements we can make:

## 1. Script File Organization 🔥 

**Problem**: The script files are massive template literals (1,740 lines!)
**Solution**: Break them down into manageable pieces

### Option A: Script Builder Pattern
```typescript
// src/omnifocus/scripts/builders/task-builder.ts
export class TaskScriptBuilder {
  private parts: string[] = [];
  
  addHelpers() {
    this.parts.push(COMMON_HELPERS);
    return this;
  }
  
  addTaskQuery(filters: TaskFilter) {
    this.parts.push(buildTaskQuery(filters));
    return this;
  }
  
  build(): string {
    return this.parts.join('\n');
  }
}
```

### Option B: Separate .js Files
```
src/omnifocus/scripts/
  tasks/
    list-tasks.js      # Actual JavaScript for better highlighting
    create-task.js
    helpers.js
  index.ts            # TypeScript loader
```

## 2. Reduce Code Duplication ✅

**Problem**: Same patterns repeated in 24 tool files
**Solution**: Extract to shared utilities

### Cache Key Generation
```typescript
// Current (duplicated everywhere):
const cacheKey = JSON.stringify(args);

// Better:
import { buildCacheKey } from '../utils/cache.js';
const cacheKey = buildCacheKey('tasks', args);
```

### Response Formatting
Many tools have identical response formatting. Could extract to base class methods.

## 3. Improve Error Messages 💡

**Problem**: Generic error messages don't help users
**Solution**: Add context-specific guidance

```typescript
// Current:
throw new McpError(ErrorCode.NotFound, 'Task not found');

// Better:
throw new McpError(
  ErrorCode.NotFound, 
  `Task not found: ${taskId}. Use list_tasks to see available tasks.`
);
```

## 4. Performance Quick Wins 🚀

### Add Indexes to Large Arrays
When searching through tasks/projects repeatedly, build lookup maps:

```javascript
// Instead of:
for (let task of tasks) {
  if (task.id() === targetId) { /* ... */ }
}

// Use:
const taskMap = new Map(tasks.map(t => [t.id(), t]));
const task = taskMap.get(targetId);
```

## 5. Better Configuration 🔧

### Move Magic Numbers to Constants
```typescript
// Current:
ttl: 60 * 1000  // What is this?

// Better:
const CACHE_TTL = {
  TASKS: 60 * 1000,    // 1 minute
  PROJECTS: 600 * 1000, // 10 minutes
  // etc.
};
```

## 6. Testing Improvements 🧪

### Add Integration Test Suite
Currently missing proper integration tests for:
- Cache invalidation
- Error scenarios
- Large dataset handling

## 7. Documentation in Code 📝

### Add JSDoc to Public APIs
```typescript
/**
 * List tasks with advanced filtering
 * @param args - Filter criteria
 * @param args.completed - Filter by completion status
 * @param args.projectId - Filter by project
 * @returns Promise<TaskListResponse>
 * @throws {McpError} When filters are invalid
 */
async executeValidated(args: ListTasksArgs) {
  // ...
}
```

## What NOT to Change

1. **`any` types that are necessary** - Generic tool returns, JXA results
2. **Current architecture** - It works well
3. **Cache implementation** - Already optimized
4. **Error handling pattern** - Consistent and functional

## Quick Wins We Could Do Now

1. **Extract script helpers** to reduce file size
2. **Add better error messages** with helpful context
3. **Create constants file** for magic numbers
4. **Add JSDoc** to tool methods

## Biggest Impact Changes

1. **Script file refactoring** - Would make code much more maintainable
2. **Base class improvements** - Reduce duplication significantly
3. **Performance optimizations** - For large databases