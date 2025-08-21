# Migration Guide: v1.x to v2.0.0-alpha

## ⚠️ Breaking Changes

v2.0.0 is a complete redesign of the OmniFocus MCP server focused on optimizing the LLM+User experience rather than query speed. This is NOT backward compatible with v1.x.

## Philosophy Change

### v1.x Philosophy
- Many specialized tools (15+)
- Focus on query performance
- Raw data responses
- Complex parameter schemas

### v2.0.0 Philosophy
- Few consolidated tools (4-5)
- Focus on LLM comprehension speed
- Summary-first responses
- Simple, mode-based interfaces

## Tool Mapping

### Task Tools

| v1.x Tool | v2.0.0 Equivalent |
|-----------|-------------------|
| `list_tasks` | `tasks` with `mode: "all"` |
| `query_tasks` | `tasks` with `mode: "search"` |
| `get_overdue_tasks` | `tasks` with `mode: "overdue"` |
| `get_upcoming_tasks` | `tasks` with `mode: "upcoming"` |
| `todays_agenda` | `tasks` with `mode: "today"` |
| `next_actions` | `tasks` with `mode: "available"` |
| `blocked_tasks` | `tasks` with `mode: "blocked"` |
| `available_tasks` | `tasks` with `mode: "available"` |
| `query_tasks_by_date` | `tasks` with `mode: "all"` + `dueBy` |

### Project Tools

| v1.x Tool | v2.0.0 Equivalent |
|-----------|-------------------|
| `list_projects` | `projects` with `operation: "list"` |
| `create_project` | `projects` with `operation: "create"` |
| `update_project` | `projects` with `operation: "update"` |
| `complete_project` | `projects` with `operation: "complete"` |
| `delete_project` | `projects` with `operation: "delete"` |
| `projects_for_review` | `projects` with `operation: "review"` |

### Task CRUD Operations

| v1.x Tool | v2.0.0 Equivalent |
|-----------|-------------------|
| `create_task` | `task_ops` with `operation: "create"` |
| `update_task` | `task_ops` with `operation: "update"` |
| `complete_task` | `task_ops` with `operation: "complete"` |
| `delete_task` | `task_ops` with `operation: "delete"` |

## Response Format Changes

### v1.x Response
```json
{
  "tasks": [
    {
      "id": "abc123",
      "name": "Task name",
      "dueDate": "2025-03-15T17:00:00Z",
      // ... 20+ other fields
    }
    // ... 100 more tasks
  ],
  "metadata": {
    "total": 101
  }
}
```

### v2.0.0 Response
```json
{
  "success": true,
  "summary": {
    "total": 101,
    "overdue": 5,
    "dueToday": 3,
    "key_insight": "5 tasks overdue",
    "most_urgent": "Tax return (30 days overdue)"
  },
  "insights": [
    "You have 5 overdue tasks",
    "3 tasks are due today",
    "Next action: 'Review Q1 report'"
  ],
  "data": {
    "preview": [
      // First 5 most relevant tasks
    ],
    "items": [
      // Full list if needed (limited to 25 by default)
    ]
  },
  "metadata": {
    "query_time_ms": 2500,
    "from_cache": false,
    "mode": "overdue"
  }
}
```

## Parameter Changes

### Natural Language Support

v2.0.0 accepts natural language for dates:
- ✅ `"tomorrow"`
- ✅ `"next week"`
- ✅ `"friday"`
- ✅ `"next monday"`

### Boolean String Support

v2.0.0 auto-converts string booleans:
- `"true"` → `true`
- `"false"` → `false`
- `"yes"` → `true`
- `"no"` → `false`

### Reduced Default Limits

- v1.x: Default 100 items
- v2.0.0: Default 25 items (with preview of 5)

## Example Migrations

### Getting Overdue Tasks

**v1.x:**
```javascript
mcp.call('get_overdue_tasks', {
  limit: 100,
  includeCompleted: false,
  includeDetails: true
})
```

**v2.0.0:**
```javascript
mcp.call('tasks', {
  mode: 'overdue',
  limit: 25,  // Smaller default
  details: false  // Faster by default
})
```

### Creating a Task

**v1.x:**
```javascript
mcp.call('create_task', {
  name: 'Review proposal',
  dueDate: '2025-03-15T17:00:00Z',
  projectId: 'abc123',
  flagged: true,
  tags: ['work', 'urgent']
})
```

**v2.0.0:**
```javascript
mcp.call('task_ops', {
  operation: 'create',
  name: 'Review proposal',
  dueDate: 'tomorrow at 5pm',  // Natural language!
  project: 'Marketing',  // Can use name or ID
  flagged: true,
  tags: ['work', 'urgent']
})
```

### Searching Tasks

**v1.x:**
```javascript
mcp.call('query_tasks', {
  search: 'budget',
  completed: false,
  limit: 50,
  includeDetails: true
})
```

**v2.0.0:**
```javascript
mcp.call('tasks', {
  mode: 'search',
  search: 'budget',
  completed: false,  // Can also be "false" string
  limit: 25
})
```

## Benefits of v2.0.0

### For LLMs
1. **Faster tool selection** - 4 tools vs 15+ tools
2. **Clearer parameters** - Mode-based, not tool-based
3. **Less data to process** - Summaries and previews
4. **Fewer errors** - Input normalization prevents retries

### For Users
1. **Faster responses** - 6-8 seconds vs 15-20 seconds
2. **Better insights** - Key information highlighted
3. **Natural language** - "tomorrow" instead of ISO dates
4. **No retries** - Clear errors with suggestions

## Rollback Instructions

If you need to rollback to v1.x:

```bash
# Install latest v1.x
npm install omnifocus-mcp@^1.15.0

# Or use git
git checkout v1.15.0
npm install
npm run build
```

## Alpha Status

v2.0.0-alpha.1 is an alpha release:
- API may still change based on feedback
- Not recommended for production use
- Please report issues and suggestions
- Final v2.0.0 release planned after testing

## Getting Help

- Report issues: https://github.com/kip-d/omnifocus-mcp/issues
- Tag with: `v2-alpha`
- Include: Tool used, parameters sent, error received

## Testing v2.0.0-alpha

```bash
# Install alpha version
npm install omnifocus-mcp@2.0.0-alpha.1

# Or from source
git checkout v2.0.0-alpha
npm install
npm run build

# Test the new tools
npm run test:v2
```

## Feedback Needed

We need feedback on:
1. Are the new tool names clear?
2. Do the modes make sense?
3. Is the summary helpful?
4. What other consolidations would help?
5. Any parameters that are confusing?

---

*Last updated: 2025-08-14*
*Version: 2.0.0-alpha.1*