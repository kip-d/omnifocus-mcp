# Perspective Access Discovery

## Summary
We CAN effectively access perspective data through a combination of:
1. Enumerating all perspectives via `evaluateJavascript()`
2. Reading filter rules from custom perspectives
3. Simulating perspective queries using our existing tools

## What Works

### 1. List All Perspectives
```javascript
// Via evaluateJavascript bridge
Perspective.all // All perspectives (built-in + custom)
Perspective.BuiltIn.all // Built-in perspectives
Perspective.Custom.all // Custom perspectives
```

### 2. Get Perspective Details
```javascript
// For custom perspectives
perspective.name
perspective.identifier
perspective.archivedFilterRules // The filter logic!
perspective.archivedTopLevelFilterAggregation // "all" or "any"
```

### 3. Decode Filter Rules
Filter rules tell us exactly what tasks match:
- `actionAvailability`: "available", "remaining", "completed"
- `actionStatus`: "flagged", "due"
- `actionHasNoProject`: true (inbox items)
- `actionIsLeaf`: true (tasks with no subtasks)
- `actionHasDeferDate`: true/false
- `aggregateType`: "any" or "all" for combined rules

## Example Perspective Translations

### "Flagged" (Built-in)
```javascript
list_tasks({ flagged: true, completed: false })
```

### "Today" (Custom)
```javascript
// (due OR flagged) AND remaining
list_tasks({ 
  completed: false,
  $or: [
    { dueDate: { $lte: endOfToday } },
    { flagged: true }
  ]
})
```

### "Right Now" (Custom)
```javascript
// available AND flagged
list_tasks({ 
  available: true, 
  flagged: true,
  completed: false
})
```

### "Overdue Inbox"
```javascript
// remaining AND due AND no project
list_tasks({
  completed: false,
  overdue: true,
  inInbox: true
})
```

## Implementation Strategy

### Phase 1: Perspective Enumeration Tool
```typescript
// New tool: list_perspectives
{
  perspectives: [
    {
      name: "Flagged",
      type: "builtin",
      identifier: null,
      estimatedTaskCount: 29
    },
    {
      name: "Today",
      type: "custom",
      identifier: "i4kJc8VpOmj",
      filterRules: [...],
      estimatedTaskCount: 45
    }
  ]
}
```

### Phase 2: Perspective Query Tool
```typescript
// New tool: query_perspective
query_perspective({
  perspectiveName: "Today"
})
// Returns tasks matching that perspective's filters
```

### Phase 3: Smart Translation
Map perspective filter rules to our existing query parameters:
- `actionAvailability: "available"` → `available: true`
- `actionStatus: "flagged"` → `flagged: true`
- `actionStatus: "due"` → Include overdue + due today
- `actionHasNoProject: true` → `inInbox: true`
- `aggregateType: "any"` → OR logic
- `aggregateType: "all"` → AND logic

## Limitations

1. **Complex Custom Perspectives**: Some perspectives might have rules we can't fully translate
2. **Grouping/Sorting**: Perspectives define display order we can't replicate exactly
3. **Hidden Filters**: Some older perspectives return "not found" for filter rules
4. **No Window Manipulation**: Can't change what the user sees, only query data

## User Benefits

This enables powerful collaborative workflows:
- "I see you have a 'Planning' perspective with 23 tasks. Let's review those."
- "Your 'Today' perspective shows 8 urgent items. Here's my prioritization suggestion..."
- "Based on your 'Due or Flagged' perspective, you have 3 overdue projects needing attention."

## Next Steps

1. Create `list_perspectives` tool
2. Create `query_perspective` tool  
3. Build filter rule translator
4. Add perspective support to prompts
5. Document perspective-based workflows

## Code Example

```javascript
// Get all tasks matching "Today" perspective
const todayPerspective = Perspective.Custom.byName("Today");
const rules = todayPerspective.archivedFilterRules;

// Translate rules to query
const query = translateRulesToQuery(rules);
// Result: { completed: false, $or: [{due: today}, {flagged: true}] }

// Use existing tools
const tasks = await list_tasks(query);
```

This discovery means we can give LLM assistants full visibility into perspective-based workflows without any UI manipulation!