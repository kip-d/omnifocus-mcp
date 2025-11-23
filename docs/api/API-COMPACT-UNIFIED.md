# OmniFocus MCP v3.0.0 - Unified Builder API (4 Tools)

**Status:** STABLE - Production-ready unified API with comprehensive testing and validation

**📖 More Resources:** [Testing Prompt](../../TESTING_PROMPT.md) | [Full Docs](../../CLAUDE.md)

---

## 🎯 Design Philosophy

Four unified tools provide streamlined MCP interface for LLM optimization:
- **Reduced context**: 4 tool schemas vs 17 legacy (76% reduction)
- **Type-safe**: Discriminated unions ensure correct parameters
- **Zero backend changes**: Pure routing layer over existing infrastructure
- **Production ready**: Comprehensive testing with 100% success rate

---

## 1️⃣ omnifocus_read - Query Builder

**Purpose:** Unified query interface for all OmniFocus data types

**Schema:**
```typescript
{
  query: {
    type: "tasks" | "projects" | "tags" | "perspectives" | "folders",
    filters?: {
      // Task filters
      id?: string,        // Exact task ID lookup
      project?: string | null,  // null = inbox
      tags?: {any: string[]} | {all: string[]} | {none: string[]},
      status?: "active" | "completed" | "dropped" | "on_hold",
      flagged?: boolean,
      blocked?: boolean,
      available?: boolean,
      inInbox?: boolean,  // Explicit inbox filter
      dueDate?: {before: string} | {after: string} | {between: [string, string]},
      deferDate?: {before: string} | {after: string} | {between: [string, string]},
      plannedDate?: {before: string} | {after: string} | {between: [string, string]},
      added?: {before: string} | {after: string} | {between: [string, string]},
      estimatedMinutes?: {equals: number} | {lessThan: number} | {greaterThan: number} | {between: [number, number]},
      text?: {contains: string} | {matches: string},
      // Project filters
      folder?: string,
      // Logical operators (recursive)
      OR?: Filter[],
      AND?: Filter[],
      NOT?: Filter
    },
    fields?: string[],  // Type-safe enum: id, name, dueDate, tags, etc. (23 fields)
    sort?: Array<{field: string, direction: "asc" | "desc"}>,  // Type-safe sort fields (9 fields)
    limit?: number,     // Default: 25, Max: 500
    offset?: number,    // For pagination
    // Query modes
    mode?: "all" | "inbox" | "search" | "overdue" | "today" | "upcoming" |
           "available" | "blocked" | "flagged" | "smart_suggest",
    // Response control
    details?: boolean,      // Include full details vs minimal
    fastSearch?: boolean,   // Search names only (performance)
    daysAhead?: number      // For upcoming mode (1-30 days)
  }
}
```

**Examples:**
```typescript
// Inbox tasks (two ways)
{query: {type: "tasks", filters: {project: null}, limit: 10}}
{query: {type: "tasks", filters: {inInbox: true}, limit: 10}}

// Query modes
{query: {type: "tasks", mode: "today"}}          // Due soon (≤3 days) OR flagged
{query: {type: "tasks", mode: "overdue"}}        // Past due date
{query: {type: "tasks", mode: "upcoming", daysAhead: 7}}  // Next 7 days
{query: {type: "tasks", mode: "available"}}      // Ready to work on
{query: {type: "tasks", mode: "blocked"}}        // Waiting on others
{query: {type: "tasks", mode: "flagged"}}        // High priority
{query: {type: "tasks", mode: "smart_suggest", limit: 10}}

// Exact task ID lookup
{query: {type: "tasks", filters: {id: "kz7wD9uVzJB"}}}

// Quick wins (short tasks)
{query: {type: "tasks", filters: {estimatedMinutes: {lessThan: 30}}, mode: "available"}}

// Recently added tasks
{query: {type: "tasks", filters: {added: {after: "2025-11-01"}}}}

// Tasks with planned dates
{query: {type: "tasks", filters: {plannedDate: {between: ["2025-11-10", "2025-11-17"]}}}}

// Response optimization
{query: {type: "tasks", mode: "inbox", details: false}}  // Minimal response
{query: {type: "tasks", mode: "search", filters: {text: {contains: "meeting"}}, fastSearch: true}}

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

## 4️⃣ system - System Diagnostics

**Purpose:** System information, diagnostics, and health checks

**Schema:**
```typescript
{
  operation: "version" | "diagnostics" | "metrics" | "cache"
}
```

**Examples:**
```typescript
// Get version information
{operation: "version"}

// Run system diagnostics
{operation: "diagnostics"}

// Get performance metrics
{operation: "metrics"}

// Get cache statistics
{operation: "cache"}
```

**Returns:** System information, diagnostic results, performance metrics, or cache statistics

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

| Legacy (17 tools) | Unified (4 tools) | Benefit |
|-------------------|-------------------|---------|
| `tasks(mode: "inbox")` | `omnifocus_read({query: {type: "tasks", filters: {project: null}}})` | Explicit filter syntax |
| `manage_task(operation: "create", ...)` | `omnifocus_write({mutation: {operation: "create", target: "task", data: {...}}})` | Discriminated union |
| `productivity_stats(period: "week")` | `omnifocus_analyze({analysis: {type: "productivity_stats", params: {groupBy: "week"}}})` | Consistent structure |
| 17 separate tool schemas | 4 unified tool schemas | 76% context reduction |

---

## ⚠️ Important Notes

1.  **Date Format:** Always convert natural language ("tomorrow") to "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"
2.  **Inbox:** Use `project: null` (not empty string)
3.  **Tag Operations:** Use `tags` (replace all), `addTags` (add), or `removeTags` (remove)
4.  **Discriminated Unions:** The `operation` and `type` fields determine which other fields are required/valid
5.  **String Coercion:** All parameters stringified by Claude Desktop MCP bridge
6.  **Response Format:**
    *   **JSON Default:** Tools return optimized JSON structure by default (saving ~20-30% tokens).
    *   **Standard V2:** All responses follow `{success, data, error, metadata}`.
    *   **Character Limit:** Responses are capped at 25,000 characters. Large results are automatically truncated with a helpful message.
7.  **Tool Annotations:** All tools provide standard MCP annotations (`readOnlyHint`, `destructiveHint`, etc.) to guide client behavior.

---

## ✅ Production Status

- ✅ All schemas implemented with discriminated unions
- ✅ All compilers route to existing backend tools
- ✅ All 4 tools registered and tested
- ✅ End-to-end integration tests passing (17/17)
- ✅ User testing complete with 100% success rate
- ✅ Production ready (v3.0.0)

---

## 📊 Performance & Benefits

**Context Window Optimization:**
- Legacy API: 17 separate tool schemas
- Unified API: 4 consolidated tools
- **Reduction: 76%** (4 vs 17 tools)

**Stability:**
- Zero backend changes (pure routing layer)
- Comprehensive test coverage
- Production-ready with validation

---

## 📖 Additional Resources

- **Implementation Guide:** [CLAUDE.md](../../CLAUDE.md) - Unified Builder API section
- **Full API Reference:** [API-REFERENCE-LLM.md](./API-REFERENCE-LLM.md)
- **Testing Guide:** [TESTING_PROMPT.md](../../TESTING_PROMPT.md)
- **Documentation Map:** [DOCS_MAP.md](../DOCS_MAP.md) - Complete documentation index
