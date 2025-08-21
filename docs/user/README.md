# OmniFocus MCP User Documentation

Welcome to the OmniFocus MCP (Model Context Protocol) server documentation. This server enables AI assistants like Claude to interact with your OmniFocus task management system.

## Quick Links

### Getting Started
- **[Installation Guide](../../README.md#installation)** - Set up the MCP server
- **[Configuration](../../docs/claude-desktop-config.md)** - Configure Claude Desktop
- **[Quick Start](../../README.md#quick-start)** - Basic usage examples

### User Guides
- **[MIGRATION_GUIDE_V2.md](MIGRATION_GUIDE_V2.md)** - Upgrading from v1 to v2
- **[USER_TESTING_PROMPT_V2.md](USER_TESTING_PROMPT_V2.md)** - Test prompts for v2 features
- **[USER_TESTING_SUMMARY.md](USER_TESTING_SUMMARY.md)** - Results from user testing

### API Reference
- **[Complete API Reference](../../docs/API-REFERENCE.md)** - Detailed tool documentation
- **[API Compact Reference](../../docs/API-COMPACT.md)** - Quick reference guide
- **[Tool Overview](../../docs/TOOLS.md)** - Summary of available tools

### Troubleshooting
- **[Troubleshooting Guide](../../docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Permissions Guide](../../docs/PERMISSIONS.md)** - Fixing permission issues
- **[Date Handling](../../docs/DATE_HANDLING.md)** - Working with dates

## Key Features

### Task Management
- Create, update, and complete tasks
- Manage tags and projects
- Set due dates, defer dates, and repeat rules
- Flag important tasks
- Add time estimates

### Queries & Analytics
- Today's agenda view
- Overdue task analysis
- Productivity statistics
- Task velocity tracking
- Custom task searches

### Export & Import
- Export tasks to JSON/CSV/Markdown
- Bulk export all OmniFocus data
- Project and tag management

## Common Use Cases

### Daily Planning
```
"Show me today's agenda"
"What tasks are overdue?"
"List my flagged tasks"
```

### Task Creation
```
"Create a task 'Review quarterly report' due Friday at 3pm in project 'Work'"
"Add a recurring task 'Weekly review' every Sunday at 2pm"
```

### Productivity Analysis
```
"Show my productivity stats for this week"
"Analyze my overdue tasks for patterns"
"What's my task completion velocity?"
```

## Important Notes

### Date Formats
- Always use `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` format
- Example: "2025-03-31" or "2025-03-31 14:30"
- Natural language dates must be converted to this format

### Performance
- Most queries complete in under 2 seconds
- Large database queries (2000+ tasks) may take longer
- Use `limit` parameters to improve performance

### Limitations
- Cannot access OmniFocus while it's locked
- Some operations require OmniFocus to be running
- Complex repeat rules have JXA limitations

## Getting Help

1. Check the [Troubleshooting Guide](../../docs/TROUBLESHOOTING.md)
2. Review [Known Limitations](../../docs/USER_FEEDBACK_AND_LIMITATIONS.md)
3. Report issues on [GitHub](https://github.com/kip/omnifocus-mcp/issues)

## Version Information

Current version: **2.0.0**
- 100% test pass rate
- Sub-second query performance
- Full tag and repeat rule support
- Comprehensive error messages

See [CHANGELOG](../../CHANGELOG.md) for version history.