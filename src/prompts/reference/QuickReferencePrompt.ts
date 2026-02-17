import { BasePrompt } from '../base.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const QUICK_REFERENCE = `
# OmniFocus MCP Quick Reference

## Unified API (v3.0.0)

Four tools: \`omnifocus_read\`, \`omnifocus_write\`, \`omnifocus_analyze\`, \`system\`

### Reading Data
\`\`\`javascript
// Today's tasks
omnifocus_read({ query: { type: "tasks", mode: "today", limit: 20 } })

// Inbox items
omnifocus_read({ query: { type: "tasks", filters: { project: null }, limit: 10 } })

// Count only (33x faster for "how many" questions)
omnifocus_read({ query: { type: "tasks", filters: { flagged: true }, countOnly: true } })

// Overdue
omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 50 } })

// Available tasks by context
omnifocus_read({ query: { type: "tasks", mode: "available", filters: { tags: { any: ["@office"] } } } })

// Projects
omnifocus_read({ query: { type: "projects", filters: { status: "active" } } })

// Tags
omnifocus_read({ query: { type: "tags" } })

// Search
omnifocus_read({ query: { type: "tasks", mode: "search", filters: { text: { contains: "budget" } } } })
\`\`\`

### Writing Data
\`\`\`javascript
// Create task
omnifocus_write({ mutation: { operation: "create", target: "task", data: {
  name: "Call client", dueDate: "YYYY-MM-DD", tags: ["@phone"]
} } })

// Complete task
omnifocus_write({ mutation: { operation: "complete", target: "task", id: "..." } })

// Update task
omnifocus_write({ mutation: { operation: "update", target: "task", id: "...", changes: {
  addTags: ["@urgent"], dueDate: "YYYY-MM-DD"
} } })

// Batch create project with tasks
omnifocus_write({ mutation: { operation: "batch", target: "task", operations: [
  { operation: "create", target: "project", data: { name: "Project", tempId: "p1" } },
  { operation: "create", target: "task", data: { name: "First step", parentTempId: "p1" } },
] } })
\`\`\`

### Analysis
\`\`\`javascript
omnifocus_analyze({ analysis: { type: "productivity_stats", params: { groupBy: "week" } } })
omnifocus_analyze({ analysis: { type: "overdue_analysis" } })
omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })
\`\`\`

## Performance Tips

| Goal | Fast Way | Slow Way |
|------|----------|----------|
| Count tasks | \`countOnly: true\` | Fetch all + count |
| Today's tasks | \`mode: "today"\` | \`mode: "all"\` + filter |
| Overdue | \`mode: "overdue"\` | \`mode: "all"\` + date compare |
| Name search | \`fastSearch: true\` | Full search (names + notes) |

## Date Format
- \`"YYYY-MM-DD"\` or \`"YYYY-MM-DD HH:mm"\` (local time)
- Never ISO-8601 with Z suffix
- Due defaults to 5:00 PM, defer defaults to 8:00 AM

## Cache Durations
- Tasks: 5 minutes
- Projects: 5 minutes
- Tags: 10 minutes
- Analytics: 1 hour

## Available Prompts (5 GTD-focused)
1. \`gtd_principles\` - Core GTD methodology guide
2. \`gtd_process_inbox\` - Process inbox using pure GTD (2-minute rule)
3. \`eisenhower_matrix_inbox\` - Process inbox using priority quadrants
4. \`gtd_weekly_review\` - Complete weekly review workflow
5. \`quick_reference\` - This essential reference guide

## System Commands
\`\`\`javascript
// Test connection
system({ operation: "diagnostics" })

// Check version
system({ operation: "version" })

// Cache stats
system({ operation: "cache", cacheAction: "stats" })
\`\`\`
`;

export class QuickReferencePrompt extends BasePrompt {
  name = 'quick_reference';
  description =
    'Quick reference card with essential performance tips, limitations, and emergency commands. Perfect for keeping handy during development.';
  arguments = [];

  generateMessages(_args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Show me a quick reference for OmniFocus MCP.',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: QUICK_REFERENCE,
        },
      },
    ];
  }
}
