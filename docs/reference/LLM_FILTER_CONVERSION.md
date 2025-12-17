# LLM Filter Conversion Guide

This document provides comprehensive guidance for converting natural language queries into structured OmniFocus task
filters. Use this as a reference when implementing natural language → filter translation.

## Quick Reference

### Operator Summary

**String Operators:**

- `CONTAINS` - substring match (default)
- `STARTS_WITH` - prefix match
- `ENDS_WITH` - suffix match
- `EQUALS` - exact match
- `NOT_EQUALS` - negated match

**Array Operators:**

- `OR` - match ANY value
- `AND` - match ALL values (default)
- `NOT_IN` - match NONE
- `IN` - value in list

**Comparison Operators:**

- `>`, `>=`, `<`, `<=` - comparisons
- `BETWEEN` - range (requires value and upperBound)
- `EQUALS` - exact match

## Conversion Patterns

### Pattern 1: Tag Logic

**Natural Language Patterns:**

- "tagged X or Y"
- "has tag X or tag Y"
- "either X or Y tags"
- "X/Y tagged" (slash indicates OR)

**Conversion:**

```javascript
{
  filters: {
    tags: { operator: "OR", values: ["X", "Y"] }
  }
}
```

**Examples:**

```javascript
// "urgent or important tasks"
{ filters: { tags: { operator: "OR", values: ["urgent", "important"] } } }

// "work and client tagged"
{ filters: { tags: { operator: "AND", values: ["work", "client"] } } }

// "not waiting on anyone"
{ filters: { tags: { operator: "NOT_IN", values: ["waiting"] } } }

// "exclude personal tasks"
{ filters: { tags: { operator: "NOT_IN", values: ["personal"] } } }
```

### Pattern 2: Project Matching

**Natural Language Patterns:**

- "in [project name]" → EQUALS
- "in projects containing [word]" → CONTAINS
- "in projects starting with [word]" → STARTS_WITH
- "in projects ending with [word]" → ENDS_WITH

**Conversion:**

```javascript
{
  filters: {
    project: { operator: "[OPERATOR]", value: "[value]" }
  }
}
```

**Examples:**

```javascript
// "in work projects" (ambiguous - use CONTAINS for safety)
{ filters: { project: { operator: "CONTAINS", value: "work" } } }

// "in the Vacation Planning project" (specific - use EQUALS)
{ filters: { project: { operator: "EQUALS", value: "Vacation Planning" } } }

// "projects starting with Q4"
{ filters: { project: { operator: "STARTS_WITH", value: "Q4" } } }

// "not in Project X"
{ filters: { project: { operator: "NOT_EQUALS", value: "Project X" } } }
```

### Pattern 3: Date Queries

**Natural Language Patterns:**

- "due [timeframe]" → determine operator and date
- "before/after [date]" → use < or >
- "between [date1] and [date2]" → use BETWEEN
- "this week/month/year" → calculate date range

**Date Calculation Guidelines:**

- "today" = current date
- "tomorrow" = current date + 1 day
- "this week" = current date + 7 days (use <=)
- "next week" = current date + 14 days (use <=)
- "this month" = end of current month (use <=)

**Conversion:**

```javascript
{
  filters: {
    dueDate: { operator: "[OPERATOR]", value: "YYYY-MM-DD" }
  }
}
```

**Examples:**

```javascript
// "due this week" (today is 2025-10-01)
{ filters: { dueDate: { operator: "<=", value: "2025-10-07" } } }

// "due after next Monday" (today is 2025-10-01, next Monday is 2025-10-06)
{ filters: { dueDate: { operator: ">", value: "2025-10-06" } } }

// "due between Oct 1 and Oct 7"
{
  filters: {
    dueDate: {
      operator: "BETWEEN",
      value: "2025-10-01",
      upperBound: "2025-10-07"
    }
  }
}

// "overdue" (use mode instead of filter)
{ mode: "overdue" }

// "due today or soon" (within 3 days - use mode)
{ mode: "today" }
```

### Pattern 4: Duration Filtering

**Natural Language Patterns:**

- "quick wins" / "short tasks" → <= 30 minutes
- "under/less than X minutes" → <=
- "over/more than X minutes" → >=
- "between X and Y minutes" → BETWEEN
- "exactly X minutes" → EQUALS

**Conversion:**

```javascript
{
  filters: {
    estimatedMinutes: { operator: "[OPERATOR]", value: number }
  }
}
```

**Examples:**

```javascript
// "quick wins" (typical: under 30 minutes)
{ filters: { estimatedMinutes: { operator: "<=", value: 30 } } }

// "tasks under 15 minutes"
{ filters: { estimatedMinutes: { operator: "<=", value: 15 } } }

// "tasks taking 15 to 30 minutes"
{
  filters: {
    estimatedMinutes: {
      operator: "BETWEEN",
      value: 15,
      upperBound: 30
    }
  }
}

// "long tasks over 2 hours"
{ filters: { estimatedMinutes: { operator: ">=", value: 120 } } }
```

### Pattern 5: Combined Filters

**Natural Language Patterns:**

- Multiple conditions are combined with AND logic
- Use mode + filters for status + conditions
- Order doesn't matter - structure by type

**Conversion Strategy:**

1. Identify the status/mode (today, overdue, available, etc.)
2. Extract each filter condition
3. Determine appropriate operator for each
4. Combine into single filters object

**Examples:**

```javascript
// "available work tasks due this week"
{
  mode: "available",
  filters: {
    project: { operator: "CONTAINS", value: "work" },
    dueDate: { operator: "<=", value: "2025-10-07" }
  }
}

// "urgent or important tasks in Q4 projects"
{
  filters: {
    tags: { operator: "OR", values: ["urgent", "important"] },
    project: { operator: "STARTS_WITH", value: "Q4" }
  }
}

// "quick wins not tagged waiting"
{
  filters: {
    estimatedMinutes: { operator: "<=", value: 30 },
    tags: { operator: "NOT_IN", values: ["waiting"] }
  }
}

// "overdue work tasks tagged client"
{
  mode: "overdue",
  filters: {
    project: { operator: "CONTAINS", value: "work" },
    tags: { operator: "AND", values: ["client"] }
  }
}
```

### Pattern 6: Sorting

**Natural Language Patterns:**

- "sorted by [field]" → single sort
- "by [field] then [field]" → multi-level sort
- "ascending/descending/newest/oldest" → direction

**Sort Fields:**

- dueDate, deferDate, name, flagged, estimatedMinutes, added, completionDate

**Conversion:**

```javascript
{
  sort: [{ field: '[field]', direction: 'asc' | 'desc' }];
}
```

**Examples:**

```javascript
// "sorted by due date"
{
  sort: [{ field: 'dueDate', direction: 'asc' }];
}

// "by priority then due date"
{
  sort: [
    { field: 'flagged', direction: 'desc' },
    { field: 'dueDate', direction: 'asc' },
  ];
}

// "newest first"
{
  sort: [{ field: 'added', direction: 'desc' }];
}

// "shortest tasks first"
{
  sort: [{ field: 'estimatedMinutes', direction: 'asc' }];
}
```

## Mode Selection Guide

Use modes for common queries instead of filters:

- **"today"** - Tasks due within 3 days OR flagged
- **"overdue"** - Tasks past their due date
- **"upcoming"** - Tasks due in next N days
- **"available"** - Tasks ready to work on (not blocked/deferred)
- **"blocked"** - Tasks waiting on others
- **"flagged"** - High priority tasks
- **"smart_suggest"** - AI-powered "what should I work on?"
- **"all"** - All tasks (use with filters)
- **"search"** - Text search (requires search parameter)

**When to use mode vs filters:**

- Use **mode** for status-based queries (overdue, available, etc.)
- Use **filters** for attribute-based queries (tags, projects, dates)
- **Combine** mode + filters for status + attributes

## Complex Query Examples

### Example 1: "What work should I do today?"

```javascript
{
  mode: "today",  // Due soon or flagged
  filters: {
    project: { operator: "CONTAINS", value: "work" }
  },
  sort: [
    { field: "dueDate", direction: "asc" },
    { field: "flagged", direction: "desc" }
  ]
}
```

### Example 2: "Quick wins I can knock out - not waiting on anyone"

```javascript
{
  mode: "available",  // Ready to work on
  filters: {
    estimatedMinutes: { operator: "<=", value: 30 },
    tags: { operator: "NOT_IN", values: ["waiting"] }
  },
  sort: [
    { field: "estimatedMinutes", direction: "asc" }
  ]
}
```

### Example 3: "Urgent client work due this week"

```javascript
{
  filters: {
    tags: { operator: "AND", values: ["urgent", "client"] },
    project: { operator: "CONTAINS", value: "work" },
    dueDate: { operator: "<=", value: "2025-10-07" }
  },
  sort: [
    { field: "dueDate", direction: "asc" }
  ]
}
```

### Example 4: "Home projects - not personal errands"

```javascript
{
  filters: {
    project: { operator: "STARTS_WITH", value: "Home" },
    tags: { operator: "NOT_IN", values: ["errands"] }
  }
}
```

## Common Pitfalls

### Pitfall 1: Using filters when mode is better

**❌ Wrong:**

```javascript
{
  filters: {
    /* complex overdue logic */
  }
}
```

**✅ Correct:**

```javascript
{
  mode: 'overdue';
}
```

### Pitfall 2: Forgetting operator for OR logic

**❌ Wrong:**

```javascript
{
  filters: {
    tags: ['urgent', 'important'];
  }
} // This is AND
```

**✅ Correct:**

```javascript
{ filters: { tags: { operator: "OR", values: ["urgent", "important"] } } }
```

### Pitfall 3: Using EQUALS for partial matching

**❌ Wrong:**

```javascript
{ filters: { project: { operator: "EQUALS", value: "work" } } }  // Won't match "Work Projects"
```

**✅ Correct:**

```javascript
{ filters: { project: { operator: "CONTAINS", value: "work" } } }
```

### Pitfall 4: Not calculating dates

**❌ Wrong:**

```javascript
{ filters: { dueDate: { operator: "<=", value: "this week" } } }  // Not a date
```

**✅ Correct:**

```javascript
{ filters: { dueDate: { operator: "<=", value: "2025-10-07" } } }  // Calculated end of week
```

### Pitfall 5: Mixing simple and advanced filters incorrectly

**❌ Wrong:**

```javascript
{ tags: ["urgent"], filters: { tags: { operator: "OR", values: ["important"] } } }
```

**✅ Correct (choose one approach):**

```javascript
{ filters: { tags: { operator: "OR", values: ["urgent", "important"] } } }
```

## Testing Your Conversions

When implementing natural language conversion, test with:

1. **Simple queries**: "overdue tasks"
2. **OR logic**: "urgent or important"
3. **Date calculations**: "due this week"
4. **Combined filters**: "work tasks due today"
5. **Sorting**: "by due date then priority"
6. **Negation**: "not waiting"
7. **Range queries**: "tasks taking 15-30 minutes"

Validate that:

- Dates are calculated correctly
- Operators match the user's intent
- Mode selection is optimal
- Combined filters use AND logic appropriately
- Sort fields and directions are correct

## API Reference

See `docs/API-REFERENCE-LLM.md` for complete filter operator documentation and schema details.
