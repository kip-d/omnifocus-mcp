import { BasePrompt } from '../base.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const COMMON_PATTERNS_GUIDE = `
# OmniFocus MCP Common Patterns & Best Practices

## Task Management Patterns

### Finding Tasks Efficiently
\`\`\`javascript
// ❌ Slow: Getting all tasks then filtering
list_tasks({ limit: 1000 }) // Then filter client-side

// ✅ Fast: Use server-side filters
list_tasks({ 
  completed: false,
  projectId: "abc123",
  dueBefore: "2024-12-31",
  skipAnalysis: true,  // 30% faster
  limit: 50
})

// ✅ Faster: Use specialized tools
get_overdue_tasks({ limit: 50 })  // 2x faster than list_tasks
todays_agenda({ includeDetails: false })  // Optimized for daily view
\`\`\`

### Task Creation with Tags (Two-Step Pattern)
\`\`\`javascript
// ❌ Won't work: Tags during creation
create_task({ 
  name: "Review report",
  tags: ["urgent", "work"]  // IGNORED due to JXA limitation
})

// ✅ Correct: Create then update
const task = await create_task({ 
  name: "Review report",
  projectId: projectId,
  dueDate: "2024-01-15 17:00"
});

await update_task({
  taskId: task.id,
  updates: { tags: ["urgent", "work"] }
});
\`\`\`

### Batch Operations Pattern
\`\`\`javascript
// ❌ Inefficient: Multiple list_tasks calls
const project1Tasks = await list_tasks({ projectId: "proj1" });
const project2Tasks = await list_tasks({ projectId: "proj2" });

// ✅ Better: Single call with post-filtering
const allTasks = await list_tasks({ 
  projectId: ["proj1", "proj2"],  // If supported
  skipAnalysis: true 
});

// ✅ Best: Use analytics for summaries
const stats = await get_productivity_stats({ 
  period: "week",
  groupBy: "project" 
});
\`\`\`

## Project Management Patterns

### Project Creation Hierarchy
\`\`\`javascript
// Folders are auto-created
const project = await create_project({
  name: "Q1 Marketing Campaign",
  folder: "Work/Marketing/2024",  // Creates all levels if needed
  status: "active",
  dueDate: "2024-03-31"
});
\`\`\`

### Moving Projects Between Folders
\`\`\`javascript
// Note: Folder moves have JXA limitations
await update_project({
  projectId: "xyz789",
  updates: {
    folder: "Archive/2023",  // May require recreation internally
    status: "completed"
  }
});
\`\`\`

## Tag Optimization Patterns

### Tag Selection for UI
\`\`\`javascript
// ❌ Slow: Full tag details for dropdown
const tags = await list_tags({ 
  includeUsageStats: true  // ~3 seconds!
});

// ✅ Fast: Names only for autocomplete
const tagNames = await list_tags({ 
  namesOnly: true  // ~130ms
});

// ✅ Faster: Active tags only for GTD
const activeTags = await get_active_tags();  // Only tags with tasks
\`\`\`

### Tag Analysis Pattern
\`\`\`javascript
// Only use full analysis when needed
if (userRequestedTagReport) {
  const tagStats = await list_tags({
    includeUsageStats: true,
    sortBy: "usage"
  });
  // Generate report...
}
\`\`\`

## Date Handling Patterns

### Working with Dates
\`\`\`javascript
// ✅ Correct: Local time strings
create_task({
  name: "Morning meeting",
  dueDate: "2024-01-15 09:00",  // Local time
  deferDate: "2024-01-14 17:00"
});

// ✅ Clear dates with flags
update_task({
  taskId: "task123",
  updates: {
    clearDueDate: true,  // Removes due date
    deferDate: "2024-01-20"  // Sets new defer
  }
});
\`\`\`

### Date Range Queries
\`\`\`javascript
// ❌ Slow: Filter all tasks
const allTasks = await list_tasks({ limit: 1000 });
const thisWeek = allTasks.filter(/* date logic */);

// ✅ Fast: Use date range tools
const thisWeek = await get_upcoming_tasks({ 
  days: 7,
  includeToday: true 
});

// ✅ Custom ranges
const quarter = await query_tasks_by_date({
  queryType: "date_range",
  startDate: "2024-01-01",
  endDate: "2024-03-31",
  dateField: "dueDate"
});
\`\`\`

## Performance Patterns

### Caching Strategy
\`\`\`javascript
// Tools cache automatically:
// - Tasks: 30 seconds
// - Projects: 5 minutes  
// - Analytics: 1 hour
// - Tags: 5 minutes

// Force fresh data by changing parameters slightly
const fresh = await list_tasks({ 
  limit: 51  // Different from cached limit: 50
});
\`\`\`

### Pagination Pattern
\`\`\`javascript
// For large datasets
let allTasks = [];
let offset = 0;
const limit = 100;

while (true) {
  const batch = await list_tasks({ 
    offset, 
    limit,
    skipAnalysis: true 
  });
  
  allTasks = allTasks.concat(batch.items);
  
  if (batch.items.length < limit) break;
  offset += limit;
}
\`\`\`

## Error Handling Patterns

### Project ID Issues
\`\`\`javascript
// ❌ Problem: Numeric IDs from some clients
update_task({ projectId: 547 });  // May fail

// ✅ Solution: Always use string IDs from list_projects
const projects = await list_projects({ search: "Marketing" });
const projectId = projects.items[0].id;  // "abc123" format
\`\`\`

### Permission Errors
\`\`\`javascript
try {
  await create_task({ name: "Test" });
} catch (error) {
  if (error.message.includes("permission")) {
    // Guide user to grant OmniFocus permissions
    console.log("Please grant automation permissions in System Settings");
  }
}
\`\`\`

## GTD Workflow Patterns

### Weekly Review
\`\`\`javascript
// 1. Get stale projects
const projects = await list_projects({
  status: ["active"],
  includeStats: true
});

const stale = projects.items.filter(p => 
  !p.modifiedDate || 
  daysSince(p.modifiedDate) > 30
);

// 2. Review overdue tasks
const overdue = await analyze_overdue_tasks({
  groupBy: "project",
  includeRecentlyCompleted: true
});

// 3. Check upcoming week
const upcoming = await get_upcoming_tasks({
  days: 7,
  includeToday: false
});
\`\`\`

### Daily Planning
\`\`\`javascript
// Morning review pattern
const agenda = await todays_agenda({
  includeFlagged: true,
  includeOverdue: true,
  includeAvailable: true,
  limit: 50  // Reasonable daily load
});

// Evening review - what got done?
const completed = await list_tasks({
  completed: true,
  completedAfter: todayStart(),
  includeDetails: true
});
\`\`\`

Remember: Choose the right tool for the job - specialized tools are always faster than general ones!
`;

export class CommonPatternsPrompt extends BasePrompt {
  name = 'common_patterns_guide';
  description = 'Best practices and common patterns for OmniFocus automation. Shows efficient vs inefficient approaches, performance tips, and real-world workflows.';
  arguments = [];

  generateMessages(_args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me common patterns and best practices for using OmniFocus MCP tools.'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: COMMON_PATTERNS_GUIDE
        }
      }
    ];
  }
}