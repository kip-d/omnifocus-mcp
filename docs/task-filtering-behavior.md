# Task Filtering Behavior Guide

This document describes the consistent filtering behavior across all OmniFocus MCP task listing functions.

## Overview

All task listing functions now support consistent filtering parameters with clear precedence rules.

## Common Filtering Parameters

### Core Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `activeOnly` | boolean | true | Only include active (non-completed, non-dropped) tasks |
| `includeCompleted` | boolean | false | Include completed tasks (overrides activeOnly for completed) |
| `includeDropped` | boolean | false | Include dropped tasks (overrides activeOnly for dropped) |

### List Tasks Specific

| Parameter | Type | Description |
|-----------|------|-------------|
| `available` | boolean | Filter available tasks (not completed, not dropped, not blocked, not deferred) |
| `completed` | boolean | Explicit filter by completion status |

## Filtering Logic Precedence

The filtering logic follows this precedence order:

1. **Explicit exclusions first**: If `includeCompleted=false`, completed tasks are excluded regardless of other settings
2. **Explicit inclusions second**: If `includeCompleted=true`, completed tasks are included regardless of `activeOnly`
3. **activeOnly fallback**: If no explicit overrides, `activeOnly=true` excludes both completed and dropped tasks

### Logic Flow

```typescript
// For each task:
const isCompleted = task.completed();
const isDropped = task.dropped();

// Skip completed tasks unless includeCompleted is true
if (isCompleted && !includeCompleted) continue;

// Skip dropped tasks unless includeDropped is true  
if (isDropped && !includeDropped) continue;

// If activeOnly is true and no explicit overrides, skip non-active tasks
if (activeOnly && !includeCompleted && !includeDropped && (isCompleted || isDropped)) continue;
```

## Function-Specific Behavior

### `list_tasks`

| Parameter Combination | Result |
|----------------------|--------|
| `available=true` | Excludes completed, dropped, blocked, and deferred tasks |
| `completed=true` | Shows only completed tasks |
| `completed=false` | Shows only non-completed tasks |
| Default (no filters) | Shows all tasks |

### `analyze_recurring_tasks`

| Parameter Combination | Result |
|----------------------|--------|
| `activeOnly=true` (default) | Shows only active recurring tasks |
| `includeCompleted=true` | Includes completed recurring tasks |
| `includeDropped=true` | Includes dropped recurring tasks |
| `activeOnly=false, includeCompleted=false, includeDropped=false` | Shows only active tasks (same as activeOnly=true) |

### `get_recurring_patterns`

Same filtering logic as `analyze_recurring_tasks`.

## Usage Examples

### Get Only Active Recurring Tasks (Default)
```json
{
  "name": "analyze_recurring_tasks"
}
```

### Get All Recurring Tasks (Including Completed and Dropped)
```json
{
  "name": "analyze_recurring_tasks",
  "arguments": {
    "activeOnly": false,
    "includeCompleted": true,
    "includeDropped": true
  }
}
```

### Get Active + Completed (But Not Dropped)
```json
{
  "name": "analyze_recurring_tasks", 
  "arguments": {
    "activeOnly": true,
    "includeCompleted": true,
    "includeDropped": false
  }
}
```

### Equivalent to list_tasks available=true
```json
{
  "name": "list_tasks",
  "arguments": {
    "available": true
  }
}
```

## Consistency Notes

1. **`activeOnly=true`** is equivalent to **`available=true`** in terms of task status filtering
2. **Explicit parameters override defaults**: `includeCompleted=true` will show completed tasks even if `activeOnly=true`
3. **Cache keys include filter options**: Different filter combinations create separate cache entries
4. **Metadata includes options**: All responses include the applied filter options in metadata

## Migration Notes

### Before Enhancement
- `analyze_recurring_tasks` only had `activeOnly` parameter
- `get_recurring_patterns` had no filtering parameters
- Inconsistent behavior between tools

### After Enhancement
- Both tools support granular filtering
- Consistent parameter names and behavior
- Explicit override capabilities
- Clear precedence rules

## Best Practices

1. **Use defaults for typical analysis**: Default `activeOnly=true` covers most use cases
2. **Be explicit for historical analysis**: Set `includeCompleted=true` when analyzing completion patterns
3. **Use `includeDropped=false`** unless specifically analyzing abandoned tasks
4. **Document filter usage**: Include filter parameters in API calls for clarity