# Tag Visibility Fix Plan

## The Problem
Tags are being set correctly via the bridge but we can't see them because:
1. Write operations use `evaluateJavascript` (OmniJS context)
2. Read operations use JXA (different context)
3. The two contexts don't share the same view of the data

## The Solution
Every script that writes tags MUST also read them back via bridge in the same operation.

## Scripts That Need Fixing

### Priority 1 - User-facing operations
- [ ] `create-task.ts` - Already uses bridge for write, needs bridge for final read
- [ ] `update-task-minimal.ts` - Partially fixed, needs verification
- [ ] `update-task.ts` - Full version needs bridge for read

### Priority 2 - List operations that show tags
- [ ] `list-tasks.ts` - Uses safeGetTags, needs bridge
- [ ] `todays-agenda-ultra-fast.ts` - Direct task.tags() call
- [ ] `flagged-tasks-perspective.ts` - Needs bridge for tag reading

### Priority 3 - Analytics and exports
- [ ] `export-tasks.ts` - Uses safeGetTags
- [ ] All analytics scripts - Use safeGetTags

## Implementation Strategy

### Step 1: Create a definitive bridge-based task serializer
```javascript
function serializeTaskWithBridge(taskId, includeDetails, app) {
  const script = `(() => {
    const task = Task.byIdentifier("${taskId}");
    if (!task) return JSON.stringify({error: "not found"});
    
    const data = {
      id: task.id.primaryKey,
      name: task.name,
      flagged: task.flagged,
      completed: task.completed,
      tags: task.tags.map(t => t.name)
    };
    
    if (${includeDetails}) {
      data.note = task.note || "";
      data.dueDate = task.dueDate ? task.dueDate.toISOString() : null;
      data.deferDate = task.deferDate ? task.deferDate.toISOString() : null;
      data.project = task.containingProject ? task.containingProject.name : null;
      data.projectId = task.containingProject ? task.containingProject.id.primaryKey : null;
    }
    
    return JSON.stringify(data);
  })()`;
  
  return JSON.parse(app.evaluateJavascript(script));
}
```

### Step 2: Replace ALL task serialization
- Every place we return task data must use this serializer
- No more mixing JXA reads with bridge writes

### Step 3: Test pattern
```
1. Create task with tags ["work", "urgent"]
2. Response should show tags: ["work", "urgent"] ✓
3. Update task with tags ["home", "later"]  
4. Response should show tags: ["home", "later"] ✓
5. Query task again
6. Should still show tags: ["home", "later"] ✓
```

## Success Criteria
- [ ] Create task shows tags immediately in response
- [ ] Update task shows new tags immediately in response
- [ ] Query operations show correct tags
- [ ] No "invisible" successful operations
- [ ] No "trust me it worked" situations

## Time Estimate
- 2-3 hours to fix all scripts
- 1 hour to test thoroughly
- This MUST be done before v2.0.0

## The Right Quality Bar
"It should feel magic, not broken"
- Operations either succeed fully (and show it) or fail clearly
- No halfway states
- No "it worked but you can't see it"
- No "try something else" when our code is the problem