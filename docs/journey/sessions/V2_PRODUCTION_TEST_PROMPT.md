# OmniFocus MCP v2.0.0 Production Testing Protocol

## 🎯 Testing Focus Areas
This comprehensive test suite validates all v2.0.0 features with special attention to recent improvements:
- **Context-aware date defaults** (NEW: Aug 31)
- **Tag hierarchy support** (NEW: Aug 27)
- **Minimal response mode** for bulk operations (NEW: Aug 27)
- **Summary-first responses** for all queries
- **Performance optimizations** (<1 second for most operations)

---

## Phase 1: Basic Connectivity & Tool Discovery

### Test 1.1: Tool Availability
List all available MCP tools and verify you see these key tools:
- `tasks` (unified query tool)
- `projects` (consolidated project operations)
- `create_task`, `update_task`, `complete_task`, `delete_task`
- `tags` (with hierarchy support)
- `productivity_stats`, `task_velocity`, `analyze_overdue`

**Expected**: ~30-35 total tools available

### Test 1.2: Version Check
Run the system diagnostics to verify the version:
```
Use the system tool with operation="version"
```

**Expected**: Version 2.0.0 or higher

---

## Phase 2: Context-Aware Date Defaults (NEW FEATURE)

### Test 2.1: Due Date Defaults (Should be 5pm)
Create tasks with date-only format and verify 5pm default:
```
1. Create a task "Review quarterly report" due on 2025-01-15
2. Create a task "Submit budget proposal" due on 2025-02-01
```

**Verify**: Tasks created with due time at 5:00 PM (17:00) local time

### Test 2.2: Defer Date Defaults (Should be 8am)
Create tasks with defer dates and verify 8am default:
```
1. Create a task "Start tax preparation" with deferDate 2025-03-01
2. Create a task "Plan summer vacation" with deferDate 2025-04-15
```

**Verify**: Tasks deferred until 8:00 AM local time

### Test 2.3: Explicit Time Override
Create tasks with explicit times to verify they're preserved:
```
1. Create "Morning standup" due at 2025-01-20 09:30
2. Create "Lunch meeting" due at 2025-01-20 12:00
3. Create "Evening review" due at 2025-01-20 18:45
```

**Verify**: Exact times are preserved (9:30 AM, 12:00 PM, 6:45 PM)

### Test 2.4: Update Task Dates
Update existing tasks with date-only format:
```
1. Update any task to have dueDate "2025-02-14"
2. Update another task to have deferDate "2025-02-10"
```

**Verify**: Due date becomes 5pm, defer date becomes 8am

---

## Phase 3: Tag Hierarchy Management (NEW FEATURE)

### Test 3.1: Create Nested Tags
Create a tag hierarchy for project organization:
```
1. Create parent tag "Work"
2. Create child tag "Meetings" under "Work"
3. Create child tag "Reports" under "Work"
4. Create grandchild tag "Weekly" under "Meetings"
```

**Verify**: Tags show proper parent/child relationships and paths

### Test 3.2: List Tag Hierarchy
List all tags with hierarchy information:
```
Use tags tool with operation="list", includeEmpty=false, fastMode=false
```

**Verify**: 
- Tags show `path` (e.g., "Work > Meetings > Weekly")
- Tags show `level` (0 for root, 1 for children, etc.)
- Tags show `children` array if they have subtags

### Test 3.3: Assign Hierarchical Tags to Tasks
Create tasks with nested tags:
```
1. Create task "Prepare weekly report" with tags ["Work", "Reports", "Weekly"]
2. Create task "Schedule team standup" with tags ["Work", "Meetings"]
```

**Verify**: Tasks properly tagged with hierarchical tags

---

## Phase 4: Minimal Response Mode for Bulk Operations (NEW FEATURE)

### Test 4.1: Bulk Update with Minimal Response
Update multiple tasks using minimal response mode:
```
1. First, get 10-20 tasks using mode="all", limit=20
2. Update each task's tags using minimalResponse=true
3. Compare response size with and without minimalResponse
```

**Expected**: 
- With minimalResponse: ~50-100 tokens per update
- Without minimalResponse: ~500-1000 tokens per update
- 90-95% reduction in response size

### Test 4.2: Performance with Large Updates
If you have 50+ tasks, test bulk retagging:
```
1. Get 50 tasks
2. Update all of them with new tags using minimalResponse=true
3. Measure total tokens consumed
```

**Expected**: <5000 total tokens for 50 updates (vs 25,000+ without)

---

## Phase 5: Summary-First Query Responses

### Test 5.1: Overdue Task Analysis
Query overdue tasks and check summary structure:
```
Use tasks with mode="overdue", limit=25
```

**Verify summary includes**:
- Total count of overdue tasks
- Most overdue task details
- Project distribution
- Key insights about overdue patterns

### Test 5.2: Today's Agenda
Get today's tasks with insights:
```
Use tasks with mode="today"
```

**Verify summary includes**:
- Task counts by category (due, flagged, available)
- Priority recommendations
- Time estimates if available
- Suggested focus order

### Test 5.3: Productivity Statistics
Get comprehensive productivity metrics:
```
Use productivity_stats with period="week", includeProjectStats=true, includeTagStats=true
```

**Verify summary includes**:
- Completion velocity
- GTD health score
- Overdue trends
- Project/tag breakdown

---

## Phase 6: Performance Benchmarks

### Test 6.1: Query Response Times
Measure these common operations:
```
1. Get overdue tasks (mode="overdue")
2. Get today's agenda (mode="today")
3. Search for specific term (mode="search", search="meeting")
4. Get available actions (mode="available")
```

**Target**: Each query completes in <1 second

### Test 6.2: Large Dataset Performance
If your database has 1000+ tasks:
```
1. Query all tasks (mode="all", limit=100)
2. Get productivity stats for quarter
3. Analyze recurring patterns
```

**Target**: <3 seconds for large queries

---

## Phase 7: Error Handling & Recovery

### Test 7.1: Invalid Date Formats
Test error messages for date issues:
```
1. Try creating task with dueDate "next Thursday" (should work)
2. Try creating task with dueDate "2025-13-45" (invalid)
3. Try creating task with dueDate "2025-01-15T10:00:00Z" (works but discouraged)
```

**Verify**: Clear error messages with format examples

### Test 7.2: Missing Required Parameters
Test error recovery suggestions:
```
1. Use search mode without search term
2. Try to update task without taskId
3. Create task without name
```

**Verify**: Each error includes helpful recovery suggestions

---

## Phase 8: Advanced Features

### Test 8.1: Recurring Task Creation
Create complex recurring patterns:
```
1. Daily standup every weekday at 9am
2. Weekly review every Friday at 4pm
3. Monthly report on 1st Tuesday at 2pm
4. Quarterly planning every 3 months
```

**Verify**: Repeat rules properly configured

### Test 8.2: Project Review Management
Manage project reviews:
```
1. List projects needing review (operation="review")
2. Mark a project as reviewed
3. Set review schedule for a project
```

**Verify**: Review dates and intervals work correctly

### Test 8.3: Perspective Queries
Query custom perspectives:
```
1. List all available perspectives
2. Query tasks from a specific perspective
```

**Verify**: Perspectives return correct task sets

---

## Phase 9: Data Export & Integration

### Test 9.1: Export Formats
Export tasks in different formats:
```
1. Export 10 tasks as JSON
2. Export 10 tasks as CSV
3. Export 10 tasks as Markdown
```

**Verify**: Each format is properly structured

### Test 9.2: Bulk Export
Export all data for backup:
```
Use bulk_export with a test directory, format="json"
```

**Verify**: Creates tasks.json, projects.json, tags.json files

---

## Phase 10: Stress Testing

### Test 10.1: Rapid Sequential Operations
Perform 10 operations quickly:
```
1. Create 5 tasks rapidly
2. Update all 5 with tags
3. Complete 2 of them
4. Delete 1
5. Query the results
```

**Verify**: All operations succeed without errors

### Test 10.2: Complex Query Combinations
Test query with multiple filters:
```
Query tasks with:
- mode="all"
- completed=false
- tags=["Work", "Important"]
- project="Q1 Goals"
- limit=50
```

**Verify**: Filters properly combined

---

## 📊 Final Report Template

### Performance Metrics
- **Average query time**: ___ ms (target: <1000ms)
- **Bulk update efficiency**: ___% token reduction with minimalResponse
- **First-try success rate**: ___% (target: >95%)
- **Error recovery rate**: ___% (target: 100%)

### Feature Validation
#### Context-Aware Dates ✅
- [ ] Due dates default to 5pm
- [ ] Defer dates default to 8am
- [ ] Explicit times preserved
- [ ] Update operations respect context

#### Tag Hierarchy ✅
- [ ] Nested tags created successfully
- [ ] Hierarchy displayed correctly
- [ ] Path information accurate
- [ ] Children relationships maintained

#### Performance Optimizations ✅
- [ ] Minimal response mode works (90%+ reduction)
- [ ] Summary-first responses provided
- [ ] Queries complete in <1 second
- [ ] Large datasets handled efficiently

### Issues Encountered
1. [Description]
2. [Description]
3. [Description]

### User Experience Rating
- **Setup difficulty**: ⭐⭐⭐⭐⭐ (1=hard, 5=easy)
- **Response speed**: ⭐⭐⭐⭐⭐ (1=slow, 5=fast)
- **Error clarity**: ⭐⭐⭐⭐⭐ (1=confusing, 5=helpful)
- **Feature completeness**: ⭐⭐⭐⭐⭐ (1=limited, 5=comprehensive)
- **Overall satisfaction**: ⭐⭐⭐⭐⭐ (1=poor, 5=excellent)

### Recommendations for Improvement
[Your suggestions here]

---

## 🎉 Thank You!
Your testing helps ensure OmniFocus MCP v2.0.0 delivers a premium task management experience. Please share any additional feedback or use cases you'd like supported.

**Testing Date**: ___________
**Tester**: ___________
**OmniFocus Version**: ___________
**Database Size**: ~_____ tasks, ~_____ projects