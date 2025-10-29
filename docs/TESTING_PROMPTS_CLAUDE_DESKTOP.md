# Claude Desktop Test Prompt for OmniFocus MCP v2.1.0

**Copy and paste this entire message into Claude Desktop to begin comprehensive testing:**

---

# 🧪 OmniFocus MCP v2.1.0 Test Session

**🚨 Important for Claude Desktop**: Users will provide dates in natural language ("tomorrow", "next Friday"). You must convert these to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` format before calling manage_task. The tool schema validates date formats strictly.

I need your help systematically testing the OmniFocus MCP server v2.1.0. Please execute this test plan step by step, reporting results and any issues you encounter.

## **Phase 1: Server Health Check**
Start by verifying the server is working:
- Use `system({ operation: 'version' })` to check version info
- Use `system({ operation: 'diagnostics' })` for health check

## **Phase 2: Core V2 Tool Testing**

### **Task Management (Major v2.0.0+ Improvement)**
Test the consolidated task management:

1. **Create a task with tags** (this was broken in v1.x, fixed in v2.0.0):

   **You can say in natural language**: "Create a task called 'v2.2.0 Test Task' with tags test and urgent, due tomorrow"

   **Expected: You should convert to**:
   ```
   manage_task({
     operation: 'create',
     name: 'v2.2.0 Test Task',
     tags: ['test', 'urgent'],
     dueDate: '2025-10-29'  // You convert "tomorrow" to YYYY-MM-DD
   })
   ```

   **Critical**: The tool schema requires `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` format. When users say "tomorrow", "next Friday", etc., you must convert to the proper date format before calling manage_task.

2. **Query tasks using different modes**:
   - `tasks({ mode: 'today' })` - Today's tasks
   - `tasks({ mode: 'upcoming', daysAhead: 7 })` - Next week
   - `tasks({ mode: 'overdue' })` - Past due
   - `tasks({ mode: 'available' })` - Actionable now
   - `tasks({ mode: 'search', search: 'test' })` - Text search

3. **Update and complete the task**:
   ```
   manage_task({
     operation: 'update', 
     taskId: '[task-id-from-step-1]',
     note: 'Updated via v2.1.0 testing'
   })
   
   manage_task({
     operation: 'complete',
     taskId: '[task-id-from-step-1]'
   })
   ```

### **Project Operations**
4. **Test project management**:
   - `projects({ operation: 'list', limit: 10 })`
   - `projects({ operation: 'create', name: 'Test Project v2.1.0' })`
   - `projects({ operation: 'stats' })` - Get project statistics

### **Tag Performance Testing**
5. **Test the tag optimization claims**:
   - `tags({ operation: 'active' })` - Only tags with tasks (fastest)
   - `tags({ operation: 'list', namesOnly: true })` - Should be ~130ms
   - `tags({ operation: 'list' })` - Full data, should be slower

Compare the response times and verify the performance difference.

## **Phase 3: Analytics & New Features**

### **Productivity Analytics**
6. **Test analytics tools**:
   - `productivity_stats({ period: 'week', includeProjectStats: true })`
   - `task_velocity({ days: 7, groupBy: 'day' })`
   - `analyze_overdue({ groupBy: 'project', limit: 5 })`

### **Pattern Analysis (New in v2.1.0)**
7. **Test the new pattern analysis**:
   - `analyze_patterns({ patterns: ['duplicates'] })`
   - `analyze_patterns({ patterns: ['dormant_projects'], options: { dormant_threshold_days: 30 } })`

## **Phase 4: GTD Workflow Features**

### **Reviews & Perspectives**  
8. **Test GTD-specific tools**:
   - `manage_reviews({ operation: 'list' })` - Projects needing review
   - `perspectives({ operation: 'list' })` - Available perspectives
   - `perspectives({ operation: 'query', perspectiveName: 'Inbox', limit: 10 })`

### **Export Testing**
9. **Test data export**:
   - `export({ type: 'tasks', format: 'json', filter: { completed: false, limit: 20 } })`
   - `export({ type: 'projects', format: 'csv' })`

## **Phase 5: MCP Prompts Testing**

### **Test All 5 Prompts**
10. **Access each prompt** (use the + button in Claude Desktop):
    - `gtd_principles` - Should show V2 tool syntax
    - `gtd_process_inbox` - Pure GTD methodology  
    - `eisenhower_matrix_inbox` - Priority quadrants
    - `gtd_weekly_review` - Weekly review workflow
    - `quick_reference` - Should show updated capabilities (tag creation now works!)

## **Phase 6: Performance & Cache Testing**

### **Verify Performance Claims**
11. **Test caching behavior**:
    - Run `tasks({ mode: 'today' })` twice quickly
    - Second response should show `from_cache: true` in metadata
    
12. **Test performance optimization**:
    - Compare `tasks({ mode: 'today', details: false })` vs `details: true`
    - Verify faster queries complete in < 1 second

## **Phase 7: Error Handling**

### **Test Edge Cases**
13. **Verify graceful error handling**:
    - `tasks({ mode: 'invalid_mode' })` - Should return clear error
    - `manage_task({ operation: 'invalid' })` - Should fail gracefully
    - `productivity_stats({ period: 'invalid' })` - Should suggest valid options

---

## **Success Checklist**
Please confirm:
- [ ] All 15 tools respond without errors
- [ ] Tag creation works during task creation (single step)  
- [ ] V2 tools use operation-based parameters correctly
- [ ] All 5 prompts load and show current tool syntax
- [ ] Performance meets expectations (< 1s for most queries)
- [ ] Analytics provide useful insights
- [ ] Cache system provides performance benefits
- [ ] Error messages are helpful and clear

## **Reporting**
For any issues, please note:
1. **Which tool/step failed**
2. **Exact parameters used**
3. **Error message received** 
4. **Your database size** (approx. task/project count)

Let's start with Phase 1 - checking server health!