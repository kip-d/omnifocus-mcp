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

## Available Tools (46 Total)

### Consolidated Tools (Recommended for AI Agents)

**Task Queries**: `query_tasks` - Unified interface for all task querying (replaces 7 individual tools)  
**Folder Management**: `manage_folder` - Complete folder operations with operation parameter  
**Review Management**: `manage_reviews` - GTD review workflow management  
**Batch Operations**: `batch_task_operations` - Efficient multi-task operations

### Standard Tools

**Task CRUD**: `create_task`, `update_task`, `complete_task`, `delete_task`, `get_task_count`, `todays_agenda`

**Projects**: `list_projects`, `create_project`, `update_project`, `complete_project`, `delete_project`

**Perspectives**: `list_perspectives`, `query_perspective` - Access user's custom perspectives and their contents

**Analytics**: `productivity_stats`, `task_velocity`, `overdue_analysis`

**Tags**: `list_tags`, `get_active_tags`, `manage_tags`

**Export**: `export_tasks`, `export_projects`, `bulk_export`

### Legacy Tools (Deprecated but Functional)

**Individual Task Queries**: `list_tasks`, `next_actions`, `blocked_tasks`, `available_tasks`, `overdue_tasks`, `upcoming_tasks` *(use `query_tasks` instead)*

**Individual Folder Tools**: `create_folder`, `update_folder`, `delete_folder`, `move_folder` *(use `manage_folder` instead)*

**Individual Review Tools**: `projects_for_review`, `mark_project_reviewed`, `set_review_schedule` *(use `manage_reviews` instead)*

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

## License

MIT License - see LICENSE file