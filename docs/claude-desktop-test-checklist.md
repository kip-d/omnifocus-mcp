# Claude Desktop Testing Checklist for OmniFocus MCP

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

### Update Task Test
```javascript
// First, get a task ID from list_tasks
// Then update it:
{
  "taskId": "example-id",
  "name": "Updated task name",
  "flagged": true,
  "dueDate": "2025-06-22T10:00:00Z"
}
```

### Tag Management Test
```javascript
// Create tag
{ "action": "create", "tagName": "test-tag" }

// Rename tag
{ "action": "rename", "tagName": "test-tag", "newName": "renamed-tag" }

// Delete tag
{ "action": "delete", "tagName": "renamed-tag" }
```

### Export Test
```javascript
// Export flagged tasks as CSV
{
  "format": "csv",
  "filter": { "flagged": true },
  "fields": ["name", "project", "dueDate", "tags"]
}
```

### Recurring Tasks Analysis
```javascript
{
  "activeOnly": true,
  "includeHistory": false,
  "sortBy": "frequency"
}
```

## Success Criteria
- All operations complete without errors
- Response times are reasonable (<10 seconds for most operations)
- Cache improves performance on repeated queries
- Error messages are clear and helpful
- Data integrity is maintained (no data loss or corruption)