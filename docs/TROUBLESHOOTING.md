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

#### ~~Tags not being assigned~~ ✅ FIXED in v2.0.0
**Previous limitation**: Tags could not be assigned during task creation.

**Current Status (v2.0.0+)**: ✅ **Tag assignment now works during creation!**
```javascript
// ✅ Now works in single step!
const task = await manage_task({ 
  operation: 'create',
  name: "My Task",
  projectId: "someProjectId",
  tags: ["work", "urgent"]  // Works perfectly!
});
```

This limitation was resolved using the `evaluateJavascript()` bridge. See [JXA Limitations and Workarounds](JXA-LIMITATIONS-AND-WORKAROUNDS.md) for technical details.

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

## Additional Common Issues

### 1. "Script execution failed with code 1"
**Symptoms**: 75% of functions return this error

**Cause**: Missing IIFE wrapper after script modularization

**Solution**: Ensure all scripts have proper wrapper (fixed in current version):
```javascript
(() => {
  // script content
})();
```

### 2. "Task/Project not found" with Numeric IDs
**Symptoms**: `Project with ID '547' not found`

**Cause**: Claude Desktop bug converting string IDs to numbers

**Solution**: 
```javascript
// Always get fresh IDs from list operations
const projects = await projects({ operation: 'list', search: 'project name' });
const projectId = projects.data[0].id;  // Use this string ID
```

### 3. Slow Performance Issues
**Symptoms**: Operations taking 3+ seconds

**Common Causes & Solutions**:

1. **Using wrong tool**:
   - ❌ `tasks({ mode: 'all' })` for today → ✅ `tasks({ mode: 'today' })`
   - ❌ `tags({ operation: 'list' })` for dropdown → ✅ `tags({ operation: 'list', namesOnly: true })`

2. **Missing performance flags**:
   - Add `details: false` to tasks queries  
   - Use `fastMode: true` for tags when IDs needed

3. **Requesting too much data**:
   - Use `limit` parameter (defaults: 25-100)
   - Avoid `includeUsageStats` unless needed

### 4. Permission Errors
**Symptoms**: "Failed to get OmniFocus document"

**Solution**:
1. Open System Settings → Privacy & Security → Automation
2. Enable OmniFocus for your terminal/app
3. Run diagnostic: `system({ operation: 'diagnostics' })`

### 5. Date/Time Issues
**Symptoms**: Tasks created with wrong times

**Cause**: Timezone handling

**Solution**: Use local time format
```javascript
// Correct formats:
"2024-01-15"          // Date only (smart defaults: due=5pm, defer=8am)
"2024-01-15 14:30"    // Date and time (local)

// Avoid: ISO format with Z suffix
"2024-01-15T14:30:00Z"  // May cause timezone confusion
```

### 6. Cache-Related Issues
**Symptoms**: Not seeing recent changes

**Cache Durations**:
- Tasks: 30 seconds
- Projects: 5 minutes
- Tags: 5 minutes
- Analytics: 1 hour

**Force Refresh**: Change any parameter
```javascript
// These hit different cache keys:
tasks({ mode: 'all', limit: 50 })
tasks({ mode: 'all', limit: 51 })  // Forces fresh data
```

### 7. Invalid Period Values
**Symptoms**: "Invalid period" errors in analytics tools

**Solution**: Use exact strings only
```javascript
// ✅ Valid periods:
"today", "week", "month", "quarter", "year"  

// ❌ Invalid:
"last_week", "this_week", "current_week"
```

### 8. V2 Tool Migration Issues
**Symptoms**: "Tool not found" errors

**Solution**: Update to V2 consolidated tools:
```javascript
// ❌ Old V1 tools (removed):
create_task({ name: "Task" })
list_tasks({ completed: false })

// ✅ New V2 tools:
manage_task({ operation: 'create', name: "Task" })
tasks({ mode: 'all', completed: false })
```

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