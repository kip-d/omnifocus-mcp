# OmniFocus MCP v2.1.0 Comprehensive Test Guide

**For Claude Desktop Users** - Copy and paste this prompt to test all major functionality.

---

## 🧪 Comprehensive OmniFocus MCP v2.1.0 Test Suite

I need your help testing the OmniFocus MCP server v2.1.0. Please run through this comprehensive test suite systematically and report any issues. This tests all 15 consolidated tools and 5 GTD prompts.

### **Test Environment Setup**
First, verify the server is working:
```
Use the system tool to check version and diagnostics
```

### **Phase 1: Core Task Operations (V2 Consolidated Tools)**

#### 1.1 Basic Task Management
```
1. Create a test task using manage_task:
   - operation: 'create'
   - name: 'Test Task v2.1.0'
   - tags: ['test', 'urgent'] (this should work in single step!)
   - due date: tomorrow at 2pm

2. Verify the task was created by querying today's and upcoming tasks:
   - Use tasks with mode: 'today'
   - Use tasks with mode: 'upcoming', daysAhead: 3

3. Update the task:
   - Use manage_task with operation: 'update'
   - Add a note: 'Updated via v2.1.0 testing'
   - Change tags to ['test', 'completed-test']

4. Complete the task:
   - Use manage_task with operation: 'complete'
```

#### 1.2 Advanced Task Queries
```
Test all task query modes:
1. tasks({ mode: 'all', limit: 10, details: false }) - Fast overview
2. tasks({ mode: 'today' }) - Today's agenda
3. tasks({ mode: 'overdue' }) - Past due tasks
4. tasks({ mode: 'upcoming', daysAhead: 7 }) - Next week
5. tasks({ mode: 'available' }) - Currently actionable
6. tasks({ mode: 'blocked' }) - Waiting on dependencies
7. tasks({ mode: 'flagged' }) - Flagged tasks
8. tasks({ mode: 'search', search: 'important' }) - Text search
```

### **Phase 2: Project Management**

#### 2.1 Project CRUD Operations
```
1. Create a test project:
   - projects({ operation: 'create', name: 'v2.1.0 Test Project', status: 'active' })

2. Add tasks to the project:
   - Create 3 tasks using manage_task with the project ID

3. Query project tasks:
   - Use tasks({ mode: 'all', project: [project-id] })

4. Get project statistics:
   - projects({ operation: 'stats' })

5. Mark project as complete:
   - projects({ operation: 'complete', projectId: [project-id] })
```

#### 2.2 Project Organization
```
1. Create a folder hierarchy:
   - folders({ operation: 'create', name: 'Test Folder v2.1.0' })

2. Create a project in the folder:
   - projects({ operation: 'create', name: 'Folder Test Project', folder: 'Test Folder v2.1.0' })

3. List folder contents:
   - folders({ operation: 'projects', folderName: 'Test Folder v2.1.0' })
```

### **Phase 3: Tag Operations (V2.0.0+ Improvements)**

#### 3.1 Tag Performance Testing
```
Test the different tag query modes:
1. tags({ operation: 'active' }) - Only tags with tasks (fastest)
2. tags({ operation: 'list', namesOnly: true }) - Names only (~130ms)
3. tags({ operation: 'list', fastMode: true }) - IDs + names (~270ms)  
4. tags({ operation: 'list' }) - Full data (~700ms)

Time each query and verify the performance differences.
```

#### 3.2 Tag Management
```
1. Create new tags:
   - tags({ operation: 'manage', action: 'create', tagName: 'v2-test' })

2. Create nested tags:
   - tags({ operation: 'manage', action: 'nest', tagName: 'v2-test-child', parentTagName: 'v2-test' })

3. Verify tag hierarchy:
   - tags({ operation: 'list' }) and check the parent-child relationship
```

### **Phase 4: Analytics & Insights**

#### 4.1 Productivity Analytics
```
1. Get productivity stats for different periods:
   - productivity_stats({ period: 'today', includeProjectStats: true })
   - productivity_stats({ period: 'week', includeTagStats: true })

2. Analyze task velocity:
   - task_velocity({ days: 7, groupBy: 'day' })
   - task_velocity({ days: 30, groupBy: 'project' })

3. Check overdue analysis:
   - analyze_overdue({ groupBy: 'project', limit: 10 })

4. Get workflow analysis:
   - workflow_analysis({ analysisDepth: 'standard', focusAreas: ['productivity', 'workflow'] })
```

#### 4.2 Pattern Analysis (New in v2.1.0)
```
Test the new pattern analysis features:
1. analyze_patterns({ patterns: ['duplicates'] })
2. analyze_patterns({ patterns: ['dormant_projects'], options: { dormant_threshold_days: 30 } })
3. analyze_patterns({ patterns: ['tag_audit'] })
4. analyze_patterns({ patterns: ['all'] }) - Comprehensive analysis
```

### **Phase 5: Export & Data Management**

#### 5.1 Export Testing
```
1. Export tasks in different formats:
   - export({ type: 'tasks', format: 'json', filter: { completed: false, limit: 50 } })
   - export({ type: 'tasks', format: 'csv', filter: { flagged: true } })
   - export({ type: 'tasks', format: 'markdown', filter: { dueBy: 'end-of-week' } })

2. Export projects:
   - export({ type: 'projects', format: 'json', includeStats: true })

3. Test bulk export (if you have a test directory):
   - export({ type: 'all', outputDirectory: '/path/to/test/export' })
```

#### 5.2 Recurring Tasks Analysis
```
1. Analyze recurring patterns:
   - recurring_tasks({ operation: 'analyze', includeHistory: true })

2. Get pattern insights:
   - recurring_tasks({ operation: 'patterns' })
```

### **Phase 6: GTD Workflow Features**

#### 6.1 Review Management
```
1. List projects needing review:
   - manage_reviews({ operation: 'list' })

2. Mark a project as reviewed:
   - manage_reviews({ operation: 'mark_reviewed', projectId: [some-project-id] })

3. Set review schedule:
   - manage_reviews({ operation: 'set_schedule', projectId: [project-id], reviewInterval: 'weekly' })
```

#### 6.2 Perspective Queries (New!)
```
1. List available perspectives:
   - perspectives({ operation: 'list' })

2. Query a specific perspective:
   - perspectives({ operation: 'query', perspectiveName: 'Inbox', limit: 10 })
```

### **Phase 7: MCP Prompts Testing (5 Prompts)**

Test each of the 5 consolidated prompts:

#### 7.1 GTD Workflow Prompts
```
1. Access the "gtd_principles" prompt - verify it shows updated V2 tool examples
2. Try "gtd_process_inbox" - ensure it uses current tool syntax  
3. Test "eisenhower_matrix_inbox" - verify quadrant-based processing
4. Use "gtd_weekly_review" - check for comprehensive review workflow
```

#### 7.2 Reference Prompt
```
5. Access "quick_reference" prompt - verify it shows:
   - Updated tag creation capability (no longer requires workaround)
   - V2 consolidated tool syntax
   - Correct performance timings
   - Current 5-prompt set (not the old 9)
```

### **Phase 8: Cache & Performance Testing**

#### 8.1 Cache Behavior
```
1. Run the same query twice quickly and verify caching:
   - tasks({ mode: 'today', limit: 25 })
   - Check metadata.from_cache in the second response

2. Test cache invalidation by creating a task, then immediately querying:
   - Create a task due today
   - Query tasks({ mode: 'today' }) - should show the new task
```

#### 8.2 Performance Verification
```
1. Test performance claims:
   - tags({ operation: 'list', namesOnly: true }) should be ~130ms
   - tags({ operation: 'list' }) should be significantly slower
   - tasks({ mode: 'today', details: false }) should be faster than details: true

2. Check response metadata for timing information
```

### **Phase 9: Error Handling & Edge Cases**

#### 9.1 Invalid Parameters
```
Test error handling:
1. Try tasks({ mode: 'invalid' }) - should return clear error
2. Try manage_task({ operation: 'invalid' }) - should fail gracefully  
3. Try productivity_stats({ period: 'invalid' }) - should suggest valid options
```

#### 9.2 Empty Results
```
1. Search for tasks that don't exist:
   - tasks({ mode: 'search', search: 'xyznotfound123' })

2. Query non-existent project:
   - tasks({ mode: 'all', project: 'invalid-id' })
```

### **✅ Success Criteria**

The server passes if:
- ✅ All 15 tools respond without errors
- ✅ V2 consolidated tools use operation-based parameters  
- ✅ Tag creation works during task creation (v2.0.0 fix)
- ✅ All 5 prompts load and show current tool syntax
- ✅ Cache system provides performance benefits
- ✅ Response times meet documented expectations
- ✅ Analytics and pattern analysis provide useful insights

### **🚨 Report Issues**

For any failures, please report:
1. **Tool/prompt name** that failed
2. **Exact parameters** you used  
3. **Error message** received
4. **Expected vs actual behavior**
5. **Your OmniFocus database size** (approximate task/project count)

### **📊 Performance Expectations**

Based on v2.1.0 optimizations:
- Task queries: < 1 second for 2000+ tasks
- Tag queries (namesOnly): ~130ms
- Project operations: < 800ms
- Analytics: 1-5 seconds (cached for 1 hour)
- Cache hits: < 50ms

Thank you for helping test OmniFocus MCP v2.1.0! 🚀