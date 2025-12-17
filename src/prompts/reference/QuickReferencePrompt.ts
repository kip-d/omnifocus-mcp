import { BasePrompt } from '../base.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const QUICK_REFERENCE = `
# OmniFocus MCP Quick Reference

## Essential Tools by Speed

### Instant (<100ms) - Cached
- \`tasks({ mode: 'all', limit: 1, details: false })\` - Quick count
- Previously called tools (cache hits)

### Fast (100-300ms)
- \`tags({ operation: 'list', namesOnly: true })\` - ~130ms
- \`tags({ operation: 'list', fastMode: true })\` - ~270ms
- \`tags({ operation: 'active' })\` - Tags with tasks only
- \`tasks({ mode: 'today', details: false })\` - ~500ms

### Normal (300ms-1s)
- \`tasks({ mode: 'all', details: false })\` - ~700ms
- \`projects({ operation: 'list', includeStats: false })\` - ~800ms
- \`tasks({ mode: 'overdue' })\` - Optimized queries
- \`tasks({ mode: 'upcoming' })\` - Next N days

### Slower (1s+)
- \`tasks({ mode: 'all', details: true })\` - Full analysis
- \`projects({ operation: 'stats' })\` - With metrics
- \`tags({ operation: 'list', includeUsageStats: true })\` - ~3s
- Analytics tools - Complex calculations

## Must-Know Limitations

1. **Tags on Creation**: ✅ NOW SUPPORTED (v2.0.0+)
   \`\`\`javascript
   // Single step works!
   const task = await manage_task({ 
     operation: 'create',
     name: "Task", 
     tags: ["work", "urgent"]
   });
   \`\`\`

2. **Period Values**: Exact strings only
   - ✅ "today", "week", "month", "quarter", "year"  
   - ❌ "last_week", "this_week", "current_week"

3. **Date Format**: Local time
   - "2024-01-15" or "2024-01-15 14:30"

4. **Project IDs**: Use strings from projects tool
   - Not numeric IDs from Claude Desktop

## Performance Cheat Sheet

| Operation | Fast Way | Slow Way |
|-----------|----------|----------|
| Today's tasks | \`tasks({ mode: 'today' })\` | \`tasks({ mode: 'all' })\` + filter |
| Tag dropdown | \`tags({ operation: 'list', namesOnly: true })\` | \`tags({ operation: 'list' })\` |
| Active tags | \`tags({ operation: 'active' })\` | \`tags({ operation: 'list' })\` + filter |
| Overdue | \`tasks({ mode: 'overdue' })\` | \`tasks({ mode: 'all' })\` + dates |
| Task count | \`tasks({ mode: 'all', details: false, limit: 1 })\` | \`tasks({ mode: 'all' })\` + length |
| Quick list | \`tasks({ details: false })\` | \`tasks({ details: true })\` |

## Cache Durations
- Tasks: 30 seconds
- Projects: 5 minutes
- Tags: 5 minutes  
- Analytics: 1 hour
- Active tags: 1 minute

## Available Prompts (5 GTD-focused)
1. \`gtd_principles\` - Core GTD methodology guide
2. \`gtd_process_inbox\` - Process inbox using pure GTD (2-minute rule)
3. \`eisenhower_matrix_inbox\` - Process inbox using priority quadrants
4. \`gtd_weekly_review\` - Complete weekly review workflow
5. \`quick_reference\` - This essential reference guide

## Emergency Commands
\`\`\`javascript
// Test connection
await system({ operation: 'diagnostics' });

// Check version
await system({ operation: 'version' });

// Minimal test
await tasks({ mode: 'all', limit: 1, details: false });

// Force fresh data (bypass cache)
await tasks({ mode: 'all', limit: Math.floor(Math.random() * 100) });
\`\`\`

Remember: Specialized tools > General tools with filters!
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
