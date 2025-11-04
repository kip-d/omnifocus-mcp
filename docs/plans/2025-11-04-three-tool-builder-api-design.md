# Three-Tool Builder API Design

**Status:** Approved Design
**Date:** 2025-11-04
**Purpose:** Simplify OmniFocus MCP server from 17 tools to 3 tools using builder API pattern, reducing complexity while maintaining full functionality.

---

## Executive Summary

This design consolidates the current 17-tool MCP server into 3 core tools using a builder API pattern:
- **`omnifocus_read`** - Query builder for all read operations (tasks, projects, tags, perspectives, folders)
- **`omnifocus_write`** - Mutation builder for all write operations (create, update, complete, delete, batch)
- **`omnifocus_analyze`** - Analysis operations (productivity stats, velocity, patterns, recurring tasks, meeting notes, reviews)

**Key Benefits:**
- **Simpler mental model** for LLMs (3 tools vs 17)
- **Easier maintenance** (single schema per operation type)
- **Better flexibility** (LLMs compose complex queries via filters)
- **Minimal new code** (reuses all existing JXA/OmniJS infrastructure)
- **Token savings** (realistic: 0-23% reduction, ~7,000-9,200 tokens vs current 9,220)

**Implementation Strategy:** Phased rollout with parallel operation, automatic migration suggestions, then cleanup of deprecated tools.

---

## Problem Statement

### Current State

**17 tools consuming ~9,480 tokens** (~38K characters) in tool definitions:

| Category | Tools | Tokens | Notes |
|----------|-------|--------|-------|
| **Read** | tasks, projects, tags, perspectives, folders, export | ~5,099 | tasks alone is 1,907 tokens (20%!) |
| **Write** | manage_task, batch_create | ~1,615 | Relatively simple |
| **Analyze** | productivity_stats, task_velocity, overdue_analysis, pattern_analysis, workflow_analysis, recurring_tasks, parse_meeting_notes, manage_reviews | ~2,350 | Low-frequency, can absorb complexity |
| **System** | system | ~256 | Keep as-is |

### Key Issues

1. **High Cognitive Load**
   - LLMs must choose from 17 tools
   - Each tool has unique schema and parameters
   - Overlapping functionality (e.g., 10 modes in tasks tool)

2. **Maintenance Burden**
   - Changes to common patterns require updates across multiple tools
   - Testing requires 17+ code paths
   - Documentation sprawl

3. **Excessive Modes**
   - `tasks` tool has 10 modes (all, inbox, search, overdue, today, upcoming, available, blocked, flagged, smart_suggest)
   - 7 modes are just filter shortcuts (inbox, overdue, today, upcoming, flagged, blocked, available)
   - Could be simplified to 2-3 modes with proper filtering

4. **Context Window Inefficiency**
   - Tool definitions consume substantial tokens
   - Redundant documentation across similar tools

---

## Design Decisions

### Architectural Approach: Builder API Pattern (Approach C)

**Chosen:** Nested JSON builder pattern with clear separation of concerns

**Rationale:**
- Most structured approach
- Clear namespacing (query, mutation, analysis)
- Type-safe with Zod validation
- Self-documenting structure

### Filter Syntax: Custom DSL-lite (Option B)

**Chosen:** Readable custom operators, not MongoDB-style

```typescript
// ✅ CHOSEN - Custom DSL-lite
filters: {
  tags: { any: ["work", "urgent"] },           // Has any of these tags
  dueDate: { before: "2025-01-31" },           // Due before date
  status: "active"                              // Simple equality
}

// ❌ NOT CHOSEN - MongoDB-style
filters: {
  tags: { $in: ["work", "urgent"] },
  dueDate: { $lte: "2025-01-31" }
}
```

**Rationale:**
- More readable for LLMs (clear intent: "any", "before", "after")
- Not tied to external DSL (MongoDB)
- Easier to extend with custom operators

### Migration Strategy: Automatic Suggestions

**Approach:** During parallel operation phase, old tools provide migration suggestions in responses

```typescript
// Example old tool response during migration
{
  success: true,
  data: { /* task data */ },
  _migration_hint: "This tool (tasks) is deprecated. Use omnifocus_read with query: { type: 'tasks', filters: { ... } }"
}
```

**Note:** Once proven successful, old tools will be removed entirely. Migration hints only needed during transition.

### Smart Suggest Placement: Keep in omnifocus_read

**Decision:** `smart_suggest` mode stays in `omnifocus_read` tool

**Rationale:**
- Fundamentally a read operation (queries and filters tasks)
- Scoring algorithm is simple (overdue +100, due today +80, flagged +50, available +30, quick wins +20)
- Likely high-frequency usage ("what should I work on?")
- Not pattern analysis (which would fit omnifocus_analyze)

### Analysis Tool Warnings: Document, Don't Gate

**Decision:** `omnifocus_analyze` does NOT require confirmation for expensive operations

**Rationale:**
- Tool descriptions warn LLM about expensive operations
- LLM can decide whether to seek user confirmation
- Keeps tool simple, delegates intelligence to LLM
- User interaction is natural language, not direct tool calls

---

## Core Tool Schemas

### Tool 1: omnifocus_read

**Purpose:** Query builder for all read operations

**Schema:**
```typescript
{
  query: {
    type: "tasks" | "projects" | "tags" | "perspectives" | "folders",

    filters?: {
      // Common filters (all types)
      status?: "active" | "completed" | "dropped" | "on_hold",

      // Task-specific filters
      tags?: {
        all?: string[],      // Has ALL these tags
        any?: string[],      // Has ANY of these tags
        none?: string[]      // Has NONE of these tags
      },
      project?: string | null,  // Specific project or null for inbox
      dueDate?: {
        before?: string,     // "YYYY-MM-DD" or "now+3days"
        after?: string,
        between?: [string, string]
      },
      deferDate?: { /* same as dueDate */ },
      flagged?: boolean,
      blocked?: boolean,
      available?: boolean,
      text?: {
        contains?: string,   // Substring search
        matches?: string     // Regex pattern
      },

      // Project-specific filters
      folder?: string,

      // Logical operators
      AND?: Filter[],        // All must match
      OR?: Filter[],         // Any must match
      NOT?: Filter           // Negation
    },

    fields?: string[],       // Optional field selection for performance
    sort?: Array<{
      field: string,
      order: "asc" | "desc"
    }>,
    limit?: number,          // Pagination
    offset?: number,

    mode?: "search" | "smart_suggest"  // Special modes
  }
}
```

**Example - Simple inbox query:**
```json
{
  "query": {
    "type": "tasks",
    "filters": {
      "project": null,
      "status": "active"
    },
    "limit": 25
  }
}
```

**Example - Complex query with OR logic:**
```json
{
  "query": {
    "type": "tasks",
    "filters": {
      "OR": [
        {
          "dueDate": {"before": "now+3days"},
          "status": "active"
        },
        {
          "flagged": true
        }
      ],
      "tags": {"any": ["work", "urgent"]}
    },
    "fields": ["id", "name", "dueDate", "tags"],
    "sort": [{"field": "dueDate", "order": "asc"}],
    "limit": 10
  }
}
```

**Example - Smart suggestions:**
```json
{
  "query": {
    "type": "tasks",
    "mode": "smart_suggest",
    "filters": {
      "tags": {"any": ["work"]}
    },
    "limit": 10
  }
}
```

**Description (for LLM):**
```
Query OmniFocus data with flexible filtering. Returns tasks, projects, tags, perspectives, or folders based on type.

COMMON QUERIES:
- Inbox: { type: "tasks", filters: { project: null } }
- Overdue: { type: "tasks", filters: { dueDate: { before: "now" }, status: "active" } }
- Today's tasks: { type: "tasks", filters: { OR: [{ dueDate: { before: "now+3days" }}, { flagged: true }] } }
- Smart suggestions: { type: "tasks", mode: "smart_suggest" }

FILTER OPERATORS:
- tags: { any: [...] } (has any), { all: [...] } (has all), { none: [...] } (has none)
- dates: { before: "YYYY-MM-DD" }, { after: "..." }, { between: ["...", "..."] }
- text: { contains: "..." }, { matches: "regex" }
- logic: { OR: [...] }, { AND: [...] }, { NOT: {...} }

PERFORMANCE:
- Use fields to select only needed data
- Set reasonable limits (default: 25)
- Smart suggest uses scoring algorithm (overdue +100, due today +80, flagged +50)

EXAMPLES: [include 5-10 common examples]
```

**Estimated size:** ~2,500-3,500 tokens

---

### Tool 2: omnifocus_write

**Purpose:** Mutation builder for all write operations

**Schema:**
```typescript
{
  mutation: {
    operation: "create" | "update" | "complete" | "delete" | "batch",
    target: "task" | "project",

    // For create
    data?: {
      name: string,              // Required for create
      note?: string,
      project?: string | null,   // null = inbox
      tags?: string[],
      dueDate?: string,          // "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"
      deferDate?: string,
      flagged?: boolean,
      estimatedMinutes?: number,
      repetitionRule?: {
        frequency: "daily" | "weekly" | "monthly" | "yearly",
        interval: number,
        daysOfWeek?: number[],   // 1-7 for weekly
        endDate?: string
      },
      // Project-specific
      folder?: string,
      sequential?: boolean,
      status?: "active" | "on_hold" | "completed" | "dropped"
    },

    // For update/complete/delete
    id?: string,                 // Task/project ID

    // For update (changes to apply)
    changes?: {
      name?: string,
      tags?: string[],           // Replaces all tags
      addTags?: string[],        // Adds to existing
      removeTags?: string[],     // Removes from existing
      dueDate?: string | null,   // null clears date
      status?: "completed" | "dropped",
      project?: string | null,   // Move to project or inbox
      // ... other updatable fields
    },

    // For batch
    operations?: Array<{
      operation: "create" | "update",
      target: "task" | "project",
      data?: { /* create data */ },
      id?: string,
      changes?: { /* update data */ }
    }>
  }
}
```

**Example - Create task:**
```json
{
  "mutation": {
    "operation": "create",
    "target": "task",
    "data": {
      "name": "Review quarterly goals",
      "project": "Planning",
      "tags": ["work", "review"],
      "dueDate": "2025-01-15 17:00",
      "deferDate": "2025-01-10 08:00",
      "estimatedMinutes": 60
    }
  }
}
```

**Example - Update task (move to inbox and flag):**
```json
{
  "mutation": {
    "operation": "update",
    "target": "task",
    "id": "task-id-here",
    "changes": {
      "project": null,
      "flagged": true,
      "addTags": ["urgent"]
    }
  }
}
```

**Example - Batch create:**
```json
{
  "mutation": {
    "operation": "batch",
    "operations": [
      {
        "operation": "create",
        "target": "task",
        "data": {"name": "Task 1", "tags": ["work"]}
      },
      {
        "operation": "create",
        "target": "task",
        "data": {"name": "Task 2", "tags": ["work"]}
      }
    ]
  }
}
```

**Description (for LLM):**
```
Create, update, complete, or delete OmniFocus tasks and projects.

OPERATIONS:
- create: New task/project with data
- update: Modify existing (provide id + changes)
- complete: Mark done (provide id)
- delete: Remove permanently (provide id)
- batch: Multiple operations in one call

TAG OPERATIONS:
- tags: [...] - Replace all tags
- addTags: [...] - Add to existing tags
- removeTags: [...] - Remove from existing tags

DATE FORMATS:
- Date only: "YYYY-MM-DD" (defaults: due=5pm, defer=8am)
- Date+time: "YYYY-MM-DD HH:mm" (local time)
- Clear date: null

MOVE TO INBOX:
- Set project: null or "" or "null"

REPETITION:
- frequency: daily/weekly/monthly/yearly
- interval: 1, 2, 3, ... (every N days/weeks/months/years)
- daysOfWeek: [1,3,5] for Mon/Wed/Fri (1=Mon, 7=Sun)

SAFETY:
- Delete is permanent - confirm with user first
- Batch supports up to 100 operations
- Tags require bridge for persistence (handled automatically)

EXAMPLES: [include 8-12 common examples]
```

**Estimated size:** ~1,800-2,500 tokens

---

### Tool 3: omnifocus_analyze

**Purpose:** Analysis and specialized operations

**Schema:**
```typescript
{
  analysis: {
    type: "productivity_stats" | "task_velocity" | "overdue_analysis" |
          "pattern_analysis" | "workflow_analysis" | "recurring_tasks" |
          "parse_meeting_notes" | "manage_reviews",

    // Common parameters
    scope?: {
      dateRange?: {
        start: string,         // "YYYY-MM-DD"
        end: string
      },
      tags?: string[],         // Filter by tags
      projects?: string[],     // Filter by projects
      includeCompleted?: boolean,
      includeDropped?: boolean
    },

    // Type-specific parameters
    params?: {
      // productivity_stats
      period?: "day" | "week" | "month",
      metrics?: string[],

      // task_velocity
      groupBy?: "day" | "week" | "month",

      // pattern_analysis
      insights?: string[],

      // recurring_tasks
      operation?: "analyze" | "patterns",
      sortBy?: "nextDue" | "frequency" | "name",

      // parse_meeting_notes
      text?: string,
      extractTasks?: boolean,
      defaultProject?: string,

      // manage_reviews
      operation?: "list" | "update",
      projectId?: string,
      reviewDate?: string
    }
  }
}
```

**Example - Productivity stats:**
```json
{
  "analysis": {
    "type": "productivity_stats",
    "scope": {
      "dateRange": {
        "start": "2025-01-01",
        "end": "2025-01-31"
      }
    },
    "params": {
      "groupBy": "week",
      "metrics": ["completed", "created", "velocity"]
    }
  }
}
```

**Example - Parse meeting notes:**
```json
{
  "analysis": {
    "type": "parse_meeting_notes",
    "params": {
      "text": "Action items:\n- Follow up with Sarah about Q1 goals\n- Review budget proposal by Friday\n- Schedule team sync for next week",
      "extractTasks": true,
      "defaultProject": "Meetings",
      "defaultTags": ["action-item"]
    }
  }
}
```

**Description (for LLM):**
```
Analyze OmniFocus data for insights, patterns, and specialized operations.

ANALYSIS TYPES:
- productivity_stats: GTD health metrics (completion rates, velocity, trends)
- task_velocity: Completion trends over time
- overdue_analysis: Bottleneck identification
- pattern_analysis: Database-wide patterns (common tags, project distribution, stale items)
- workflow_analysis: Deep workflow analysis
- recurring_tasks: Analyze recurring task patterns and frequencies
- parse_meeting_notes: Extract action items from meeting notes
- manage_reviews: Project review operations

PERFORMANCE WARNINGS:
- pattern_analysis on 1000+ items: ~5-10 seconds
- workflow_analysis: ~3-5 seconds for comprehensive analysis
- recurring_tasks: Fast (<1 second) for most databases
- productivity_stats: Cached after first run, very fast

SCOPE FILTERING:
- Use dateRange for time-based analysis
- Use tags/projects to focus analysis
- includeCompleted/includeDropped for historical analysis

RECURRING TASKS:
- operation="analyze": Detailed task-by-task breakdown with next due dates
- operation="patterns": Frequency statistics (how many daily/weekly/monthly tasks)

MEETING NOTES:
- Extracts tasks from natural language
- Supports markdown/plain text
- Returns structured task data ready for batch creation

EXAMPLES: [include 6-8 common examples]
```

**Estimated size:** ~2,500-3,500 tokens

---

### Tool 4: system (unchanged)

Keep existing system tool as-is (~256 tokens) for version info and diagnostics.

---

## Backend Implementation Strategy

### Key Principle: Maximum Reuse

**The builder API is a translation layer, not a rewrite.** All existing infrastructure is reused:

```
┌─────────────────────────────────────┐
│  omnifocus_read/write/analyze       │
│  (Zod schema validation)            │
└──────────────┬──────────────────────┘
               │ Builder JSON
               ▼
┌─────────────────────────────────────┐
│  Query/Mutation/Analysis Compiler   │
│  • Maps builder → existing scripts  │
│  • Applies optimizations            │
│  • Routes to cache strategies       │
└──────────────┬──────────────────────┘
               │
     ┌─────────┼──────────┐
     ▼         ▼          ▼
┌─────────┐ ┌──────┐ ┌─────────┐
│ Tasks   │ │ Proj │ │ Tags    │
│ Scripts │ │ Scr. │ │ Scripts │
└─────────┘ └──────┘ └─────────┘
     │         │          │
     └─────────┼──────────┘
               │ Existing JXA/OmniJS
               ▼
┌─────────────────────────────────────┐
│  OmniFocus.app                       │
└─────────────────────────────────────┘
```

### Compiler Examples

**Example 1: Simple inbox query**

**Input:**
```json
{
  "query": {
    "type": "tasks",
    "filters": { "project": null, "status": "active" },
    "limit": 25
  }
}
```

**Compiler logic:**
```typescript
// Recognize pattern: inbox query
// Route to: existing INBOX mode handler
// Cache key: "tasks_inbox_25"
// Script: LIST_TASKS_SCRIPT with inbox filter
```

**Example 2: Smart suggest**

**Input:**
```json
{
  "query": {
    "type": "tasks",
    "mode": "smart_suggest",
    "limit": 10
  }
}
```

**Compiler logic:**
```typescript
// Recognize: smart_suggest mode
// Route to: existing handleSmartSuggest()
// Cache key: "tasks_smart_suggest_10_no-tags"
// Uses existing scoring algorithm
```

**Example 3: Create task with tags**

**Input:**
```json
{
  "mutation": {
    "operation": "create",
    "target": "task",
    "data": {
      "name": "Review docs",
      "tags": ["work", "review"],
      "dueDate": "2025-01-15"
    }
  }
}
```

**Compiler logic:**
```typescript
// Map to: CREATE_TASK_SCRIPT
// Include: getMinimalTagBridge() (already exists)
// Auto-apply: bridgeSetTags() after creation
// Return: V2 response format
```

### Implementation Files

**New files to create:**
```
src/tools/unified/
├── OmniFocusReadTool.ts          (~300 lines - routing logic)
├── OmniFocusWriteTool.ts         (~250 lines - mutation routing)
├── OmniFocusAnalyzeTool.ts       (~200 lines - analysis routing)
├── compilers/
│   ├── QueryCompiler.ts          (~400 lines - filter → script mapping)
│   ├── MutationCompiler.ts       (~300 lines - mutation → script mapping)
│   └── AnalysisCompiler.ts       (~250 lines - analysis → script mapping)
└── schemas/
    ├── read-schema.ts            (~150 lines - Zod schemas)
    ├── write-schema.ts           (~150 lines - Zod schemas)
    └── analyze-schema.ts         (~150 lines - Zod schemas)
```

**Total new code:** ~2,150 lines (mostly routing/translation logic)

**Reused code:** All existing scripts, helpers, cache logic (~15,000+ lines)

---

## Migration Path

### Phase 1: Parallel Implementation (Week 1-2)

**Goal:** Add 3 new tools alongside existing 17 tools

**Tasks:**
1. Create new tool classes (OmniFocusReadTool, OmniFocusWriteTool, OmniFocusAnalyzeTool)
2. Implement compilers (query, mutation, analysis)
3. Define Zod schemas for builder API
4. Wire up to existing backend scripts
5. Add comprehensive tests
6. Deploy parallel to production

**Success criteria:**
- All 3 new tools functional
- Pass existing integration test suite
- Performance matches or beats current tools

### Phase 2: Validation & Documentation (Week 3)

**Goal:** Verify feature parity and create migration docs

**Tasks:**
1. Test matrix: every current tool operation → new tool equivalent
2. Performance benchmarking
3. Write migration guide with examples
4. Add deprecation warnings to old tools:
   ```json
   {
     "success": true,
     "data": { /* ... */ },
     "_migration": {
       "deprecated": true,
       "replacement": "omnifocus_read",
       "example": { "query": { "type": "tasks", "filters": { /* ... */ } } }
     }
   }
   ```
5. Update CLAUDE.md with new tool descriptions
6. Real-world usage testing with Claude Desktop

**Success criteria:**
- 100% feature parity verified
- Migration docs complete
- No performance regressions
- Positive feedback from testing

### Phase 3: Cleanup (Week 4+)

**Goal:** Remove deprecated tools, finalize

**Tasks:**
1. Monitor usage of old vs new tools
2. Once new tools proven stable:
   - Remove old 17 tools from src/tools/
   - Archive implementations to `.archive/` directory
   - Update all documentation to reflect new tools only
3. Final performance optimization pass
4. Celebrate reduced maintenance burden!

**Success criteria:**
- Codebase reduced by ~5,000-8,000 lines
- Tool definitions reduced to ~7,000-9,000 tokens
- Simpler mental model for LLM users
- Easier to maintain going forward

---

## Expected Outcomes

### Token Savings (Conservative Estimates)

**Current:** 9,220 tokens (17 tools)

**Projected:**
- **omnifocus_read:** ~2,500-3,500 tokens
- **omnifocus_write:** ~1,800-2,500 tokens
- **omnifocus_analyze:** ~2,500-3,500 tokens
- **system:** ~256 tokens (unchanged)
- **Total:** ~7,056-9,756 tokens

**Savings:** 0-23% reduction (worst case: no savings, realistic: ~15% reduction)

### Qualitative Benefits

1. **Simpler Tool Selection**
   - 3 clear choices vs 17 options
   - Obvious mapping: need data? → read, change data? → write, analyze? → analyze

2. **More Flexible Queries**
   - LLMs can compose complex filters
   - No need for predefined "modes" for every use case
   - OR/AND/NOT logic for advanced queries

3. **Easier Maintenance**
   - Single schema per operation type
   - Pattern improvements apply across all operations
   - Fewer test paths to maintain

4. **Better Extensibility**
   - New analysis types: just add to omnifocus_analyze enum
   - New filter operators: extend filter schema
   - No new tools to register/document

### Risks & Mitigations

**Risk 1: Increased per-tool complexity**
- Mitigation: Comprehensive examples in descriptions
- Mitigation: Clear error messages with suggestions
- Mitigation: Keep high-frequency operations simple

**Risk 2: LLM confusion with builder syntax**
- Mitigation: Test extensively with Claude Desktop
- Mitigation: Provide migration examples from old→new
- Mitigation: Schema validation catches mistakes early

**Risk 3: Performance regression**
- Mitigation: Reuse existing optimized scripts
- Mitigation: Benchmark before/after
- Mitigation: Same caching strategies

---

## Implementation Guidance

### Quick Start

1. **Start with omnifocus_read**
   - Most complex tool, highest impact
   - Test query compilation thoroughly
   - Ensure filter syntax works with LLMs

2. **Add omnifocus_write**
   - Simpler than read (fewer modes)
   - Critical to get tag bridge right
   - Test batch operations

3. **Finish with omnifocus_analyze**
   - Can absorb complexity
   - Low-frequency usage
   - Straightforward routing to existing tools

### Testing Strategy

**Unit tests:**
- Query compiler: filter translation
- Mutation compiler: operation routing
- Schema validation: Zod schemas

**Integration tests:**
- Every current tool operation has equivalent new tool call
- Performance benchmarks (should match current)
- Cache behavior (should be identical)

**Real-world testing:**
- Use with Claude Desktop for 1-2 weeks
- Monitor error rates
- Gather feedback on usability

### Success Metrics

**Quantitative:**
- [ ] All 17 current operations work via new tools
- [ ] Performance within 10% of current tools
- [ ] Token count: 7,000-9,000 tokens
- [ ] Test coverage: >90%

**Qualitative:**
- [ ] LLM successfully uses new tools without confusion
- [ ] Error messages help LLM recover from mistakes
- [ ] Maintenance burden reduced (fewer files to update)
- [ ] Easier to add new features

---

## Open Questions for Implementation

1. **Filter syntax edge cases:**
   - How to handle null vs undefined vs missing fields?
   - Should empty array in tags.any match tasks with no tags?
   - Date range validation: what if start > end?

2. **Error handling specifics:**
   - How verbose should error messages be?
   - Should we suggest corrections for common typos?
   - Partial failure in batch operations: all-or-nothing vs best-effort?

3. **Caching strategy:**
   - Same cache keys as current tools?
   - New cache invalidation logic?
   - Cache builder JSON or compiled script?

4. **Backward compatibility:**
   - How long to maintain old tools during migration?
   - Should old tools be "aliases" that just call new tools?
   - Migration warnings in every response or once per session?

---

## Conclusion

The three-tool builder API design reduces complexity while maintaining full functionality. By consolidating 17 tools into 3 well-structured tools with a builder pattern, we achieve:

- **Simpler for LLMs** (3 clear choices vs 17 options)
- **Easier to maintain** (single schema per operation type)
- **More flexible** (LLMs compose queries vs predefined modes)
- **Minimal risk** (reuses all existing infrastructure)

**Next Steps:**
1. Implement Phase 1 (parallel rollout)
2. Test extensively with Claude Desktop
3. Gather feedback and iterate
4. Proceed to cleanup once proven

This design is ready for implementation.
