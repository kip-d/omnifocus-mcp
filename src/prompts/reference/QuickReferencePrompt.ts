import { BasePrompt } from '../base.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const QUICK_REFERENCE = `
# OmniFocus MCP Quick Reference

## Essential Tools by Speed

### Instant (<100ms) - Cached
- \`get_task_count\` - Just counts, no data
- Previously called tools (cache hits)

### Fast (100-300ms)
- \`list_tags({ namesOnly: true })\` - ~130ms
- \`list_tags({ fastMode: true })\` - ~270ms
- \`get_active_tags()\` - Tags with tasks only
- \`todays_agenda({ includeDetails: false })\` - ~500ms

### Normal (300ms-1s)
- \`list_tasks({ skipAnalysis: true })\` - ~700ms
- \`list_projects({ includeStats: false })\` - ~800ms
- \`get_overdue_tasks()\` - Optimized queries
- \`get_upcoming_tasks()\` - Next N days

### Slower (1s+)
- \`list_tasks({ includeDetails: true })\` - Full analysis
- \`list_projects({ includeStats: true })\` - With metrics
- \`list_tags({ includeUsageStats: true })\` - ~3s
- Analytics tools - Complex calculations

## Must-Know Limitations

1. **Tags on Creation**: Not supported
   \`\`\`javascript
   // Always two steps:
   const task = await create_task({ name: "Task" });
   await update_task({ taskId: task.id, updates: { tags: ["tag"] }});
   \`\`\`

2. **Period Values**: Exact strings only
   - ✅ "today", "week", "month", "quarter", "year"  
   - ❌ "last_week", "this_week", "current_week"

3. **Date Format**: Local time
   - "2024-01-15" or "2024-01-15 14:30"

4. **Project IDs**: Use strings from list_projects
   - Not numeric IDs from Claude Desktop

## Performance Cheat Sheet

| Operation | Fast Way | Slow Way |
|-----------|----------|----------|
| Today's tasks | \`todays_agenda()\` | \`list_tasks\` + filter |
| Tag dropdown | \`list_tags({ namesOnly: true })\` | \`list_tags()\` |
| Active tags | \`get_active_tags()\` | \`list_tags\` + filter |
| Overdue | \`get_overdue_tasks()\` | \`list_tasks\` + dates |
| Task count | \`get_task_count()\` | \`list_tasks\` + length |
| Quick list | \`skipAnalysis: true\` | Default analysis |

## Cache Durations
- Tasks: 30 seconds
- Projects: 5 minutes
- Tags: 5 minutes  
- Analytics: 1 hour
- Active tags: 1 minute

## Available Prompts
1. \`gtd_weekly_review\` - Weekly review workflow
2. \`gtd_process_inbox\` - Process inbox items
3. \`tag_performance_guide\` - Tag optimization
4. \`tool_discovery_guide\` - All tools explained
5. \`common_patterns_guide\` - Best practices
6. \`troubleshooting_guide\` - Fix common issues
7. \`quick_reference\` - This guide

## Emergency Commands
\`\`\`javascript
// Test connection
await run_diagnostics();

// Check version
await get_version_info();

// Minimal test
await get_task_count({ limit: 1 });

// Force fresh data
await list_tasks({ limit: Math.random() * 100 });
\`\`\`

Remember: Specialized tools > General tools with filters!
`;

export class QuickReferencePrompt extends BasePrompt {
  name = 'quick_reference';
  description = 'Quick reference card with essential performance tips, limitations, and emergency commands. Perfect for keeping handy during development.';
  arguments = [];

  generateMessages(_args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me a quick reference for OmniFocus MCP.'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: QUICK_REFERENCE
        }
      }
    ];
  }
}