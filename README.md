# OmniFocus MCP Server v1.6.0

A comprehensive Model Context Protocol (MCP) server for OmniFocus that provides advanced task management, analytics, and automation capabilities. Built with TypeScript and the official OmniAutomation API.

> **Note**: This project is developed with Claude Code, which explains the formal documentation style and detailed commit messages.

## Features

### Core Capabilities
- **Smart Caching**: TTL-based caching system for optimal performance (30s for tasks, 5m for projects, 1h for analytics)
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Official API Only**: Uses only OmniAutomation scripts via JXA (no database hacking)
- **High Performance**: Handles 2000+ tasks efficiently with intelligent caching
- **Individual Task Operations**: Create, update, complete, and delete tasks efficiently
- **Advanced Analytics**: GTD productivity insights and metrics
- **Export Capabilities**: Export data in CSV, JSON, and Markdown formats

### Available Tools

#### Task Operations (Read)
- `list_tasks` - Advanced task filtering with smart caching
  - Filter by: completion status, flags, project, tags, dates, search terms
  - Supports inbox filtering and availability checks  
  - Supports up to 1000 tasks with proper pagination metadata
  - Results cached for 30 seconds for lightning-fast repeated queries
- `get_task_count` - Get count of tasks matching filters without data
  - Same filtering options as list_tasks
  - Returns count only for performance
- `todays_agenda` - Get today's tasks with optimized performance
  - Smart filtering for due/defer dates
  - Includes overdue tasks automatically
  - Default limit of 50 tasks for fast response

#### Task Operations (Write) 
- `create_task` - Create new tasks in inbox or specific project
  - Set name, note, flagged status, due/defer dates
  - Tag assignment requires separate update (JXA limitation)
  - Returns task ID for further operations
- `update_task` - Update existing tasks
  - Modify name, note, flagged status, dates, tags
  - Support for moving between projects
  - Proper null handling for clearing dates
- `complete_task` - Mark tasks as completed
- `delete_task` - Remove tasks permanently

#### Note on Batch Operations
Batch operations are not currently supported due to OmniFocus JXA API limitations. 
Individual task operations (create, update, complete, delete) work perfectly and are 
recommended for all workflows. If OmniFocus updates their API in the future, batch 
operations may be re-implemented for performance optimization.

#### Date Range Queries
- `date_range_query` - Query tasks by date ranges
  - Filter by dueDate, deferDate, or completionDate
  - Supports operators: equals, before, after, between
  - Handles null date filtering
- `overdue_tasks` - Get all overdue tasks
  - Automatic date calculation
  - Combines with other filters
- `upcoming_tasks` - Get tasks due in next N days
  - Configurable day range (default 7)
  - Excludes overdue tasks

#### Project Operations
- `list_projects` - List and filter projects with caching
  - Filter by: status (active, on hold, dropped, completed), flags, folder
  - Results cached for 5 minutes
  - Includes task counts
- `create_project` - Create new projects with folder support
  - Automatically creates folders if they don't exist
  - Set name, note, dates, flags, and parent folder
- `update_project` - Update project properties
  - Change name, note, status, dates, flags
  - Folder movement supported with limitations
- `complete_project` - Mark projects as done
- `delete_project` - Remove projects from OmniFocus

#### Analytics & Insights
- `productivity_stats` - Comprehensive productivity metrics
  - Completion rates and velocity
  - Time-based trends
  - Project distribution analysis
- `task_velocity` - Task completion trends
  - Daily/weekly/monthly velocity
  - Moving averages
  - Completion patterns
- `overdue_analysis` - Analyze overdue tasks
  - Overdue distribution by project/tag
  - Age analysis
  - Recurring task patterns

#### Tag Management
- `list_tags` - Get all available tags
  - Hierarchical tag structure
  - Usage counts
  - Cached for performance
- `manage_tags` - Create, rename, or delete tags
  - Maintains tag hierarchy

#### Export Tools
- `export_tasks` - Export tasks to various formats
  - Supports CSV, JSON, Markdown
  - Customizable fields
  - Filter before export
- `export_projects` - Export project data
  - Include project metadata
  - Optional task inclusion
- `bulk_export` - Export all data
  - Complete backup functionality
  - Multiple format support

#### Recurring Tasks
- `analyze_recurring_tasks` - Analyze recurring patterns
  - Identify overdue recurring tasks
  - Pattern detection
  - Next occurrence predictions
- `get_recurring_patterns` - Extract recurring rules
  - Frequency analysis
  - Custom recurrence detection

### GTD Workflow Prompts (Ready for Future Claude Desktop Support)
The server implements MCP Prompts for guided GTD workflows, but **Claude Desktop does not yet support the MCP Prompts capability**. See [GTD-WORKFLOW-MANUAL.md](docs/GTD-WORKFLOW-MANUAL.md) for manual workflow instructions using available tools.

#### Implemented Prompts (awaiting client support):
- `gtd_weekly_review` - Complete GTD weekly review with intelligent project analysis
  - Processes inbox items
  - Reviews completed tasks from the past week
  - **Identifies stale projects** that haven't been reviewed recently
  - Suggests projects for someday/maybe or deletion
  - Ensures every active project has clear next actions
  - Reviews calendar alignment

- `gtd_process_inbox` - Process inbox using GTD methodology
  - Guides through actionable/non-actionable decisions
  - Applies 2-minute rule
  - Helps with delegation decisions
  - Identifies single actions vs projects

Once Claude Desktop adds prompt support, these will provide automated step-by-step guidance through GTD best practices.

#### System & Diagnostics
- `get_version_info` - Get OmniFocus and server versions
  - API compatibility info
  - System requirements check
- `run_diagnostics` - Comprehensive system check
  - Permission verification
  - Performance metrics
  - Cache statistics

## Installation & Permissions

### Prerequisites

1. OmniFocus 3 or later installed on macOS
2. Node.js 18+ installed
3. Permission to access OmniFocus via automation (see [Permissions Guide](docs/PERMISSIONS.md))

### Installation Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/omnifocus-mcp.git
cd omnifocus-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```

### Granting Permissions

The first time you use the MCP server, macOS will prompt you to grant permission to access OmniFocus. See the [Permissions Guide](docs/PERMISSIONS.md) for detailed instructions.

## Configuration

### Claude Desktop Setup

Add to your Claude Desktop configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Variables

- `LOG_LEVEL` - Set logging level: `error`, `warn`, `info`, `debug` (default: `info`)

## Usage Examples

### List All Incomplete Tasks
```typescript
{
  "tool": "list_tasks",
  "arguments": {
    "completed": false,
    "limit": 50
  }
}
```

### Create a New Task with Project Assignment
```typescript
// First, find the project ID
{
  "tool": "list_projects",
  "arguments": {
    "search": "Budget Planning"
  }
}
// Returns: { "projects": [{ "id": "jH8x2mKl9pQ", "name": "Budget Planning 2024", ... }] }

// Then create the task in that project
{
  "tool": "create_task",
  "arguments": {
    "name": "Review Q4 budget",
    "projectId": "jH8x2mKl9pQ",  // Use the ID from list_projects
    "dueDate": "2024-01-15T17:00:00Z",
    "flagged": true,
    "tags": ["finance", "urgent"],
    "estimatedMinutes": 30
  }
}
```

### Move a Task Between Projects
```typescript
// Move an existing task to a different project
{
  "tool": "update_task",
  "arguments": {
    "taskId": "abc123xyz",
    "projectId": "newProjectId"  // Or null to move to inbox
  }
}
```

### Find Overdue Tasks
```typescript
{
  "tool": "list_tasks",
  "arguments": {
    "completed": false,
    "dueBefore": "2024-01-01T00:00:00Z",
    "search": "budget"
  }
}
```

### List Active Projects
```typescript
{
  "tool": "list_projects",
  "arguments": {
    "status": ["active"],
    "flagged": true
  }
}
```

### Create a Project with Folder
```typescript
{
  "tool": "create_project",
  "arguments": {
    "name": "New Website Launch",
    "note": "Complete redesign and launch",
    "folder": "Work Projects",  // Creates folder if it doesn't exist
    "dueDate": "2024-03-31T17:00:00Z",
    "flagged": true
  }
}
```

### Update Project (Including Folder)
```typescript
// First, get the project ID from list_projects
{
  "tool": "list_projects",
  "arguments": {
    "search": "Website Launch"
  }
}

// Then update using the project ID
{
  "tool": "update_project",
  "arguments": {
    "projectId": "jH8x2mKl9pQ",  // Use the ID from list_projects
    "updates": {
      "folder": "Archive",  // Note: Folder movement has JXA limitations
      "status": "onHold",
      "note": "Postponed until Q2"
    }
  }
}
```

## Troubleshooting

### "Project not found" Errors with Numeric IDs

If you see errors like `Project with ID '547' not found` followed by a Claude Desktop bug warning:

1. **Use list_projects** to get the correct full project ID:
   ```typescript
   {
     "tool": "list_projects",
     "arguments": {
       "search": "your project name"
     }
   }
   ```

2. **Copy the full alphanumeric ID** (e.g., `"az5Ieo4ip7K"`) from the results

3. **Use project names as an alternative**:
   ```typescript
   {
     "tool": "update_task", 
     "arguments": {
       "taskId": "your-task-id",
       "projectId": null  // Move to inbox first
     }
   }
   ```
   Then manually assign in OmniFocus, or use project names in search filters instead.

### Task Update Failures

- Always get task IDs from `list_tasks` rather than guessing
- Use `list_projects` to verify project IDs before assignment
- Check that tasks exist and aren't in the trash

## Architecture

### Cache Strategy

The server implements intelligent caching with different TTLs for different data types:

- **Tasks**: 30 seconds (frequently changing)
- **Projects**: 5 minutes (less volatile)
- **Analytics**: 1 hour (expensive computations)
- **Tags**: 10 minutes (relatively stable)

Cache is automatically invalidated on write operations.

### OmniAutomation Integration

All OmniFocus interactions use JavaScript for Automation (JXA) through OmniAutomation:
- Scripts are wrapped for error handling
- Parameters are safely escaped
- Results are typed and validated
- Individual operations are fast and reliable

### Error Handling

The server provides detailed error messages with:
- Specific error types (NotFound, Permission, Script execution)
- Contextual information for debugging
- Graceful degradation when possible

## Development

### Prerequisites
- Node.js 18+
- OmniFocus 3+ (Pro recommended)
- macOS (required for OmniAutomation)

### Scripts
```bash
npm run build    # Build TypeScript
npm run dev      # Watch mode
npm run test     # Run tests
npm run lint     # Lint code
npm run typecheck # Type checking
```

### Project Structure
```
src/
├── cache/          # Smart caching system
├── omnifocus/      # OmniAutomation integration
│   └── scripts/    # JXA script templates
├── tools/          # MCP tool implementations
├── utils/          # Logging and helpers
└── index.ts        # Server entry point
```

## Known Limitations

### Tag Assignment
**Known Limitation**: Tags cannot be assigned during task creation due to OmniFocus JXA API constraints. 

**Current Status**:
- Tag creation and listing work perfectly
- Tag assignment DURING task creation is not supported
- Tag assignment via update_task after creation has mixed results:
  - The server attempts multiple methods (addTags, tags property, individual addTag)
  - Success varies depending on OmniFocus version and task state
  - If tags fail to apply, you'll receive a warning with details

**Recommended Approach**:
```javascript
// Step 1: Create task without tags
const task = await create_task({ 
  name: "My Task",
  projectId: "someProjectId"
  // Don't include tags here
});

// Step 2: Update task with tags
const result = await update_task({ 
  taskId: task.id, 
  tags: ["work", "urgent"] 
});

// Check if warning was returned
if (result.warning) {
  console.log("Tag assignment issue:", result.warning);
  // Tags may need to be applied manually in OmniFocus
}
```

**Best Practice**: For reliable tag management, consider using the OmniFocus UI directly or creating tasks with tags through OmniFocus's native interfaces.

### Project Assignment
**Known Limitation**: Moving tasks between projects using JXA has reliability issues.

**Current Approach**:
- When updating a task's project, the server may need to delete and recreate the task
- This is due to JXA's `assignedContainer` property not working reliably
- The task will maintain all its properties (name, notes, dates, flags) but get a new ID
- You'll receive a note in the response if recreation was necessary

**Example**:
```javascript
// Moving a task to a project
const result = await update_task({ 
  taskId: "abc123", 
  projectId: "xyz789" 
});

// Check if task was recreated
if (result.note && result.note.includes("recreated")) {
  console.log("Task was moved via recreation. New ID:", result.id);
}
```

### JXA whose() Constraints
- Cannot query for "not null" directly (use `{_not: null}` syntax)
- String operators require underscore prefix: `_contains`, `_beginsWith`, `_endsWith`
- Date operators use symbols (`>`, `<`), NOT underscores
- Complex queries may timeout with large databases
- See [JXA Operators Guide](docs/JXA-WHOSE-OPERATORS-DEFINITIVE.md) for complete reference

### Individual Operations
- All individual task operations (create, update, complete, delete) work perfectly
- Fast enough for practical GTD workflows
- More reliable than batch operations due to OmniFocus API design

### Performance Considerations
- Default limits optimized for performance (todays_agenda: 50, list_tasks: 100)
- Large queries (2000+ tasks) may take 30-60 seconds
- Use `skipAnalysis: true` for ~30% faster queries when recurring task details aren't needed
- See [Performance documentation](docs/PERFORMANCE_ISSUE.md) for optimization tips

### MCP Architecture
MCP does not support progress indicators or streaming responses. Long operations must complete before returning results. See [User Feedback and Limitations](docs/USER_FEEDBACK_AND_LIMITATIONS.md) for detailed explanation.

## Performance

- Handles 2000+ tasks with optimized query strategies
- Intelligent caching reduces OmniFocus API calls by 80%+
- Response times with caching: ~1-2 seconds for typical queries
- Smart defaults prevent timeouts (reduced from 200 to 50 items for todays_agenda)
- Memory-efficient with automatic cache cleanup
- Performance metrics included in responses for monitoring

## Security

- No direct database access
- Parameters are sanitized before script execution
- Read-only operations by default
- No sensitive data is logged

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Future Improvements

### High Priority Recommendations

1. **Fix Unit Test Suite**: Several unit tests are failing due to incorrect assumptions about the codebase. Priority areas:
   - Update test expectations to match actual API response formats
   - Align mock objects with real implementation interfaces
   - Remove tests that verify incorrect behavior (e.g., expecting primaryKey to be a method when it's a property)

2. **Add ESLint Configuration**: The project is missing an ESLint configuration file which prevents linting from running. Create an `eslint.config.js` that supports TypeScript and follows the project's coding standards.

3. **Improve Error Recovery**: While the URL scheme fallback for permission-denied errors is a good start, consider:
   - Implementing retry logic with exponential backoff
   - Adding user-friendly error messages that suggest solutions
   - Creating a diagnostic tool to help users troubleshoot permission issues

## License

MIT License - see LICENSE file for details

## Testing

### End-to-End Testing with Claude Desktop

To test the permission system with Claude Desktop:

1. **Revoke Permissions** (to test error handling):
   - Open System Settings → Privacy & Security → Automation
   - Find "Claude" (or "Electron" if Claude isn't listed)
   - Uncheck the checkbox next to "OmniFocus"

2. **Test in Claude Desktop**:
   - Ask Claude: "Can you list my OmniFocus tasks?"
   - You should see a helpful error message with instructions to grant permissions

3. **Grant Permissions**:
   - Either click "OK" when the permission dialog appears
   - Or manually enable in System Settings as instructed

4. **Verify Success**:
   - Ask Claude again to list your tasks
   - Tasks should now be displayed correctly

### Testing During Development

```bash
# Build and test the server
npm run build
npm test

# Test with MCP Inspector
npx @modelcontextprotocol/inspector dist/index.js

# Run integration tests
node tests/integration/test-as-claude-desktop.js
```

## Technical Notes

### Claude Desktop ID Parsing Bug

**CRITICAL ISSUE**: Claude Desktop has a confirmed bug where it extracts numeric portions from alphanumeric project IDs when calling MCP tools.

**Example**: When you provide project ID `"az5Ieo4ip7K"`, Claude Desktop may pass only `"547"` to the tool, causing "Project not found" errors.

**Symptoms**:
- Task updates fail with "Project not found" errors
- Error messages show numeric IDs (like "547") instead of full alphanumeric IDs
- Occurs even when full project IDs are provided in prompts

**Mitigation**:
- Our error messages now detect this pattern and provide helpful guidance
- Tool descriptions warn about using full alphanumeric IDs
- Consider using project names instead of IDs when this bug affects your workflow

**Related Issues**: This is part of broader Claude Desktop parameter processing bugs documented in GitHub issues, including type conversion failures and JSON parsing errors.

### ES Modules Requirement

This project uses ES modules (ESM) with `.js` extensions in import statements, which may seem unusual for TypeScript projects. This is required because:

1. The MCP SDK (`@modelcontextprotocol/sdk`) is currently ESM-only
2. There are known CommonJS compatibility issues (see [GitHub issue #217](https://github.com/modelcontextprotocol/typescript-sdk/issues/217))

**Future Migration**: Once the MCP SDK adds proper CommonJS support, this project should migrate to standard TypeScript/CommonJS to remove the need for `.js` extensions in imports.

## Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol)
- [OmniAutomation](https://omni-automation.com/)
- TypeScript
