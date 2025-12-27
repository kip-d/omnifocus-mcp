# Troubleshooting Guide

## Installation Issues

#### "command not found" after npm install

Build the package:

```bash
npm run build
```

#### TypeScript compilation errors

Requires Node.js 18+:

```bash
npm install
npm run build
```

#### package-lock.json dirty after build

Normal if dependencies updated. Best practices:

1. **Production**: Use `npm ci` (installs from lock file exactly)
2. **Legitimate changes**: Commit them
3. **Common causes**: Different npm/Node versions, `npm install` vs `npm ci`
4. **Prevention**: Use `.nvmrc`, prefer `npm ci` for builds

Always commit package-lock.json. Only build artifacts belong in .gitignore.

## Connection Issues

#### "OmniFocus permissions not granted"

See [PERMISSIONS.md](PERMISSIONS.md).

#### "Failed to connect to OmniFocus"

1. Confirm OmniFocus is running
2. Close any blocking dialogs
3. Test: `osascript -l JavaScript -e "Application('OmniFocus').name()"`

## Performance Issues

#### Operations timing out

1. Reduce limits: `limit: 50`
2. Add `skipAnalysis: true` for task queries
3. Use specific filters
4. Large databases slow everything—performance scales with task count

#### todays_agenda slow

Optimized in v1.5.0+. If still slow:

- Use `limit: 25`
- Set `includeDetails: false`
- Try `list_tasks` with date filters

## Data Issues

#### Tasks not appearing

1. Trashed tasks are filtered out
2. Cache stale—wait 1 minute or modify a task to refresh
3. Filters too restrictive

#### "Cannot convert undefined or null to object"

Fixed in v1.4.0. Update to latest version.

#### "Project not found" with Numeric IDs

**Claude Desktop bug**: Extracts numbers from alphanumeric IDs. ID `"az5Ieo4ip7K"` becomes `"547"`.

**Fix**: Get fresh IDs via `list_projects`:

```javascript
{ "tool": "list_projects", "arguments": { "search": "project name" } }
```

Use the full alphanumeric ID from results.

#### ~~Tags not assigned~~ ✅ FIXED v2.0.0

Tag assignment during creation now works:

```javascript
manage_task({
  operation: 'create',
  name: 'My Task',
  tags: ['work', 'urgent'], // Works!
});
```

See [JXA Limitations](JXA-LIMITATIONS-AND-WORKAROUNDS.md) for details.

#### Project Movement Issues

Moving tasks between projects may recreate the task with a new ID. Properties preserved; ID changes. Check `result.note` for recreation notices.

## MCP-Specific Issues

#### "No prompts available"

- **Claude Desktop**: Click "+" → "Add from omnifocus"
- **Other clients**: Check MCP prompt support
- **Fallback**: [GTD-WORKFLOW-MANUAL.md](GTD-WORKFLOW-MANUAL.md)

#### No progress indicators

MCP is request-response only. No streaming.

## Debugging

#### Enable debug logging

```bash
export LOG_LEVEL=debug
```

#### MCP Inspector

```bash
npx @modelcontextprotocol/inspector dist/index.js
```

Build first with `npm run build` if Inspector fails.

#### Verify installation

```bash
node dist/index.js --version
```

#### Test connection

```javascript
{ "tool": "get_version_info", "arguments": {} }
```

## Known Claude Desktop Bugs

1. **ID Parsing**: Extracts numbers from alphanumeric IDs
2. **Type Conversion**: Strings become numbers
3. **JSON Parsing**: Complex nested objects fail

These are client bugs, not server bugs.

## Additional Common Issues

### 1. "Script execution failed with code 1"

Fixed in current version. If persists, rebuild: `npm run build`

### 2. "Task/Project not found" with Numeric IDs

Claude Desktop converts string IDs to numbers. Always fetch fresh IDs:

```javascript
const projects = await projects({ operation: 'list', search: 'project name' });
const projectId = projects.data[0].id; // Use this
```

### 3. Slow Performance (3+ seconds)

1. **Wrong tool**: Use `tasks({ mode: 'today' })` not `mode: 'all'`
2. **Missing flags**: Add `details: false`, `fastMode: true`
3. **Too much data**: Use `limit` parameter, skip `includeUsageStats`

### 4. Permission Errors

1. System Settings → Privacy & Security → Automation
2. Enable OmniFocus for your app
3. Test: `system({ operation: 'diagnostics' })`

### 5. Wrong Times on Tasks

Use local time format:

```javascript
'2024-01-15';       // Date only (defaults: due=5pm, defer=8am)
'2024-01-15 14:30'; // Date+time (local)
// Avoid: '2024-01-15T14:30:00Z' (timezone confusion)
```

### 6. Cache Issues

**Durations**: Tasks 30s, Projects/Tags 5m, Analytics 1h

**Force refresh**: Change any parameter (e.g., `limit: 51` vs `limit: 50`)

### 7. "Invalid period" Errors

Valid periods: `today`, `week`, `month`, `quarter`, `year`

Invalid: `last_week`, `this_week`, `current_week`

### 8. V2 Migration

```javascript
// ❌ Old: create_task({ name: 'Task' })
// ✅ New: manage_task({ operation: 'create', name: 'Task' })
```

### JXA whose() Constraints

- No "not null" queries (use `{_not: null}`)
- String operators: `_contains`, `_beginsWith`, `_endsWith`
- Date operators: `>`, `<` (not underscores)
- Complex queries timeout on large databases

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
