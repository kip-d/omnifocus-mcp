# v2.0.0-alpha.1 Testing Protocol for Claude Desktop

## Instructions for Tester

Please run through this comprehensive test suite with the OmniFocus MCP v2.0.0-alpha.1 server. After each test, note the response time, any errors, and whether the new features are working as expected.

## Test 1: Basic Tool Discovery
**Goal**: Verify the new consolidated tools are available

Please list all available MCP tools and confirm you can see:
1. A tool called `tasks` (not `list_tasks` or `query_tasks`)
2. A tool called `projects` (not `list_projects`)
3. Count how many total tools are available (should be fewer than 20)

## Test 2: Summary-First Responses
**Goal**: Verify summaries appear before data for quick processing

Run these commands and tell me if you get a summary FIRST (before the task list):

1. Show me my overdue tasks
2. What do I need to do today?
3. What tasks are coming up in the next 3 days?

For each, please note:
- Did you get a summary with counts?
- Were there any "insights" provided?
- Did you see a "preview" of just a few tasks?
- How many total tasks were returned (should be ≤25, not 100)?

## Test 3: Natural Language Date Support
**Goal**: Test if natural language dates work without conversion

Try these queries using natural language dates:
1. Show me tasks due by tomorrow
2. Find tasks due by next Friday
3. What's due by the end of this week?

Please confirm:
- Did the natural language dates work directly?
- Or did you have to convert them to ISO format first?
- Any errors about date formats?

## Test 4: Mode-Based Task Queries
**Goal**: Test the new unified `tasks` tool with different modes

Try each mode and report the response time:
1. Use mode "overdue" to get overdue tasks
2. Use mode "today" for today's agenda  
3. Use mode "upcoming" for next 7 days
4. Use mode "search" to find tasks with "email" in the name
5. Use mode "available" for GTD next actions
6. Use mode "blocked" for blocked tasks

For each mode:
- Did it work on the first try?
- Was the response under 8 seconds total?
- Did you get helpful information in the summary?

## Test 5: Projects Tool Operations
**Goal**: Test the consolidated projects tool

Try these project operations:
1. List all active projects (operation: "active")
2. Show projects needing review (operation: "review")
3. Get all projects with summary (operation: "list")

Check:
- Do you get a project summary with counts?
- Is there a "key_insight" about project status?
- Any mention of overdue reviews?

## Test 6: Error Prevention & Recovery
**Goal**: Test if errors provide helpful suggestions

Intentionally trigger these errors:
1. Try search mode WITHOUT providing a search term
2. Try to create a task with tags (should fail but suggest workaround)
3. Use an invalid mode like "xyz" for the tasks tool

For each error:
- Did you get a clear error message?
- Was there a "suggestion" on how to fix it?
- Did you have to retry, or could you fix it immediately?

## Test 7: Response Time Comparison
**Goal**: Measure end-to-end response time

Time these operations from when you send the request to when you finish processing the response:

1. Get 25 overdue tasks and summarize them for the user
2. Find the most important task to work on right now
3. Show a weekly task summary

For each:
- Total time from request to your final answer: _____ seconds
- Did you need to make multiple tool calls?
- Any retries needed?

## Test 8: Tool Selection Accuracy
**Goal**: Test if you pick the right tool immediately

For these user requests, note which tool you chose FIRST:
1. "What's overdue?"
2. "Show me my projects"
3. "I need to create a new task"
4. "What should I work on next?"
5. "Find all tasks about the budget report"

Success criteria:
- Did you pick the right tool on first try?
- Any confusion between similar tools?
- How long did tool selection take?

## Test 9: Handling Large Result Sets
**Goal**: Test performance with many items

1. Get ALL tasks (mode: "all", limit: 200)
2. Note: Do you get just 25 by default or did it return 200?
3. How long did it take to process the response?
4. Was the summary still helpful with large data?

## Test 10: Breaking Changes Check
**Goal**: Verify v1 tools still work for compatibility

Try using an OLD tool name:
1. Use `list_tasks` (v1 tool) - does it still work?
2. Use `get_overdue_tasks` (v1 tool) - does it work?

This confirms backward compatibility is maintained.

---

## Final Report Template

Please provide a summary report:

### Overall Performance
- **Average response time**: ___ seconds (target: <8s)
- **First-try success rate**: ___% (target: >90%)
- **Tools available**: ___ total (target: <20)

### New Features Working
- [ ] Summary-first responses
- [ ] Natural language dates
- [ ] Mode-based task queries
- [ ] Operation-based project queries
- [ ] Helpful error suggestions
- [ ] Preview data (first 5 items)
- [ ] Insights generation
- [ ] Reduced default limits (25 not 100)

### Issues Encountered
1. [Describe any errors or unexpected behavior]
2. [Note any timeouts or slow responses]
3. [List any confusing aspects]

### Comparison to v1.x Experience
- Tool selection: [Faster/Same/Slower]
- Response processing: [Faster/Same/Slower]
- Error recovery: [Better/Same/Worse]
- Overall experience: [Better/Same/Worse]

### Recommendations
[Any suggestions for improvement]

---

## Notes for Analysis

The key metrics we're measuring:
1. **End-to-end time** (not just query time)
2. **First-try success** (no retries)
3. **Tool selection speed** (less confusion)
4. **Response processing speed** (summary helps)
5. **Error recovery** (suggestions prevent retries)

Target improvements over v1.x:
- 60-70% faster total experience
- 90%+ first-try success
- Zero retries for common operations
- Instant tool selection (no confusion)

Thank you for testing v2.0.0-alpha.1!