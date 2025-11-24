# OmniFocus DSL Design Document

**Status:** ~~Exploratory Design~~ → **Partially Implemented (v3.0.0)**
**Date:** 2025-01-04
**Updated:** 2025-11-24
**Purpose:** Define a custom Domain-Specific Language for OmniFocus operations that can serve multiple use cases including MCP servers, CLI tools, web APIs, and automation workflows.

---

## Implementation Status (November 2025)

> **This design was incrementally implemented through v3.0.0's Unified API, though the path differed from the original plan.**

### What Was Built

| DSL Design Goal | Implementation | Status |
|-----------------|----------------|--------|
| Replace 17 tools with 1-3 | Unified API: `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system` | ✅ Shipped v3.0.0 |
| JSON-based query syntax | `{ query: { type: "tasks", filters: {...} } }` | ✅ Exact syntax implemented |
| JSON-based mutations | `{ mutation: { operation: "create", target: "task", data: {...} } }` | ✅ Implemented |
| JSON-based analysis | `{ analysis: { type: "productivity_stats", params: {...} } }` | ✅ Implemented |
| QueryCompiler | Routes unified API to backend tools | ✅ Implemented |
| MutationCompiler | Routes mutations to manage_task/batch_create | ✅ Implemented |
| AnalysisCompiler | Routes to 8 analysis tools | ✅ Implemented |

### Key Difference: Routing vs. Generation

**Original Design:** Compilers would generate JXA/OmniJS scripts from scratch.

**Actual Implementation:** Compilers route to existing backend tools (maximum code reuse, faster delivery, proven reliability).

```
Design assumed:    DSL → Compiler → Generated JXA → OmniFocus
Actually built:    DSL → Compiler → Existing Tools → Existing Scripts → OmniFocus
```

This was pragmatic - we got 90% of the benefits with 30% of the effort.

### Gap Discovered: Internal Type Safety

After shipping v3.0.0, we found 15+ bugs sharing a common pattern: **property name mismatches between layers**.

Example: API sends `status: 'completed'`, script checks `filter.completed === true`.

**Solution:** Shared Contracts System (November 2025)
- `src/contracts/filters.ts` - TaskFilter as single source of truth
- `src/contracts/responses.ts` - Response structure contracts
- `src/contracts/generator.ts` - OmniJS code generator (for future migration)
- QueryCompiler now transforms `FilterValue` → `TaskFilter`

See: `docs/plans/2025-11-24-querycompiler-taskfilter-integration.md`

### Remaining from Original Design

| Feature | Status | Priority |
|---------|--------|----------|
| Text syntax layer (human-friendly) | Not started | Low - JSON works well for LLMs |
| REPL/CLI tool | Not started | Medium |
| Query optimization engine | Partial (countOnly, fastSearch) | Low |
| Transaction support | Not started | Low |
| Dry-run mode for bulk ops | Not started | Medium |

### Lessons Learned

1. **Incremental beats big-bang.** Building routing layer on existing tools was faster and safer than rewriting everything.

2. **External API ≠ internal consistency.** The DSL design focused on what users see but missed internal type safety. We added contracts to fix this.

3. **JSON is fine for LLMs.** The "human-friendly text syntax" (Phase 2 in original design) hasn't been needed - LLMs handle JSON well.

4. **The 17→4 tool reduction worked.** LLMs find the unified API easier to use than remembering 17 tool names.

---

## Original Design (January 2025)

*The following sections represent the original exploratory design. See above for what was actually implemented.*

---

## Executive Summary

This document proposes a custom DSL (Domain-Specific Language) for OmniFocus that provides a higher-level, more maintainable abstraction over JXA/OmniJS scripting. While initially motivated by reducing API surface area in an MCP server, a well-designed DSL has broader applications across the OmniFocus automation ecosystem.

**Key Benefits:**
- **Simplified LLM Integration:** Cleaner syntax for AI assistants to learn and generate
- **Context Window Efficiency:** Compact language reduces token consumption
- **Type Safety:** Built-in validation prevents malformed operations
- **Cross-Platform Potential:** Abstract layer could support multiple OmniFocus APIs
- **Reusability:** Same DSL usable in MCP servers, CLI tools, web APIs, automation scripts

---

## Problem Statement

### Current State Challenges

1. **JXA/OmniJS Complexity**
   - Steep learning curve (bridge patterns, tag operations, timing issues)
   - Requires extensive documentation to use correctly
   - Error-prone for both humans and LLMs
   - Architecture documentation alone is 800+ lines

2. **MCP Server API Bloat**
   - 17+ specialized tool implementations
   - Each tool requires schema definition, documentation, maintenance
   - High cognitive load for users to understand available operations
   - Significant context window consumption

3. **Maintenance Burden**
   - Changes to OmniFocus API require updates across multiple tools
   - Pattern improvements need propagation to all implementations
   - Testing requires coverage of 17+ different code paths

### Motivating Use Cases

**Primary: MCP Server Simplification**
- Replace 17 tools with 1-3 tools (download_raw_data, execute_dsl, take_gated_actions)
- LLM learns DSL syntax (compact) instead of 17 tool schemas (verbose)
- Server focuses on auth, security boundaries, execution - not business logic

**Secondary: Standalone DSL Interpreter**
- CLI tool for OmniFocus automation without MCP overhead
- Web API endpoint that accepts DSL queries
- Scriptable automation workflows
- Testing and validation tool for OmniFocus data

**Tertiary: Cross-Platform Abstraction**
- Abstract layer over JXA (current) and potential future APIs
- Could support OmniFocus Web when available
- Portable between Mac automation and server environments

---

## Design Goals

### Must Have
1. **Expressiveness:** Support common OmniFocus operations (query, create, update, delete)
2. **Safety:** Prevent destructive operations without explicit confirmation
3. **Clarity:** Self-documenting syntax that humans and LLMs can read
4. **Efficiency:** Compact representation to minimize token usage
5. **Type Safety:** Validate operations before execution

### Should Have
6. **Composability:** Combine operations into workflows
7. **Extensibility:** Easy to add new operations
8. **Error Handling:** Clear error messages with recovery suggestions
9. **Performance:** Generate efficient JXA/OmniJS backend code
10. **Testability:** DSL operations should be easily unit-testable

### Nice to Have
11. **REPL/Interactive Mode:** Explore OmniFocus data interactively
12. **Query Optimization:** Automatically apply performance patterns
13. **Dry-Run Mode:** Preview operations before execution
14. **Transaction Support:** Multi-operation atomicity

---

## DSL Design Approaches

### Option 1: Declarative Query Language (SQL-like)

**Example Syntax:**
```sql
-- Read operations
SELECT id, name, tags, dueDate
FROM tasks
WHERE status = 'active'
  AND tag IN ('work', 'urgent')
  AND dueDate < NOW() + 7 DAYS
ORDER BY dueDate ASC
LIMIT 50;

-- Write operations
CREATE TASK
  name: "Review quarterly goals"
  project: "Planning"
  tags: ["work", "review"]
  dueDate: "2025-01-15 17:00"
  deferDate: "2025-01-10 08:00";

-- Update operations
UPDATE tasks
SET status = 'completed',
    completionDate = NOW()
WHERE tag = 'quick-wins'
  AND completed = false;
```

**Pros:**
- Familiar to developers
- Clear read vs. write separation
- Natural for data querying
- Many existing parsers/tools

**Cons:**
- SQL syntax can be verbose
- Doesn't naturally express hierarchical data (projects/folders)
- May feel awkward for object creation
- Limited support for complex workflows

---

### Option 2: JSON-Based Declarative (Configuration-style)

**Example Syntax:**
```json
{
  "query": {
    "type": "tasks",
    "filters": {
      "status": "active",
      "tags": {"any": ["work", "urgent"]},
      "dueDate": {"before": {"days": 7, "from": "now"}}
    },
    "fields": ["id", "name", "tags", "dueDate"],
    "sort": [{"field": "dueDate", "order": "asc"}],
    "limit": 50
  }
}

{
  "create": {
    "type": "task",
    "data": {
      "name": "Review quarterly goals",
      "project": "Planning",
      "tags": ["work", "review"],
      "dueDate": "2025-01-15 17:00",
      "deferDate": "2025-01-10 08:00"
    }
  }
}

{
  "update": {
    "type": "tasks",
    "filters": {
      "tags": {"any": ["quick-wins"]},
      "completed": false
    },
    "changes": {
      "status": "completed",
      "completionDate": "now"
    }
  }
}
```

**Pros:**
- Native to JavaScript/TypeScript ecosystem
- Type-safe with JSON Schema or Zod
- Easy for LLMs to generate
- Hierarchical structure matches data model
- No parser needed (built-in JSON parsing)

**Cons:**
- More verbose than custom syntax
- Harder for humans to read/write
- Nesting can get deep
- No syntax highlighting support

---

### Option 3: Custom Text-Based DSL (Purpose-Built)

**Example Syntax:**
```
# Read operations
query tasks where:
  status: active
  tags: any(work, urgent)
  dueDate: before(now + 7 days)
select: id, name, tags, dueDate
order by: dueDate asc
limit: 50

# Write operations
create task:
  name: "Review quarterly goals"
  project: "Planning"
  tags: [work, review]
  due: 2025-01-15 17:00
  defer: 2025-01-10 08:00

# Bulk operations
update tasks where:
  tags: any(quick-wins)
  completed: false
set:
  status: completed
  completionDate: now
```

**Pros:**
- Clean, minimal syntax
- Purpose-built for OmniFocus domain
- Human-readable and writable
- Optimal for LLM token usage
- Can include comments/documentation

**Cons:**
- Requires custom parser implementation
- Tooling needs to be built from scratch
- Syntax must be taught (not familiar)
- Error messages need careful design
- IDE support requires extensions

---

### Option 4: Embedded DSL in TypeScript/JavaScript

**Example Syntax:**
```typescript
// Fluent API style
const results = await of()
  .tasks()
  .where(t => t.status === 'active')
  .and(t => t.tags.includes('work') || t.tags.includes('urgent'))
  .and(t => t.dueDate < addDays(new Date(), 7))
  .select(['id', 'name', 'tags', 'dueDate'])
  .orderBy('dueDate', 'asc')
  .limit(50)
  .execute();

// Builder pattern
const newTask = of()
  .createTask()
  .name("Review quarterly goals")
  .project("Planning")
  .tags(['work', 'review'])
  .dueDate('2025-01-15 17:00')
  .deferDate('2025-01-10 08:00')
  .save();

// Bulk operations
await of()
  .tasks()
  .where(t => t.tags.includes('quick-wins'))
  .where(t => !t.completed)
  .update({
    status: 'completed',
    completionDate: new Date()
  });
```

**Pros:**
- Type-safe with TypeScript
- IDE autocomplete and validation
- Familiar to developers
- Reuses JavaScript ecosystem
- No parser needed

**Cons:**
- Not truly a separate DSL
- Verbose for simple operations
- May not save much context vs. current tools
- Requires JavaScript runtime
- Not easily serializable for MCP transport

---

## Recommended Approach: Hybrid JSON + Text DSL

**Rationale:** Start with JSON for MVP (fast iteration, type safety, no parser), provide optional text syntax later.

### Phase 1: JSON-Based DSL (MVP)
- Define JSON schema for all operations
- Implement interpreter that generates JXA/OmniJS
- Validate with Zod schemas
- Support in MCP server via `execute_dsl(json)` tool

### Phase 2: Text Syntax Layer (Enhancement)
- Design human-friendly text syntax
- Build parser that converts text → JSON
- Add REPL/CLI tool for interactive use
- Provide syntax highlighting extensions

### Phase 3: Advanced Features
- Query optimization
- Transaction support
- Workflow composition
- Performance profiling

---

## Core DSL Operations

### Query Operations

**Task Queries**
```json
{
  "query": {
    "type": "tasks",
    "filters": {
      "status": "active" | "completed" | "dropped" | "any",
      "tags": {
        "all": ["tag1", "tag2"],      // Has all these tags
        "any": ["tag1", "tag2"],      // Has any of these tags
        "none": ["tag1", "tag2"]      // Has none of these tags
      },
      "project": "Project Name" | null | {"pattern": "regex"},
      "folder": "Folder Name",
      "dueDate": {
        "before": "2025-01-15" | {"days": 7, "from": "now"},
        "after": "2025-01-01",
        "between": ["2025-01-01", "2025-01-31"]
      },
      "deferDate": { /* same as dueDate */ },
      "completionDate": { /* same as dueDate */ },
      "flagged": true | false,
      "repeating": true | false,
      "text": {"contains": "keyword", "matches": "regex"}
    },
    "fields": ["id", "name", "tags", "dueDate", "project", "status"],
    "sort": [
      {"field": "dueDate", "order": "asc" | "desc"},
      {"field": "name", "order": "asc"}
    ],
    "limit": 50,
    "offset": 0
  }
}
```

**Project Queries**
```json
{
  "query": {
    "type": "projects",
    "filters": {
      "status": "active" | "completed" | "dropped" | "on_hold",
      "folder": "Folder Name",
      "tags": { /* same as tasks */ },
      "text": { /* same as tasks */ }
    },
    "fields": ["id", "name", "status", "folder", "taskCount"],
    "includeCompleted": false
  }
}
```

**Tag Queries**
```json
{
  "query": {
    "type": "tags",
    "filters": {
      "text": {"contains": "work"},
      "active": true  // Only tags with active tasks
    },
    "fields": ["id", "name", "available", "remainingTaskCount"]
  }
}
```

**Perspective Queries**
```json
{
  "query": {
    "type": "perspective",
    "name": "Forecast" | "Inbox" | "Flagged" | "Review" | "Custom Name",
    "fields": ["id", "name", "tags", "dueDate"]
  }
}
```

---

### Create Operations

**Create Task**
```json
{
  "create": {
    "type": "task",
    "data": {
      "name": "Task name (required)",
      "note": "Optional note with **markdown**",
      "project": "Project name or null for inbox",
      "tags": ["tag1", "tag2"],
      "dueDate": "2025-01-15 17:00" | "2025-01-15" | null,
      "deferDate": "2025-01-10 08:00" | null,
      "flagged": true | false,
      "estimatedMinutes": 60 | null,
      "repetitionRule": {
        "frequency": "daily" | "weekly" | "monthly" | "yearly",
        "interval": 1,
        "daysOfWeek": [1, 3, 5],  // Mon, Wed, Fri (1-7)
        "endDate": "2025-12-31" | null
      }
    }
  }
}
```

**Create Project**
```json
{
  "create": {
    "type": "project",
    "data": {
      "name": "Project name (required)",
      "note": "Optional note",
      "folder": "Folder name or null",
      "status": "active" | "on_hold" | "completed" | "dropped",
      "tags": ["tag1", "tag2"],
      "sequential": true | false,
      "dueDate": "2025-01-31" | null
    }
  }
}
```

**Batch Create**
```json
{
  "batch": {
    "create": [
      {"type": "task", "data": { /* task 1 */ }},
      {"type": "task", "data": { /* task 2 */ }},
      {"type": "project", "data": { /* project */ }}
    ]
  }
}
```

---

### Update Operations

**Update Task**
```json
{
  "update": {
    "type": "task",
    "id": "task-id-here",
    "changes": {
      "name": "New name",
      "tags": ["new", "tags"],  // Replaces all tags
      "addTags": ["additional"],  // Adds to existing
      "removeTags": ["old"],  // Removes from existing
      "dueDate": "2025-01-20",
      "status": "completed",
      "project": "New Project" | null
    }
  }
}
```

**Bulk Update**
```json
{
  "update": {
    "type": "tasks",
    "filters": {
      "tags": {"any": ["review"]},
      "dueDate": {"before": "now"}
    },
    "changes": {
      "addTags": ["overdue"],
      "flagged": true
    },
    "limit": 100,  // Safety limit for bulk operations
    "dryRun": false  // Preview before executing
  }
}
```

---

### Delete/Complete Operations

**Complete Task**
```json
{
  "complete": {
    "type": "task",
    "id": "task-id-here",
    "completionDate": "now" | "2025-01-04 14:30"
  }
}
```

**Drop Task/Project**
```json
{
  "drop": {
    "type": "task" | "project",
    "id": "id-here"
  }
}
```

**Delete (Destructive)**
```json
{
  "delete": {
    "type": "task" | "project",
    "id": "id-here",
    "confirm": true  // Required for safety
  }
}
```

---

### Analysis Operations

**Productivity Stats**
```json
{
  "analyze": {
    "type": "productivity",
    "period": {
      "start": "2025-01-01",
      "end": "2025-01-31"
    },
    "groupBy": "day" | "week" | "month",
    "metrics": ["completed", "created", "velocity", "overdueRate"]
  }
}
```

**Pattern Analysis**
```json
{
  "analyze": {
    "type": "patterns",
    "scope": "tasks" | "projects",
    "insights": ["commonTags", "projectDistribution", "timePatterns", "staleItems"]
  }
}
```

---

## Implementation Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────┐
│                   MCP Server / CLI                   │
│  (Handles auth, security, user interaction)          │
└─────────────────┬───────────────────────────────────┘
                  │ JSON DSL
                  ▼
┌─────────────────────────────────────────────────────┐
│              DSL Interpreter Core                    │
│  • JSON Schema Validation (Zod)                      │
│  • Operation Type Routing                            │
│  • Error Handling & Recovery                         │
└─────────────────┬───────────────────────────────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Query   │ │ Create/  │ │ Analysis │
│ Compiler │ │ Update   │ │ Engine   │
│          │ │ Compiler │ │          │
└────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  │ JXA/OmniJS Scripts
                  ▼
┌─────────────────────────────────────────────────────┐
│           JXA/OmniJS Execution Layer                 │
│  • Script Generation (reuse existing patterns)       │
│  • Bridge Helper Integration                         │
│  • Performance Optimization                          │
└─────────────────┬───────────────────────────────────┘
                  │ osascript
                  ▼
┌─────────────────────────────────────────────────────┐
│                  OmniFocus.app                       │
└─────────────────────────────────────────────────────┘
```

### Key Components

**1. DSL Validator (`src/dsl/validator.ts`)**
- Zod schemas for all operation types
- Type-safe parsing and validation
- Clear error messages with suggestions

**2. Query Compiler (`src/dsl/compilers/query.ts`)**
- Converts DSL filters to JXA filter logic
- Applies performance optimizations automatically
- Generates efficient bridge scripts when needed
- Reuses existing helper functions

**3. Mutation Compiler (`src/dsl/compilers/mutation.ts`)**
- Handles create/update/delete operations
- Generates tag bridge scripts automatically
- Enforces safety constraints
- Batch operation support

**4. Analysis Engine (`src/dsl/compilers/analysis.ts`)**
- Specialized for productivity/pattern analysis
- Uses bridge for bulk property access
- Caches results appropriately

**5. Execution Engine (`src/dsl/executor.ts`)**
- Runs generated JXA/OmniJS scripts via osascript
- Handles async operations with pending tracking
- Error recovery and retry logic
- Result formatting and type coercion

---

## Security & Safety Considerations

### Safety Tiers

**Tier 1: Read-Only Operations (Unrestricted)**
- Queries for tasks, projects, tags, perspectives
- Analysis operations
- No confirmation required

**Tier 2: Safe Write Operations (Auto-Approved)**
- Create new tasks/projects
- Update task properties (name, due date, tags)
- Complete/defer individual tasks
- Low risk, reversible operations

**Tier 3: Bulk Operations (Confirmation Required)**
- Bulk updates affecting >10 items
- Bulk complete/drop operations
- Requires explicit user confirmation
- Dry-run mode mandatory preview

**Tier 4: Destructive Operations (Gated)**
- Delete (permanent removal)
- Drop projects (affects multiple tasks)
- Requires separate `take_sensitive_gated_actions()` tool
- Extra confirmation step

### Validation Rules

1. **Operation Limits**
   - Bulk operations: max 1000 items per operation
   - Query results: configurable limit (default 500)
   - Rate limiting: prevent runaway scripts

2. **Field Validation**
   - Dates must be valid format
   - Tags must exist or be creatable
   - Projects must exist for task assignment
   - Required fields enforced

3. **Type Safety**
   - All fields type-checked via Zod
   - Automatic coercion where appropriate
   - Clear error messages for type mismatches

---

## Migration Path from Current MCP Server

### Phase 1: Parallel Implementation (Week 1-2)
1. Add new `execute_dsl` tool alongside existing 17 tools
2. Implement core DSL interpreter for query operations
3. Test DSL queries against current tool outputs
4. Document DSL syntax in MCP tool description

### Phase 2: Feature Parity (Week 3-4)
1. Implement create/update/delete operations
2. Add analysis operations
3. Achieve functional parity with existing tools
4. Performance testing and optimization

### Phase 3: Migration Guidance (Week 5)
1. Create migration guide for existing users
2. Add deprecation notices to old tools
3. Provide examples mapping old → new syntax
4. Monitor usage patterns

### Phase 4: Sunset Old Tools (Week 6+)
1. Remove deprecated tools from MCP server
2. Update documentation to DSL-first approach
3. Archive old tool implementations
4. Celebrate reduced maintenance burden

---

## Success Metrics

### Technical Metrics
- **Context Window Savings:** Measure token reduction in tool definitions
- **Response Time:** DSL execution should match or beat current tools
- **Error Rate:** DSL validation should catch errors before execution
- **Code Coverage:** Comprehensive test suite for DSL operations

### User Experience Metrics
- **Learning Curve:** Time for new users to perform common operations
- **Task Success Rate:** Percentage of DSL operations that succeed first try
- **Query Expressiveness:** Can users express complex queries easily?
- **Error Message Quality:** How quickly do users recover from errors?

### Maintenance Metrics
- **Lines of Code:** Reduction in total codebase size
- **Test Maintenance:** Reduction in test code to maintain
- **Documentation Burden:** Reduction in documentation required
- **Bug Resolution Time:** Faster fixes due to centralized logic

---

## Open Questions for Exploration

1. **Syntax Design**
   - Should we prioritize human readability or LLM token efficiency?
   - Is JSON verbose enough to warrant custom text syntax?
   - How do we handle complex nested queries elegantly?

2. **Performance**
   - When should DSL automatically use bridge vs. inline JXA?
   - Can we detect bulk operations and optimize automatically?
   - Should we cache compiled scripts or generate fresh each time?

3. **Extensibility**
   - How do users add custom operations?
   - Should DSL support plugins or extensions?
   - Can we version the DSL as it evolves?

4. **Error Handling**
   - What level of detail in error messages?
   - Should DSL suggest corrections for common mistakes?
   - How do we handle partial failures in batch operations?

5. **Tooling**
   - Do we need a DSL playground/REPL?
   - Should we provide a web-based query builder?
   - VSCode extension for syntax highlighting?

6. **Interoperability**
   - Should DSL be serializable to/from other formats?
   - Could DSL export to JXA for manual customization?
   - Integration with Shortcuts.app on macOS?

---

## Next Steps for Implementation

### Immediate (Week 1)
1. **Spike: Proof of Concept**
   - Implement basic query DSL in JSON
   - Build simple interpreter that generates JXA
   - Test with 3-5 common query patterns
   - Measure context window savings

2. **Validation**
   - Define Zod schemas for core operations
   - Test validation error messages with LLM
   - Ensure type safety end-to-end

### Short Term (Weeks 2-4)
3. **Core Implementation**
   - Query compiler with filter support
   - Create/update operations
   - Tag bridge integration
   - Error handling framework

4. **Testing & Documentation**
   - Comprehensive test suite
   - DSL reference documentation
   - Migration guide from current tools
   - Example gallery

### Medium Term (Months 2-3)
5. **Advanced Features**
   - Analysis operations
   - Bulk operations with safety gates
   - Query optimization engine
   - Performance profiling

6. **Tooling**
   - CLI tool for interactive use
   - Optional text syntax parser
   - Syntax highlighting extensions

### Long Term (Months 4+)
7. **Ecosystem Growth**
   - Community contributions
   - Plugin system
   - Web-based query builder
   - Integration with other tools

---

## Alternative Approaches Not Pursued

### GraphQL-Based API
- **Pro:** Industry standard, great tooling
- **Con:** Overkill for local MCP server, requires GraphQL server infrastructure
- **Decision:** Too heavyweight for this use case

### REST-ful API Design
- **Pro:** Familiar HTTP semantics
- **Con:** Doesn't fit MCP transport model, not optimized for LLM interaction
- **Decision:** MCP already handles transport layer

### Natural Language Interface
- **Pro:** Most intuitive for users
- **Con:** Requires NLP parsing, ambiguity, error-prone for programmatic use
- **Decision:** Let LLM handle NL→DSL translation, keep DSL precise

---

## Appendix: Example Use Cases

### Use Case 1: Daily Review
**Goal:** Get all tasks due today or overdue, grouped by project

**Current Approach (MCP):** Call `tasks` tool with filters
**DSL Approach:**
```json
{
  "query": {
    "type": "tasks",
    "filters": {
      "status": "active",
      "dueDate": {"before": {"days": 1, "from": "now"}}
    },
    "fields": ["id", "name", "project", "dueDate", "tags"],
    "sort": [{"field": "project"}, {"field": "dueDate"}]
  }
}
```

### Use Case 2: Weekly Planning
**Goal:** Create 5 tasks for next week's priorities

**Current Approach (MCP):** Call `manage_task` 5 times with create operation
**DSL Approach:**
```json
{
  "batch": {
    "create": [
      {"type": "task", "data": {"name": "Plan sprint", "tags": ["work"], "due": "2025-01-08"}},
      {"type": "task", "data": {"name": "Review PRs", "tags": ["work"], "due": "2025-01-09"}},
      {"type": "task", "data": {"name": "Team sync", "tags": ["work"], "due": "2025-01-10"}},
      {"type": "task", "data": {"name": "Write docs", "tags": ["work"], "due": "2025-01-11"}},
      {"type": "task", "data": {"name": "Deploy feature", "tags": ["work"], "due": "2025-01-12"}}
    ]
  }
}
```

### Use Case 3: Productivity Analysis
**Goal:** See completion trends for the last month

**Current Approach (MCP):** Call `productivity_stats` tool
**DSL Approach:**
```json
{
  "analyze": {
    "type": "productivity",
    "period": {"start": "2024-12-04", "end": "2025-01-04"},
    "groupBy": "day",
    "metrics": ["completed", "created", "velocity"]
  }
}
```

### Use Case 4: Bulk Cleanup
**Goal:** Mark all "someday" tasks as dropped if older than 6 months

**Current Approach (MCP):** Query with `tasks`, then loop calling `manage_task` update
**DSL Approach:**
```json
{
  "update": {
    "type": "tasks",
    "filters": {
      "tags": {"any": ["someday"]},
      "deferDate": {"before": {"days": 180, "from": "now"}},
      "status": "active"
    },
    "changes": {"status": "dropped"},
    "dryRun": true  // Preview first
  }
}
```

---

## Conclusion

A custom DSL for OmniFocus represents a significant investment but offers substantial long-term benefits:

1. **Reduced Complexity:** Single language vs. 17+ tool schemas
2. **Better LLM Integration:** Compact syntax optimized for token efficiency
3. **Broader Applicability:** CLI, web API, automation beyond just MCP
4. **Maintainability:** Centralized logic easier to update and test
5. **Type Safety:** Built-in validation prevents entire classes of errors

**Recommended path forward:** Start with JSON-based MVP for quick validation, then enhance with text syntax if adoption warrants the investment.

This design provides enough detail for another developer to begin implementation while leaving room for refinement through real-world usage and feedback.

---

## References & Resources

- **OmniFocus Automation Documentation:** https://omni-automation.com/omnifocus/
- **JXA Guide:** https://github.com/JXA-Cookbook/JXA-Cookbook
- **MCP Specification:** https://modelcontextprotocol.io/
- **Existing codebase patterns:** `/docs/dev/PATTERNS.md`, `/docs/dev/ARCHITECTURE.md`
- **Parser tools:** Consider PEG.js, Chevrotain, or ANTLR for text syntax
- **Inspiration:** GraphQL query syntax, SQL, MongoDB query language, Datalog
