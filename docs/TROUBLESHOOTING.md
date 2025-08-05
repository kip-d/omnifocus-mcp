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

#### package-lock.json shows as dirty after build
**Solution**: This is normal if dependencies were updated. Best practices:

1. **Use `npm ci` in production/deployment**:
   ```bash
   npm ci          # Installs from lock file exactly
   npm run build   # Should not modify lock file
   ```

2. **If package-lock.json changes are legitimate**:
   ```bash
   git add package-lock.json
   git commit -m "Update package-lock.json"
   ```

3. **Common causes of package-lock.json changes**:
   - Different npm/Node versions between environments
   - Running `npm install` instead of `npm ci`
   - Automatic dependency updates

4. **Prevention**:
   - Use `.nvmrc` file to ensure consistent Node versions
   - Always use `npm ci` for production builds
   - Commit package-lock.json changes when they occur

**Note**: package-lock.json should always be committed to the repository. Only build artifacts (dist/, build/) should be in .gitignore.

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

#### "Project not found" Errors with Numeric IDs

**CRITICAL ISSUE**: Claude Desktop has a confirmed bug where it extracts numeric portions from alphanumeric project IDs.

**Example**: When you provide project ID `"az5Ieo4ip7K"`, Claude Desktop may pass only `"547"` to the tool, causing "Project not found" errors.

**Symptoms**:
- Task updates fail with "Project not found" errors
- Error messages show numeric IDs (like "547") instead of full alphanumeric IDs
- Occurs even when full project IDs are provided in prompts

**Solutions**:
1. Use `list_projects` to get the correct full project ID:
   ```javascript
   {
     "tool": "list_projects",
     "arguments": {
       "search": "your project name"
     }
   }
   ```
2. Copy the full alphanumeric ID (e.g., `"az5Ieo4ip7K"`) from results
3. Alternative workaround - move to inbox first, then manually assign in OmniFocus:
   ```javascript
   {
     "tool": "update_task", 
     "arguments": {
       "taskId": "your-task-id",
       "projectId": null  // Move to inbox
     }
   }
   ```

#### Tags not being assigned
**Known limitation**: Tags cannot be assigned during task creation due to JXA API constraints.

**Current Status**:
- Tag creation and listing work perfectly
- Tag assignment DURING task creation is not supported
- Tag assignment via update_task after creation has mixed results

**Workaround**:
```javascript
// Step 1: Create task without tags
const task = await create_task({ 
  name: "My Task",
  projectId: "someProjectId"
});

// Step 2: Update with tags
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

**Best Practice**: For reliable tag management, consider using the OmniFocus UI directly.

#### Project Movement Issues

**Known Limitation**: Moving tasks between projects using JXA has reliability issues.

**What happens**: 
- The server may need to delete and recreate the task
- Task maintains all properties but gets a new ID
- Response includes note about recreation

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

**Note**: If Inspector won't start, ensure you've built the project first with `npm run build`.

#### Verify installation
```bash
node dist/index.js --version
```

#### Test Basic Connection
```javascript
{
  "tool": "get_version_info",
  "arguments": {}
}
```

### Known Claude Desktop Bugs

1. **ID Parsing**: Extracts numbers from alphanumeric IDs
2. **Type Conversion**: May convert strings to numbers
3. **JSON Parsing**: Complex nested objects may fail

These are Claude Desktop issues, not server bugs. Use workarounds provided above.

### JXA whose() Constraints

- Cannot query for "not null" directly (use `{_not: null}` syntax)
- String operators require underscore prefix: `_contains`, `_beginsWith`, `_endsWith`
- Date operators use symbols (`>`, `<`), NOT underscores
- Complex queries may timeout with large databases

## Emergency Recovery

If nothing works:
1. Restart OmniFocus
2. Rebuild the server: `npm run build`
3. Clear Claude Desktop config and re-add
4. Grant permissions again in System Settings
5. Test with simple query like `get_version_info`

## Getting Help

1. Check existing issues: https://github.com/kip-d/omnifocus-mcp/issues
2. Enable debug logging and include logs in bug reports
3. Include your OmniFocus version and task database size
4. Try with a smaller database to isolate performance issues