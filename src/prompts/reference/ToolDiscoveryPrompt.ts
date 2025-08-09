import { BasePrompt } from '../base.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const TOOL_DISCOVERY_GUIDE = `
# OmniFocus MCP Tool Discovery Guide

## Quick Tool Selection by Use Case

### Task Management
- **list_tasks**: Main workhorse. Use skipAnalysis=true for 30% speed boost
- **todays_agenda**: Faster than list_tasks for daily planning (limit=50 default)
- **create_task**: Remember: no tags during creation (JXA limitation)
- **update_task**: Full updates including tags (works here!)
- **complete_task/delete_task**: Simple operations, well-cached

### Performance Optimizations
- **get_task_count**: Just counts, no data (faster than list_tasks)
- **get_overdue_tasks**: ~2x faster than list_tasks with date filters
- **get_upcoming_tasks**: Optimized for next N days view
- **get_active_tags**: Returns only tags with tasks (fast for GTD)

### Project Operations
- **list_projects**: includeStats=false by default for speed
- **create_project**: Auto-creates folders if needed
- **update_project**: Pass updates object with changed fields

### Analytics (Cached 1 hour)
- **get_productivity_stats**: Period: today|week|month|quarter|year
- **get_task_velocity**: Completion patterns and throughput
- **analyze_overdue_tasks**: Find bottlenecks by project/tag

### Tag Management
- **list_tags**: 3 modes - namesOnly (130ms), fastMode (270ms), full (700ms)
- **get_active_tags**: Just tags with incomplete tasks
- **manage_tags**: create/rename/delete/merge operations

### Bulk Operations
- **export_tasks**: JSON/CSV/Markdown with filters
- **export_projects**: With optional statistics
- **bulk_export**: Complete backup to directory

## Common Patterns

### Daily Planning
\`\`\`javascript
// Fast daily overview
todays_agenda({ includeDetails: false, limit: 50 })

// Or detailed with tags
todays_agenda({ includeDetails: true, includeFlagged: true })
\`\`\`

### Project Review
\`\`\`javascript
// Quick project list
list_projects({ includeStats: false, status: ["active"] })

// Detailed with task counts
list_projects({ includeStats: true, includeTaskCounts: true })
\`\`\`

### Task Creation Workflow
\`\`\`javascript
// Step 1: Create without tags
const task = create_task({ name: "Task", projectId: "xyz" })

// Step 2: Add tags
update_task({ taskId: task.id, updates: { tags: ["urgent", "work"] }})
\`\`\`

### Performance Tips
1. Use skipAnalysis=true on list_tasks for speed
2. Prefer get_active_tags over list_tags for GTD
3. Cache hits are instant - tools cache appropriately
4. Date range tools are ~2x faster than filtered list_tasks
5. Default limits are optimized (50 for agenda, 100 for lists)

## Parameter Formats
- Dates: Local time "2024-01-15" or "2024-01-15 14:30"
- Period: exactly "today", "week", "month", "quarter", or "year"
- Status: "active", "onHold", "completed", "dropped"
- Sort: typically "name", "dueDate", "modificationDate"
`;

export class ToolDiscoveryPrompt extends BasePrompt {
  name = 'tool_discovery_guide';
  description = 'Comprehensive guide to all OmniFocus MCP tools, their performance characteristics, and optimal usage patterns. Essential reading for efficient automation.';
  arguments = [];

  generateMessages(_args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me a guide to all available OmniFocus tools and when to use each one.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: TOOL_DISCOVERY_GUIDE,
        },
      },
    ];
  }
}
