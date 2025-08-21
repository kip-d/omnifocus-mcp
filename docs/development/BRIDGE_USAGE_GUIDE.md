# OmniJS Bridge Usage Guide

## Critical Rule: Use Bridge for BOTH Read AND Write

When using `evaluateJavascript()` to bypass JXA limitations, you MUST use it for both operations:
- **Writing** data (setting properties, creating objects)
- **Reading** data back (getting properties, especially collections)

## Why This Matters

JXA and OmniJS operate in separate contexts:
- **JXA Context**: Traditional AppleScript bridge (limited, buggy)
- **OmniJS Context**: Modern JavaScript API via evaluateJavascript (full access)

Data written in one context may not be fully visible in the other!

## Common Pitfalls

### ❌ WRONG: Mixed Context Usage
```javascript
// Write via bridge
app.evaluateJavascript('Task.byIdentifier("123").addTag(new Tag("work"))');

// Read via JXA - WON'T SEE THE TAG!
const tags = task.tags(); // Returns empty or stale data
```

### ✅ CORRECT: Consistent Bridge Usage
```javascript
// Write via bridge
app.evaluateJavascript('Task.byIdentifier("123").addTag(new Tag("work"))');

// Read via bridge too
const tagsJson = app.evaluateJavascript('JSON.stringify(Task.byIdentifier("123").tags.map(t => t.name))');
const tags = JSON.parse(tagsJson);
```

## Operations That MUST Use Bridge

### 1. Tags
- **Create/Add**: `task.addTag(tag)` via bridge
- **Read**: `task.tags.map(t => t.name)` via bridge
- **Clear**: `task.clearTags()` via bridge

### 2. Repeat Rules
- **Set**: `task.repetitionRule = new RecurrenceRule()` via bridge
- **Read**: `task.repetitionRule` properties via bridge
- **Clear**: `task.repetitionRule = null` via bridge

### 3. Task Relationships
- **Move to Project**: `moveTasks([task], project)` via bridge
- **Reparent**: `moveTasks([task], parentTask)` via bridge
- **Move to Inbox**: `moveTasks([task], inbox)` via bridge

### 4. Complex Properties
- **Perspectives**: Access via bridge for accurate filtering
- **Folder hierarchies**: Navigate via bridge
- **Custom perspectives**: Query via bridge

## Bridge Template Pattern

Use this pattern for all bridge operations:

```javascript
// For operations that return data
function bridgeOperation(taskId, operation) {
  const script = `(() => {
    const task = Task.byIdentifier("${taskId}");
    if (!task) return JSON.stringify({error: "Not found"});
    
    try {
      // Your operation here
      const result = ${operation};
      return JSON.stringify({success: true, data: result});
    } catch (e) {
      return JSON.stringify({error: e.message});
    }
  })()`;
  
  const resultJson = app.evaluateJavascript(script);
  return JSON.parse(resultJson);
}
```

## Audit Checklist

When reviewing scripts, check for:

1. **Tag Operations**
   - [ ] All tag writes use bridge
   - [ ] All tag reads use bridge
   - [ ] No mixing of JXA `task.tags()` with bridge operations

2. **Repeat Rules**
   - [ ] Setting rules uses bridge
   - [ ] Reading rules uses bridge
   - [ ] No JXA `task.repetitionRule()` mixed with bridge

3. **Task Movement**
   - [ ] Project assignments use bridge
   - [ ] Parent task changes use bridge
   - [ ] Inbox moves use bridge

4. **Data Serialization**
   - [ ] After bridge writes, use bridge to read for return values
   - [ ] Don't trust JXA getters after bridge setters

## Testing for Consistency

To test if bridge usage is consistent:

1. **Create with bridge, read with both**:
   ```javascript
   // Set via bridge
   evaluateJavascript('task.addTag(...)');
   
   // Read via bridge
   const bridgeTags = evaluateJavascript('task.tags');
   
   // Read via JXA
   const jxaTags = task.tags();
   
   // These should match! If not, you have a consistency issue
   ```

2. **Round-trip test**:
   - Create task with tags via bridge
   - Update task with new tags via bridge
   - Read tags via bridge
   - Verify all operations show correct tags

## Migration Strategy

To fix existing scripts:

1. **Find all evaluateJavascript calls**:
   ```bash
   grep -r "evaluateJavascript" src/
   ```

2. **For each write operation, find corresponding reads**:
   - Check return statements
   - Check data serialization
   - Check response building

3. **Replace JXA reads with bridge reads**:
   - Change `task.tags()` to bridge call
   - Change `task.repetitionRule()` to bridge call
   - Change collection access to bridge calls

## Performance Considerations

The bridge has overhead, so:
- **Batch operations** when possible
- **Cache results** from bridge calls
- **Use bridge only when necessary** (basic properties like name, id are fine via JXA)

## Properties Safe to Use via JXA

These simple properties work fine without the bridge:
- `task.id()`
- `task.name()`
- `task.note()`
- `task.flagged()`
- `task.completed()`
- `task.dueDate()` (for reading, not complex date operations)
- `task.deferDate()` (for reading)

## Properties That REQUIRE Bridge

These complex properties need bridge for reliability:
- `task.tags` (collection)
- `task.repetitionRule` (complex object)
- `task.project` (when moving/reassigning)
- `task.parent` (when reparenting)
- Anything involving `moveTasks()`
- Anything involving `new Tag()`, `new RecurrenceRule()`

## Quick Reference

| Operation | JXA (❌ Don't Use) | Bridge (✅ Use This) |
|-----------|-------------------|---------------------|
| Add tag | `task.tags.push(tag)` | `evaluateJavascript('task.addTag(tag)')` |
| Read tags | `task.tags()` | `evaluateJavascript('task.tags.map(t => t.name)')` |
| Set repeat | `task.repetitionRule = ...` | `evaluateJavascript('task.repetitionRule = new RecurrenceRule(...)')` |
| Move task | `task.assignedContainer = ...` | `evaluateJavascript('moveTasks([task], target)')` |
| Clear tags | `task.tags = []` | `evaluateJavascript('task.clearTags()')` |

## Remember

**When in doubt, use the bridge for BOTH operations!**

The bridge truly bypasses ALL JXA limitations, but only if used consistently.