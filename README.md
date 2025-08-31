# OmniFocus MCP Server

A Model Context Protocol (MCP) server for OmniFocus task management automation.

## 🎉 v2.0.0 Production Release!

**Complete architecture overhaul with all JXA limitations fixed:**
- ⚡ **95% faster performance** - Queries now complete in <1 second for 2000+ tasks
- 🔒 **Security hardened** - Fixed injection vulnerabilities in bridge operations
- 🛠️ **100% reliable** - No more delete/recreate, task IDs preserved
- 📊 **Summary-first responses** - Immediate insights before detailed data
- 🏷️ **Tag assignment fixed** - Tags can now be set during task creation
- 🔄 **Full repeat rule support** - Complex recurrence patterns now work
- 📁 **Task reparenting** - Move tasks between projects and parents
- 👁️ **Perspective queries** - Query any perspective without changing windows
- 🎯 **Zero breaking changes** - Seamless upgrade from v1.x

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

- Task management (create, update, complete, delete)
- Project and folder organization  
- Sequential/parallel support for both projects and tasks
- GTD analytics and productivity insights
- Tag management
- **Perspective support** - List and query OmniFocus perspectives
- Data export (CSV, JSON, Markdown)
- Smart caching for performance

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

This server provides nine pre-built prompts for common GTD workflows and reference guides. To access them in Claude Desktop (v0.12.55+):

1. Click the **"+"** button (bottom-left of the input box)
2. Select **"Add from omnifocus"** from the menu
3. Choose from available prompts:
   - **GTD Workflows:**
     - `gtd_process_inbox` - Process inbox with 2-minute rule
     - `eisenhower_matrix_inbox` - Process inbox items using the Eisenhower Matrix (Urgent/Important quadrants)
     - `gtd_weekly_review` - Complete weekly review with stale project detection
     - `gtd_principles` - Core GTD methodology guide
   - **Reference Guides:**
     - `quick_reference` - Essential tips and emergency commands
     - `tool_discovery_guide` - All tools with performance characteristics
     - `common_patterns_guide` - Best practices and workflows
     - `troubleshooting_guide` - Common errors and solutions
     - `tag_performance_guide` - Optimize tag queries

These prompts provide guided conversations with pre-configured questions and responses tailored to specific workflows.

## Basic Usage

### Query Tasks
Use the `tasks` tool with different modes:
```javascript
{
  "tool": "tasks",
  "arguments": {
    "mode": "today",  // or: all, search, overdue, upcoming, available, blocked, flagged
    "details": true,
    "limit": 50
  }
}
```

### Create Task
Use the `manage_task` tool with operation='create':
```javascript
{
  "tool": "manage_task", 
  "arguments": {
    "operation": "create",
    "name": "Review Q4 budget",
    "dueDate": "2024-01-15 17:00",  // 5pm on Jan 15 (or just "2024-01-15" for 5pm default)
    "flagged": true
  }
}
```

### Create Sequential Project
```javascript
{
  "tool": "projects",
  "arguments": {
    "operation": "create",
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

## Available Tools (14 Consolidated Tools - v2.0.0)

> **Note for v1 users:** Tools have been consolidated for better LLM performance. Your AI assistant will automatically use the new tools - no action required from you!

### 🚀 Fully Consolidated Architecture (36% reduction from v1)

#### Task Operations (2 tools)
- **`tasks`** - Query/search tasks with multiple modes (today, overdue, search, etc.)
- **`manage_task`** - All task CRUD operations (create, update, complete, delete)

#### Project & Organization (4 tools)
- **`projects`** - All project operations (list, create, update, complete, delete, stats)
- **`folders`** - All folder operations (list, search, create, update, delete, move)
- **`tags`** - All tag operations (list, active, create, rename, delete, merge)
- **`manage_reviews`** - GTD review workflow management

#### Analytics (4 tools)
- **`productivity_stats`** - GTD health metrics and insights
- **`task_velocity`** - Completion trends and predictions
- **`analyze_overdue`** - Bottleneck analysis and patterns
- **`life_analysis`** - Deep workflow health analysis

#### Utilities (4 tools)
- **`export`** - All export operations (tasks, projects, or complete backup)
- **`recurring_tasks`** - Recurring task analysis and patterns
- **`perspectives`** - List and query custom perspectives
- **`system`** - Version info and diagnostics

### Documentation

- **NEW** `/docs/API-REFERENCE-V2.md` - v2.0.0 Consolidated API reference
- `/docs/API-REFERENCE-LLM.md` - LLM-optimized reference (~900 tokens) 
- `/docs/API-COMPACT.md` - Ultra-compact reference (~400 tokens)
- `/docs/user/MIGRATION_GUIDE_V2.md` - Migration from v1 to v2
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

### Date Formats
- **Recommended**: `YYYY-MM-DD HH:mm` (e.g., "2024-01-15 17:00" for 5pm)
- **Date-only**: `YYYY-MM-DD` (e.g., "2024-01-15")
  - Due dates default to 5:00 PM local time
  - Defer dates default to 8:00 AM local time
- **Avoid**: ISO-8601 with Z suffix (causes timezone confusion)

### Field Naming
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

## License

MIT License - see LICENSE file