# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## OmniFocus API Reference

- **Official TypeScript definitions**: `src/omnifocus/api/OmniFocus.d.ts`
- **Version**: OmniFocus 4.6.1 (182.3) on macOS 15.5
- **Generated**: 2025-07-24
- **IMPORTANT**: Always refer to these official type definitions when working with OmniFocus automation
- The definitions show all available classes, methods, and properties in the OmniFocus automation API

## Development Notes

- **TypeScript First**: This is a TypeScript project. All new code should be written in TypeScript (.ts files)
- **No JavaScript Files**: Do not create .js files for new functionality - use TypeScript
- **IMPORTANT**: This is a TypeScript project. All new code should be written in TypeScript (.ts files). Do not create .js files for new functionality - use TypeScript. This includes test files, scripts, and any other code files.
- **When creating test files or debugging scripts, always use .ts extensions and TypeScript syntax, even for quick tests or one-off scripts.**
- Before calling a project done, install the project and run integration tests (call the MCP server as Claude Desktop would do it)
- We are using Omnifocus 4.6+
- **Testing**: Use TypeScript for test files as well (e.g., .test.ts files)
- **IMPORTANT**: this is a typescript project
- **NEVER skip integration tests before considering a feature "done" or a release**

## Important Usage Notes

### Date Format Requirements
- **Use local time format**: `YYYY-MM-DD HH:mm` (e.g., "2025-03-31 17:00")
- **Avoid ISO 8601 with Z**: Don't use `2025-03-31T17:00:00.000Z` format
- **Relative dates work**: "tomorrow at 5pm", "next Monday", "in 2 weeks"
- This applies to all date fields: dueDate, deferDate, completionDate, nextReviewDate

### Known Limitations
- **Cannot move existing tasks to parents**: Tasks must be created with parentTaskId
- **Tags cannot be assigned during creation**: Create task first, then update with tags
- **Repeat rules for projects temporarily disabled**: Under investigation
- **Large database queries may be slow**: Upcoming tasks can take 30+ seconds with 2000+ tasks

## Performance Optimization - CRITICAL LEARNINGS

### ⚠️ NEVER Use JXA whose() Method
The single most important performance lesson: **JXA's whose() method is catastrophically slow**.

```javascript
// ❌ NEVER DO THIS - Takes 25+ seconds for 2000 tasks
const tasks = doc.flattenedTasks.whose({completed: false})();

// ✅ ALWAYS DO THIS - Takes <1 second for same operation
const allTasks = doc.flattenedTasks();
const tasks = [];
for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  try {
    if (!task.completed()) {
      tasks.push(task);
    }
  } catch (e) { /* skip */ }
}
```

### JavaScript Filtering Optimizations (v1.15.0)

1. **Eliminate safeGet() overhead** - Direct try/catch is 50-60% faster
2. **Use timestamps for date comparisons** - Avoid Date object creation in loops
3. **Early exit conditions** - Check most common filters first (completed, no date)
4. **Cache property access** - Store results instead of repeated function calls
5. **Bitwise operations** - Use `| 0` for fast integer math

```javascript
// ❌ OLD - Multiple overhead points
function safeGet(fn) { try { return fn(); } catch { return null; } }
if (safeGet(() => task.completed())) continue;
const dueDateObj = new Date(safeGet(() => task.dueDate()));

// ✅ NEW - Direct access with timestamps
try {
  if (task.completed()) continue;
  const dueDate = task.dueDate();
  if (!dueDate) continue;
  const dueTime = dueDate.getTime ? dueDate.getTime() : new Date(dueDate).getTime();
  if (dueTime < startTime || dueTime > endTime) continue;
} catch (e) { /* skip */ }
```

### Performance Evolution
- **v1.13.0**: 22+ seconds (broken hybrid implementation)
- **v1.14.0**: 2-6 seconds (removed whose() method)
- **v1.15.0**: <1 second (optimized JavaScript filtering)
- **Total improvement**: 95%+ faster

### skipAnalysis Parameter
Set `skipAnalysis: true` to skip recurring task analysis for additional 30% faster queries:
```javascript
// Fast query - skip recurring task analysis
list_tasks({ completed: false, limit: 50, skipAnalysis: true })
```

## Common Development Commands

```bash
# Build and Development
npm install          # Install dependencies
npm run build        # Compile TypeScript to JavaScript (required before running)
npm run dev          # Watch mode for development
npm start            # Run the compiled server from dist/

# Testing
npm test             # Run unit tests with Vitest
npm run test:integration  # Run integration tests
npm run test:all     # Run all tests (unit + integration)

# Code Quality
npm run lint         # Lint TypeScript code
npm run typecheck    # Type checking without building

# MCP Testing (preferred methods that don't open browser windows)
node tests/integration/test-as-claude-desktop.js    # Simulate Claude Desktop protocol
node tests/integration/test-list-tasks.js           # Test specific functionality
node tests/integration/test-create-task.js          # Test task creation

# MCP Inspector (opens browser window - avoid for automated testing)
npx @modelcontextprotocol/inspector dist/index.js  # Interactive browser-based testing
```

## Architecture Overview

### Project Structure
- **src/cache/**: TTL-based caching system with automatic invalidation
- **src/omnifocus/**: OmniAutomation integration layer
  - **scripts/**: TypeScript templates for JXA script generation
- **src/tools/**: MCP tool implementations organized by domain
  - **tasks/**: Task CRUD operations
  - **projects/**: Project management
  - **analytics/**: Productivity analysis tools
  - **export/**: Data export functionality
- **src/utils/**: Logging and helper utilities

### Key Design Decisions

1. **OmniAutomation Only**: Uses only official OmniFocus APIs via JavaScript for Automation (JXA)
   - No direct database access
   - All interactions through osascript execution
   - Scripts are generated from TypeScript templates

2. **Smart Caching Strategy**:
   - Tasks: 30 seconds TTL (frequently changing)
   - Projects: 5 minutes TTL (less volatile)
   - Analytics: 1 hour TTL (expensive computations)
   - Cache automatically invalidated on write operations

3. **Error Handling**: All tool operations use try-catch with McpError for proper MCP protocol errors

4. **ID Handling**: Task IDs from OmniFocus are extracted and tracked for reliable updates

## Testing Approach

### Integration Testing Challenges
- Many integration tests timeout when accessing real OmniFocus data
- Primary testing strategy:
  1. Unit tests for business logic
  2. Protocol-level testing with test-as-claude-desktop.js
  3. Manual testing with real Claude Desktop

### Running Tests
```bash
# Quick protocol test
node tests/integration/test-as-claude-desktop.js

# Test specific functionality
node tests/integration/test-list-tasks.js
node tests/integration/test-create-task.js

# Gherkin/Cucumber tests
npm run scripts/run-cucumber-tests.sh
```

## Debugging Learnings

### Technical Insights
- **MCP server failures** are often missing build artifacts rather than configuration issues - always check `dist/` directories exist before debugging protocol-level problems
- **MCP Inspector diagnostic tool** is the proper way to test servers, but build issues prevent it from even starting the server process

### Methodological Insights
- **Direct file system checks** (ls, file existence) are faster than running complex diagnostic tools when the root cause is missing compiled output
- **Build-first debugging** - run `npm run build` immediately when TypeScript MCP servers fail to load, before investigating logs or protocol issues

## Common Issues & Solutions

### Server Won't Start
1. Check if `dist/` directory exists - run `npm run build`
2. Verify node path in Claude Desktop config points to compiled `dist/index.js`
3. Check LOG_LEVEL environment variable is valid (error, warn, info, debug)

### OmniFocus Script Timeouts
- Scripts have 60-second timeout by default
- Large task lists may exceed timeout - use pagination
- Check if OmniFocus is running and not blocked by dialogs

### Task ID Issues
- OmniFocus JXA returns temporary IDs for new tasks
- IDs are extracted from script output using regex patterns
- See src/omnifocus/scripts/tasks.ts for ID handling logic

## Version 1.5.0 Release Notes (2025-07-25)

### Major Improvements
- **Fixed Critical Bugs**: todays_agenda timeout with default parameters, get_task_count undefined variable
- **Batch Operations**: Added batch update, complete, and delete for tasks
- **Date Range Queries**: New tools for querying tasks by date ranges (with JXA limitations)
- **Performance**: Reduced default limits (todays_agenda: 200→50, includeDetails: true→false)

### Known Limitations & Workarounds

#### Tag Assignment
- **Limitation**: Cannot assign tags during task creation (JXA constraint)
- **Workaround**: Create task first, then update with tags
```javascript
// Step 1: Create task
const task = await create_task({ name: "My Task" });
// Step 2: Update with tags
await update_task({ taskId: task.id, tags: ["work", "urgent"] });
```

#### JXA whose() Limitations
- **No "not null" support**: Cannot query for `{dueDate: {_not: null}}`
- **String operators**: Use underscore prefix (`_contains`, `_beginsWith`, `_endsWith`)
- **Date operators**: Use symbols (`>`, `<`, `>=`, `<=`), NOT underscores
- **Performance**: Complex queries timeout with large databases (2000+ tasks)
- See `docs/JXA-WHOSE-OPERATORS-DEFINITIVE.md` for complete reference

#### Batch Operations
- **Batch Complete**: May encounter access restrictions (individual complete works)
- **Recommendation**: Use individual operations as fallback

### Production Testing Results (v1.5.0)
- Successfully tested with 2,041 tasks, 176 projects, 104 tags
- Performance improvements from caching are significant
- Analytics tools provide valuable GTD insights
- All core functionality working as expected


### Quality Criteria:
A successful solution must:

- solve the exact problem specified (no more, no less)
- require minimal code modification
- maintain existing functionality and patterns
- be immediately implementable
- include a clear explanation of what changed and why

