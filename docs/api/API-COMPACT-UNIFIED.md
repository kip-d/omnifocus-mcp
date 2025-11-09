# OmniFocus MCP v2.3.0 - Unified Builder API (3 Tools - EXPERIMENTAL)

**Status:** EXPERIMENTAL - Testing phase for context window optimization
**Parallel Operation:** Legacy 17 tools still available (use those for production)

**📖 More Resources:** [Testing Prompt](../../TESTING_PROMPT.md) | [Full Docs](../../CLAUDE.md) | [Legacy 17 Tools](./API-COMPACT.md)

---

## 🎯 Design Philosophy

Three unified tools consolidate 17 legacy tools using builder pattern:
- **Reduced context**: 3 tool schemas vs 17 (85% reduction)
- **Type-safe**: Discriminated unions ensure correct parameters
- **Zero backend changes**: Pure routing layer over existing infrastructure

---

## 1️⃣ omnifocus_read - Query Builder

**Purpose:** Unified query interface for all OmniFocus data types

**Schema:**
```typescript
{
  query: {
    type: "tasks" | "projects" | "tags" | "perspectives" | "folders",
    filters?: {
      project?: string | null,  // null = inbox
      tags?: {any: string[]} | {all: string[]} | {none: string[]},
      status?: "active" | "completed",
      flagged?: boolean,
      dueDate?: {before: string} | {after: string} | {between: [string, string]},
      deferDate?: {before: string} | {after: string},
      text?: {contains: string} | {matches: string},
      folder?: string,
      OR?: Filter[],
      AND?: Filter[],
      NOT?: Filter
    },
    fields?: string[],  // Select specific fields to return
    sort?: Array<{field: string, direction: "asc" | "desc"}>,
    limit?: number,     // Default: 25
    offset?: number,
    mode?: "search" | "smart_suggest"
  }
}
```

**Examples:**
```typescript
// Inbox tasks
{query: {type: "tasks", filters: {project: null}, limit: 10}}

// Overdue tasks
{query: {type: "tasks", filters: {dueDate: {before: "2025-11-05"}, status: "active"}}}

// Smart suggestions
{query: {type: "tasks", mode: "smart_suggest", limit: 10}}

// All projects
{query: {type: "projects"}}

// All tags
{query: {type: "tags"}}

// Tasks with ANY of these tags
{query: {type: "tasks", filters: {tags: {any: ["urgent", "important"]}}}}

// Tasks with ALL of these tags
{query: {type: "tasks", filters: {tags: {all: ["work", "today"]}}}}
```

**Routes to:** tasks, projects, tags, perspectives, folders tools

---

## 2️⃣ omnifocus_write - Mutation Builder

**Purpose:** Unified mutation interface for create/update/complete/delete operations

**Schema (Discriminated Union):**
```typescript
{
  mutation: {
    operation: "create" | "update" | "complete" | "delete" | "batch",

    // For create
    target?: "task" | "project",
    data?: {
      name?: string,
      note?: string,
      project?: string | null,  // null = inbox
      tags?: string[],
      addTags?: string[],
      removeTags?: string[],
      dueDate?: string,         // "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"
      deferDate?: string,
      plannedDate?: string,
      flagged?: boolean,
      estimatedMinutes?: number,
      sequential?: boolean,
      parentTaskId?: string,
      repeatRule?: {...}
    },

    // For update/complete/delete
    id?: string,
    changes?: {...},  // Same fields as data

    // For batch
    operations?: Array<{target, data}>
  }
}
```

**Examples:**
```typescript
// Create task
{
  mutation: {
    operation: "create",
    target: "task",
    data: {
      name: "Call Sarah",
      dueDate: "2025-11-06",
      flagged: true,
      tags: ["work", "phone"]
    }
  }
}

// Update task
{
  mutation: {
    operation: "update",
    target: "task",
    id: "abc123",
    changes: {
      note: "Updated note",
      dueDate: "2025-11-07"
    }
  }
}

// Complete task
{
  mutation: {
    operation: "complete",
    target: "task",
    id: "abc123"
  }
}

// Delete task
{
  mutation: {
    operation: "delete",
    target: "task",
    id: "abc123"
  }
}

// Batch create
{
  mutation: {
    operation: "batch",
    operations: [
      {target: "project", data: {name: "Q4 Goals"}},
      {target: "task", data: {name: "Review metrics"}}
    ]
  }
}

// Add tags to existing task
{
  mutation: {
    operation: "update",
    target: "task",
    id: "abc123",
    changes: {
      addTags: ["urgent", "today"]
    }
  }
}

// Move task to inbox
{
  mutation: {
    operation: "update",
    target: "task",
    id: "abc123",
    changes: {
      project: null
    }
  }
}
```

**Routes to:** manage_task, batch_create tools

---

## 3️⃣ omnifocus_analyze - Analysis Router

**Purpose:** Unified analysis interface for insights and specialized operations

**Schema (Discriminated Union):**
```typescript
{
  analysis: {
    type: "productivity_stats" | "task_velocity" | "overdue_analysis" |
          "pattern_analysis" | "workflow_analysis" | "recurring_tasks" |
          "parse_meeting_notes" | "manage_reviews",

    scope?: {
      dateRange?: {start: string, end: string},
      tags?: string[],
      projects?: string[],
      includeCompleted?: boolean
    },

    params?: {
      // Type-specific parameters
      groupBy?: "day" | "week" | "month",
      metrics?: string[],
      insights?: string[],
      text?: string,           // For parse_meeting_notes
      extractTasks?: boolean,
      defaultProject?: string,
      defaultTags?: string[],
      operation?: string,      // For manage_reviews
      sortBy?: string
    }
  }
}
```

**Examples:**
```typescript
// Productivity stats
{
  analysis: {
    type: "productivity_stats",
    params: {
      groupBy: "week"
    }
  }
}

// Parse meeting notes
{
  analysis: {
    type: "parse_meeting_notes",
    params: {
      text: "Follow up with Sarah tomorrow. Call Bob on Friday.",
      extractTasks: true,
      defaultTags: ["meeting"]
    }
  }
}

// Overdue analysis
{
  analysis: {
    type: "overdue_analysis",
    scope: {
      tags: ["work"],
      projects: ["Q4 Goals"]
    }
  }
}

// Pattern analysis
{
  analysis: {
    type: "pattern_analysis",
    params: {
      insights: ["duplicates", "dormant_projects", "tag_audit"]
    }
  }
}

// Workflow analysis
{
  analysis: {
    type: "workflow_analysis",
    scope: {
      dateRange: {
        start: "2025-10-01",
        end: "2025-10-31"
      }
    }
  }
}

// Task velocity
{
  analysis: {
    type: "task_velocity",
    scope: {
      dateRange: {
        start: "2025-10-01",
        end: "2025-11-05"
      }
    },
    params: {
      groupBy: "week"
    }
  }
}

// Recurring tasks
{
  analysis: {
    type: "recurring_tasks",
    params: {
      operation: "analyze",
      sortBy: "frequency"
    }
  }
}

// Manage reviews
{
  analysis: {
    type: "manage_reviews",
    params: {
      operation: "list_for_review"
    }
  }
}
```

**Routes to:** productivity_stats, task_velocity, analyze_overdue, analyze_patterns, workflow_analysis, recurring_tasks, parse_meeting_notes, manage_reviews tools

---

## 📋 Quick Reference

### Common Patterns

**Query inbox:**
```typescript
{query: {type: "tasks", filters: {project: null}}}
```

**Query overdue:**
```typescript
{query: {type: "tasks", filters: {dueDate: {before: "now"}, status: "active"}}}
```

**Create flagged task:**
```typescript
{mutation: {operation: "create", target: "task", data: {name: "...", flagged: true}}}
```

**Complete task:**
```typescript
{mutation: {operation: "complete", target: "task", id: "..."}}
```

**Weekly productivity:**
```typescript
{analysis: {type: "productivity_stats", params: {groupBy: "week"}}}
```

---

## 🔧 Key Differences from Legacy API

| Legacy (17 tools) | Unified (3 tools) | Benefit |
|-------------------|-------------------|---------|
| `tasks(mode: "inbox")` | `omnifocus_read({query: {type: "tasks", filters: {project: null}}})` | Explicit filter syntax |
| `manage_task(operation: "create", ...)` | `omnifocus_write({mutation: {operation: "create", target: "task", data: {...}}})` | Discriminated union |
| `productivity_stats(period: "week")` | `omnifocus_analyze({analysis: {type: "productivity_stats", params: {groupBy: "week"}}})` | Consistent structure |

---

## ⚠️ Important Notes

1. **Date Format:** Always convert natural language ("tomorrow") to "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"
2. **Inbox:** Use `project: null` (not empty string)
3. **Tag Operations:** Use `tags` (replace all), `addTags` (add), or `removeTags` (remove)
4. **Discriminated Unions:** The `operation` and `type` fields determine which other fields are required/valid
5. **String Coercion:** All parameters stringified by Claude Desktop MCP bridge
6. **Response Format:** Standard V2 response with `{success, data, error, metadata}`

---

## 🧪 Testing Status

- ✅ All schemas implemented with discriminated unions
- ✅ All compilers route to existing backend
- ✅ All tools registered (20 total: 3 unified + 17 legacy)
- ✅ End-to-end integration tests passing (10/10)
- 🧪 EXPERIMENTAL - User testing in progress

---

## 🔗 Migration Path

**Current:** Both APIs available (20 tools total)
**Testing:** Validate 3 tools can replace 17
**Future:** If testing passes, remove 17 legacy tools
**Benefit:** 85% context window reduction (3 vs 20 tools)

---

## 📖 Additional Resources

- **Legacy API:** [API-COMPACT.md](./API-COMPACT.md) (17 tools)
- **Testing Guide:** [TESTING_PROMPT.md](../../TESTING_PROMPT.md)
- **Implementation:** [CLAUDE.md](../../CLAUDE.md) - Unified Builder API section
- **Full Reference:** [API-REFERENCE-LLM.md](./API-REFERENCE-LLM.md)
