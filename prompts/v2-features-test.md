# V2 Features Quick Test

Test the major V2 improvements that weren't available in V1.

## Core V2 Features to Test

### 1. 🏷️ Tag Assignment During Creation
Create a task called "V2 Tag Test" with tags: work, urgent, computer

**Expected**: Task is created with all three tags immediately (no second update needed)

### 2. 🔁 Complex Repeat Rules
Create a recurring task called "Team Standup" that repeats:
- Every Monday, Wednesday, and Friday
- At 10:00 AM
- Method: Fixed schedule

**Expected**: Task shows repeat icon and proper recurrence pattern

### 3. 📦 Task Reparenting
1. Show me tasks in my inbox
2. Pick any inbox task and move it to a specific project
3. Then move it back to the inbox (use projectId: "inbox" or null)

**Expected**: Task moves between locations successfully

### 4. 🔍 Perspective Queries
Show me tasks from my "Today" perspective (or any custom perspective)

**Expected**: Returns filtered tasks matching the perspective without changing your OmniFocus window

### 5. 📊 Enhanced Analytics
Show me productivity insights for this week including patterns and bottlenecks

**Expected**: Summary with key insights, then detailed statistics

### 6. 🚀 Consolidated Tools
Instead of asking for specific tool names, try natural requests:
- "What do I need to do today?"
- "Show me overdue tasks"
- "What tasks are available to work on?"
- "Find tasks about emails"

**Expected**: The unified 'tasks' tool handles all these with different modes

### 7. 🎯 Summary-First Responses
Ask for any list of tasks or projects

**Expected**: Response starts with a summary (counts, key points) before detailed data

### 8. ⚡ Performance Check
List 50 tasks with full details

**Expected**: Should complete in under 2 seconds

## V2 Advantages Over V1

### What's Better:
1. **Single-step operations** - Tags during creation, not after
2. **Natural language** - "What's due today?" instead of tool names
3. **Smart summaries** - Key insights before raw data
4. **Faster queries** - 95% performance improvement
5. **Richer features** - Perspectives, reparenting, complex repeats
6. **Unified interface** - Fewer tools, more capabilities

### What's Preserved:
- All V1 tools still available with `OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS=true`
- Backward compatibility maintained
- No breaking changes for existing workflows

## Quick Health Check

Run this quick check to ensure V2 is working optimally:

1. How many tools are available? (Should be ~20-25 without legacy)
2. Create a task with tags - did they apply immediately?
3. Query today's tasks - did you get a summary first?
4. Check productivity stats - are they cached (note "from_cache" in response)?

## Troubleshooting

If something doesn't work:
1. Check version: "Show me the MCP server version" (should be 2.0.0-beta.4+)
2. Run diagnostics: "Run OmniFocus diagnostics"
3. Check tool list: "List all available tools"
4. Verify no legacy: Ensure OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS is not set

All tests passing? Your V2 tools are ready for production use! 🎉