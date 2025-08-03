# Troubleshooting Guide

## Common Issues and Solutions

### Installation Issues

#### "command not found" after npm install
**Solution**: Make sure the package is built:
```bash
npm run build
```

#### TypeScript compilation errors
**Solution**: Ensure you have Node.js 18+ and run:
```bash
npm install
npm run build
```

### Connection Issues

#### "OmniFocus permissions not granted"
**Solution**: See [PERMISSIONS.md](PERMISSIONS.md) for detailed setup instructions.

#### "Failed to connect to OmniFocus"
**Solution**: 
1. Ensure OmniFocus is running
2. Check that no dialogs are blocking OmniFocus
3. Try running a simple test: `osascript -l JavaScript -e "Application('OmniFocus').name()"`

### Performance Issues

#### Operations timing out
**Solution**:
1. Use smaller limits: `limit: 50` instead of default
2. Enable performance mode: `skipAnalysis: true` for list_tasks
3. Use specific filters to reduce result set
4. Check your database size - performance scales with task count

#### todays_agenda takes too long
**Solution**: Already optimized in v1.5.0+. If still slow:
- Reduce limit further: `limit: 25`
- Set `includeDetails: false`
- Use list_tasks with date filters instead

### Data Issues

#### Tasks not appearing in results
**Possible causes**:
1. Tasks may be in trash - we filter these out
2. Cache may be stale - wait 1 minute or modify a task to invalidate
3. Check your filters - they may be too restrictive

#### "Cannot convert undefined or null to object"
**Solution**: Update to latest version. This was fixed in v1.4.0.

#### Tags not being assigned
**Known limitation**: Tags cannot be assigned during task creation due to JXA API constraints.
**Workaround**:
```javascript
// Step 1: Create task
const task = await create_task({ name: "My Task" });
// Step 2: Update with tags
await update_task({ taskId: task.id, tags: ["work", "urgent"] });
```

### MCP-Specific Issues

#### "No prompts available" in Claude Desktop
**Known limitation**: Claude Desktop doesn't support MCP Prompts yet. Use manual workflows from [GTD-WORKFLOW-MANUAL.md](GTD-WORKFLOW-MANUAL.md).

#### Progress indicators not showing
**MCP limitation**: MCP is request-response only. No streaming or progress updates possible.

### Debugging Tips

#### Enable debug logging
Set environment variable:
```bash
export LOG_LEVEL=debug
```

#### Check MCP Inspector
Test your server:
```bash
npx @modelcontextprotocol/inspector dist/index.js
```

#### Verify installation
```bash
node dist/index.js --version
```

## Getting Help

1. Check existing issues: https://github.com/kip-d/omnifocus-mcp/issues
2. Enable debug logging and include logs in bug reports
3. Include your OmniFocus version and task database size
4. Try with a smaller database to isolate performance issues