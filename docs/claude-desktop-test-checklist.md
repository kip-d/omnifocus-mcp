# Claude Desktop Testing Checklist for OmniFocus MCP

## 🚨 CRITICAL: Direct MCP Testing Tools Available

Before using Claude Desktop, use the direct MCP testing tools for faster debugging:

### Testing Kit Files
1. `emergency-diagnostic.js` - Quick diagnostic tool for all tools
2. `test-single-tool.js` - Detailed single tool testing with timing
3. `test-suite-comprehensive.js` - Full test suite showing all tool results

### Usage Examples
```bash
# Quick diagnostic - test all tools
node emergency-diagnostic.js

# Test specific tool with details
node test-single-tool.js tasks '{"limit": 5}'

# Comprehensive suite - shows pass/fail for all tools
node test-suite-comprehensive.js
```

### MCP Testing Pattern
**IMPORTANT**: MCP graceful exit (3-400ms) indicates SUCCESS, not timeout!
- Success: Tool execution log → (optional JSON) → graceful exit
- Failure: Tool execution log → JSON error response → graceful exit

## ✅ Already Tested
1. **Today's Agenda** - Working
2. **List Projects** - Working  
3. **Create Task** - Working (simple task)
4. **Productivity Stats** - Working
5. **Search Tasks** - Working

## 🔲 Additional Features to Test

### Task Management
- [ ] **Update Task** - Modify existing task properties
- [ ] **Complete Task** - Mark tasks as completed
- [ ] **Delete Task** - Remove tasks
- [ ] **Create Task with Full Properties** - Test with due date, defer date, project assignment, tags, estimated time

### Project Management
- [ ] **Create Project** - Create new project with properties
- [ ] **Update Project** - Modify project details
- [ ] **Complete Project** - Mark project as done
- [ ] **Delete Project** - Remove project

### Tag Management
- [ ] **List Tags** - View all tags with usage statistics
- [ ] **Create Tag** - Add new tags
- [ ] **Rename Tag** - Change tag names
- [ ] **Delete Tag** - Remove unused tags
- [ ] **Merge Tags** - Combine two tags

### Analytics & Reports
- [ ] **Task Velocity** - Analyze completion rates over time
- [ ] **Overdue Analysis** - Identify patterns in overdue tasks
- [ ] **Productivity Stats by Project** - Group stats differently
- [ ] **Recurring Task Analysis** - Analyze recurring patterns

### Export Features
- [ ] **Export Tasks (JSON)** - Export filtered tasks as JSON
- [ ] **Export Tasks (CSV)** - Export for spreadsheet analysis
- [ ] **Export Projects** - Export project list with statistics
- [ ] **Bulk Export** - Export all data to files

### Advanced Filtering
- [ ] **Filter by Multiple Criteria** - Combine filters (e.g., flagged + specific project + date range)
- [ ] **Filter by Date Ranges** - Test dueBefore/dueAfter filters
- [ ] **Filter by Tags** - Test tag-based filtering
- [ ] **Available Tasks Filter** - Get only actionable tasks

### Edge Cases & Error Handling
- [ ] **Invalid Task ID** - Test error handling for non-existent tasks
- [ ] **Large Result Sets** - Test with limit parameter
- [ ] **Empty Results** - Test searches that return no results
- [ ] **Special Characters** - Test with tasks containing emojis, quotes, etc.

### Performance & Caching
- [ ] **Cache Hit Rate** - Run same query twice to test caching
- [ ] **Response Times** - Monitor performance for different operations
- [ ] **Concurrent Requests** - Test multiple operations in quick succession

## Test Script Examples

### Update Task Test (Fixed null date handling)
```javascript
// First, get a task ID from tasks tool
// Then update it:
{
  "taskId": "example-id",
  "name": "Updated task name",
  "flagged": true,
  "dueDate": "2025-06-22 17:00"  // Use YYYY-MM-DD HH:mm format
}

// To clear a date, use empty string (NOT null):
{
  "taskId": "example-id", 
  "deferDate": ""  // This clears the defer date
}
```

### Tag Management Test (V2 format)
```javascript
// List all tags
{ "operation": "list" }

// Create tag
{ "operation": "create", "name": "test-tag" }

// Rename tag  
{ "operation": "rename", "currentName": "test-tag", "newName": "renamed-tag" }

// Delete tag
{ "operation": "delete", "name": "renamed-tag" }
```

### Export Test (V2 format)
```javascript
// Export flagged tasks as CSV
{
  "type": "tasks",
  "format": "csv", 
  "filter": { "flagged": true },
  "fields": ["name", "project", "dueDate", "tags"]
}
```

### Pattern Analysis (New V2.1.0 feature)
```javascript
{
  "analysisType": "comprehensive",
  "includeProjects": true,
  "includeTasks": true
}
```

## Success Criteria
- All operations complete without errors
- Response times are reasonable (<10 seconds for most operations)
- Cache improves performance on repeated queries
- Error messages are clear and helpful
- Data integrity is maintained (no data loss or corruption)