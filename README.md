# OmniFocus MCP Server

A Model Context Protocol (MCP) server for OmniFocus task management automation.

## 🎉 v2.1.0 Production Release - Complete V2 Architecture!

**Major architecture milestone with comprehensive improvements:**
- ⚡ **95% performance improvements** verified and released
- 🏗️ **Complete V2 architecture migration** with type safety (41→1 unsafe calls)
- 🛠️ **Tool consolidation** from 22→15 tools (30% context reduction)
- 🔒 **MCP specification compliance** with proper stdin handling
- 📊 **706 tests passing** (100% pass rate) with comprehensive coverage
- 🏷️ **Tag hierarchy support** - Create, manage, and query nested tags
- 🎯 **Pattern analysis** - 8 built-in analysis patterns for workflow optimization
- 👁️ **Perspective queries** - Query any perspective without changing windows
- 🔄 **Full repeat rule support** - Complex recurrence patterns work perfectly
- ✅ **All user feedback addressed** - Context efficiency and tag operations

> **Personal Project Notice**: This is a hobby project I built for my own OmniFocus workflow automation. While it's MIT licensed and you're welcome to use or adapt it, please note that it's designed for my specific needs and workflows. If it happens to work for you too, that's wonderful but unexpected! No support or maintenance is guaranteed.

## ⚠️ Known Limitations

### ~~Tags Cannot Be Assigned During Task Creation~~ ✅ FIXED in v2.0.0-beta.1
**Update**: Tags can now be assigned during task creation! We've implemented a workaround using the `evaluateJavascript()` bridge that allows immediate tag assignment.

```javascript
// Now works in a single step!
const task = await create_task({ 
  name: "My Task",
  tags: ["work", "urgent"]  // ✅ Tags are assigned immediately
});
```

For technical details about how we bypassed this JXA limitation, see [JXA Limitations and Workarounds](docs/JXA-LIMITATIONS-AND-WORKAROUNDS.md).

## Features

### 🔧 **15 Consolidated Tools** (reduced from 22 for 30% context efficiency)
- **Task Management**: `tasks`, `manage_task` - Complete CRUD with advanced querying
- **Project & Folder Organization**: `projects`, `folders` - Hierarchical project management  
- **Tag Operations**: `tags` - Full hierarchy support with create/nest/reparent operations
- **GTD Analytics**: `productivity_stats`, `task_velocity`, `analyze_overdue`, `workflow_analysis` 
- **Pattern Analysis**: `analyze_patterns` - 8 built-in workflow optimization patterns
- **Data Export**: `export` - CSV, JSON, Markdown formats with filtering
- **System Tools**: `perspectives`, `system`, `manage_reviews`, `recurring_tasks`

### ⚡ **Performance & Architecture**  
- **95% performance improvements** - Queries complete in <1 second for 2000+ tasks
- **Type-safe V2 architecture** - Eliminated 40/41 unsafe `any` type usage
- **MCP specification compliance** - Proper stdin handling and graceful shutdown  
- **Smart caching system** - Automatic invalidation with TTL-based refresh
- **Summary-first responses** - Get insights before detailed data

## Quick Start

### Prerequisites
- OmniFocus 4.6+ on macOS
- Node.js 18+

### Installation
```bash
git clone https://github.com/yourusername/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

### Claude Desktop Setup
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

## 🚀 Optimizing Your AI Assistant's Performance

### Quick Setup: Add API Reference to Your Assistant

For the best experience with any AI assistant (Claude, ChatGPT, etc.), you can optionally include the compact API reference in your system prompt. This helps the AI understand all available tools without consuming much context:

1. **Copy the compact reference** from [`docs/API-REFERENCE-LLM.md`](docs/API-REFERENCE-LLM.md) (~900 tokens)
2. **Add to your system prompt** or custom instructions:
   ```
   You have access to OmniFocus MCP tools. Here's the API reference:
   [paste API-REFERENCE-LLM.md content here]
   ```

This is **completely optional** but provides:
- ✅ Faster, more accurate tool usage
- ✅ Better error recovery
- ✅ Reduced failed tool calls
- ✅ The AI knows all capabilities upfront

For ultra-minimal setups, use [`docs/API-COMPACT.md`](docs/API-COMPACT.md) (~400 tokens).

## Using MCP Prompts in Claude Desktop

This server provides five optimized prompts for GTD workflows and essential reference. To access them in Claude Desktop (v0.12.55+):

1. Click the **"+"** button (bottom-left of the input box)
2. Select **"Add from omnifocus"** from the menu
3. Choose from available prompts:
   - **GTD Workflows:**
     - `gtd_process_inbox` - Process inbox using pure GTD methodology (2-minute rule, actionable decision tree)
     - `eisenhower_matrix_inbox` - Process inbox using Urgent/Important quadrants (complementary to GTD)
     - `gtd_weekly_review` - Complete weekly review with stale project detection
     - `gtd_principles` - Core GTD methodology guide
   - **Essential Reference:**
     - `quick_reference` - Essential tips and emergency commands

These prompts provide guided conversations with pre-configured questions and responses tailored to specific workflows. The two inbox processing methods serve complementary purposes: Eisenhower Matrix for initial overwhelm/priority learning, GTD Process for daily maintenance.

## Basic Usage

### Query Tasks (List)
The `list_tasks` tool is deprecated and retained only for backward compatibility. Use `query_tasks` with `queryType: "list"` instead:
```javascript
{
  "tool": "query_tasks",
  "arguments": {
    "queryType": "list",
    "completed": false,
    "limit": 50
  }
}
```

### Create Task
```javascript
{
  "tool": "create_task", 
  "arguments": {
    "name": "Review Q4 budget",
    "dueDate": "2024-01-15T17:00:00Z",
    "flagged": true
  }
}
```

### Create Sequential Project
```javascript
{
  "tool": "create_project",
  "arguments": {
    "name": "Website Redesign",
    "sequential": true,  // Tasks must be done in order
    "folder": "Work"
  }
}
```

### Work with Perspectives
```javascript
// List all perspectives
{
  "tool": "list_perspectives",
  "arguments": {}
}

// Query tasks from a perspective
{
  "tool": "query_perspective",
  "arguments": {
    "perspectiveName": "Inbox",
    "limit": "10"
  }
}
```

### Create Project with Review Settings
```javascript
{
  "tool": "create_project",
  "arguments": {
    "name": "Quarterly Goals",
    "reviewInterval": {
      "unit": "week",   // day, week, month, year
      "steps": 1,       // Review every 1 week
      "fixed": false    // Floating schedule
    },
    "nextReviewDate": "2025-01-15"
  }
}
```

### Create Action Group with Subtasks
```javascript
// Create parent task (action group)
{
  "tool": "create_task",
  "arguments": {
    "name": "Plan Party",
    "sequential": true,  // Subtasks must be done in order
    "projectId": "xyz789"
  }
}
// Returns: { taskId: "abc123" }

// Add subtasks
{
  "tool": "create_task",
  "arguments": {
    "name": "Make guest list",
    "parentTaskId": "abc123"  // Creates as subtask
  }
}
```

### Get Today's Agenda
```javascript
{
  "tool": "todays_agenda",
  "arguments": {
    "includeOverdue": true
  }
}
```

### Analyze Database Patterns (NEW)
```javascript
// Find duplicates, dormant projects, and tag issues
{
  "tool": "analyze_patterns",
  "arguments": {
    "patterns": ["duplicates", "dormant_projects", "tag_audit"],
    "options": {
      "dormant_threshold_days": "60"
    }
  }
}
```

## Available Tools (15 Consolidated)

### V2.0.0 Consolidated Architecture

**Task Operations (2 tools)**:
- `tasks` - Unified task querying with modes (search, overdue, today, upcoming, available, blocked, flagged)
- `manage_task` - All task CRUD operations (create, update, complete, delete)

**Project Operations (1 tool)**:
- `projects` - All project operations (list, create, update, complete, delete, review, stats)

**Organization (3 tools)**:
- `folders` - Complete folder operations (list, get, search, create, update, delete, move)
- `tags` - Tag management (list, active, create, rename, delete, merge, hierarchy)
- `manage_reviews` - GTD review workflow management

**Analytics (5 tools)**:
- `productivity_stats` - GTD health metrics and completion statistics
- `task_velocity` - Completion trends and velocity analysis  
- `analyze_overdue` - Bottleneck analysis for overdue items
- `workflow_analysis` - Deep workflow pattern analysis
- `analyze_patterns` - Database-wide pattern detection (duplicates, dormant projects, etc.)

**Utilities (4 tools)**:
- `export` - Data export in JSON/CSV/Markdown formats
- `recurring_tasks` - Recurring task analysis and patterns
- `perspectives` - Access to OmniFocus perspectives
- `system` - Version info and diagnostics

### Documentation

- `/docs/API-REFERENCE.md` - Complete API documentation (~4,800 tokens)
- `/docs/API-REFERENCE-LLM.md` - LLM-optimized reference (~900 tokens) 
- `/docs/API-COMPACT.md` - Ultra-compact reference (~400 tokens)
- `/docs/TOOLS.md` - Detailed tool documentation
- `/docs/TOOL_CONSOLIDATION.md` - Consolidation guide and migration help  
- `/docs/LLM_USAGE_GUIDE.md` - Best practices for AI agents

## Recurrence Examples

### Daily Task
```javascript
// Review inbox every morning
create_task({
  name: "Review OmniFocus inbox",
  dueDate: "2025-01-15 09:00",
  repeatRule: {
    unit: "day",
    steps: 1,
    method: "fixed"  // Due again next day regardless of completion
  }
})
```

### Weekly on Specific Days
```javascript
// Team standup on Mon/Wed/Fri
create_task({
  name: "Team standup",
  dueDate: "2025-01-13 10:00",  // Starting Monday
  repeatRule: {
    unit: "week",
    steps: 1,
    weekdays: ["monday", "wednesday", "friday"],
    method: "fixed"
  }
})
```

### Monthly on Specific Day
```javascript
// Pay rent on 1st of each month
create_task({
  name: "Pay rent",
  dueDate: "2025-02-01",
  repeatRule: {
    unit: "month",
    steps: 1,
    method: "fixed"
  }
})
```

### Monthly on Position (e.g., 2nd Tuesday)
```javascript
// Team retrospective on 2nd Tuesday of each month
create_task({
  name: "Team retrospective",
  dueDate: "2025-01-14 14:00",
  repeatRule: {
    unit: "month",
    steps: 1,
    weekPosition: "2",  // 2nd occurrence
    weekday: "tuesday",
    method: "fixed"
  }
})
```

### After Completion
```javascript
// Water plants 3 days after last watering
create_task({
  name: "Water plants",
  repeatRule: {
    unit: "day",
    steps: 3,
    method: "start-after-completion"  // Next due 3 days after marking complete
  }
})
```

### With Defer Date
```javascript
// Quarterly review (defer 1 week before due)
create_task({
  name: "Quarterly business review",
  dueDate: "2025-03-31",
  repeatRule: {
    unit: "month",
    steps: 3,
    method: "fixed",
    deferAnother: {
      unit: "week",
      steps: 1  // Becomes available 1 week before due
    }
  }
})
```

## Known Limitations

- **Recurrence/Repetition**: ✅ **NOW WORKING** via `evaluateJavascript()` bridge! See examples above. Implementation uses a hybrid approach bridging JXA to Omni Automation. Technical details in `/docs/JXA-LIMITATIONS.md`.
- **Tags**: ✅ **NOW WORKING** - Can be assigned during task creation using `evaluateJavascript()` bridge (v2.0.0-beta.1).
- **Project Movement**: Moving tasks between projects may require recreation with new ID
- **Parent Task Assignment**: Cannot move existing tasks into action groups via `update_task` (JXA limitation). The OmniFocus JXA API does not support reassigning tasks to new parents after creation. Workaround: Create new subtasks directly under the action group using `create_task` with `parentTaskId`.
- **Sequential Task Blocking**: Tasks in the inbox do not show as blocked even when sequential, as they lack project context. Sequential blocking only applies to tasks within projects or action groups.
- **Performance**: v1.13.0 revolutionizes performance with hybrid JXA/Omni Automation approach. Most queries now 60-96% faster, completing in <1 second even with large databases.

See `/docs/TROUBLESHOOTING.md` for solutions and `/docs/JXA-LIMITATIONS.md` for technical details.

## Data Format Conventions

- **Data Fields** (task/project properties): Use camelCase to match OmniFocus API
  - Examples: `dueDate`, `deferDate`, `estimatedMinutes`, `flagged`
- **Metadata Fields** (response metadata): Use snake_case for consistency
  - Examples: `task_count`, `export_date`, `query_time_ms`, `from_cache`

This distinction ensures compatibility with OmniFocus while maintaining consistent metadata formatting.

## Documentation

- `/docs/TOOLS.md` - Detailed tool documentation
- `/docs/GTD-WORKFLOW-MANUAL.md` - GTD workflow guides
- `/docs/PERFORMANCE.md` - Performance optimization
- `/docs/PERMISSIONS.md` - macOS permissions setup

### Bridge Safety (Developers)
- Use `src/omnifocus/scripts/shared/bridge-helpers.ts` (`BRIDGE_HELPERS`) for all bridge writes (tags, task moves, repetition rules). Do not hand‑roll `evaluateJavascript` strings.
- The legacy `getBridgeHelpers()` bundle has been removed. If you see references in older branches, replace them with BRIDGE_HELPERS templates/helpers.

## License

MIT License - see LICENSE file
