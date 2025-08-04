import { BasePrompt } from '../base.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const TROUBLESHOOTING_GUIDE = `
# OmniFocus MCP Troubleshooting Guide

## Common Issues & Solutions

### 1. "Script execution failed with code 1"
**Symptoms**: 75% of functions return this error

**Cause**: Missing IIFE wrapper after script modularization

**Solution**: Ensure all scripts have proper wrapper:
\`\`\`javascript
(() => {
  // script content
})();
\`\`\`

### 2. "Task/Project not found" with Numeric IDs
**Symptoms**: \`Project with ID '547' not found\`

**Cause**: Claude Desktop bug converting string IDs to numbers

**Solution**: 
\`\`\`javascript
// Always get fresh IDs from list operations
const projects = await list_projects({ search: "project name" });
const projectId = projects.items[0].id;  // Use this string ID
\`\`\`

### 3. Tag Assignment Fails
**Symptoms**: Tags not applied during task creation

**Cause**: JXA API limitation

**Solution**: Two-step process
\`\`\`javascript
// Step 1: Create task
const task = await create_task({ name: "Task" });
// Step 2: Update with tags
await update_task({ taskId: task.id, updates: { tags: ["tag1"] }});
\`\`\`

### 4. Slow Performance
**Symptoms**: Operations taking 3+ seconds

**Common Causes & Solutions**:

1. **Using wrong tool**:
   - ❌ \`list_tasks\` for today → ✅ \`todays_agenda\`
   - ❌ \`list_tags\` for dropdown → ✅ \`list_tags({ namesOnly: true })\`

2. **Missing performance flags**:
   - Add \`skipAnalysis: true\` to list_tasks
   - Use \`includeDetails: false\` for faster responses

3. **Requesting too much data**:
   - Use \`limit\` parameter (defaults: 50-100)
   - Avoid \`includeUsageStats\` unless needed

### 5. Permission Errors
**Symptoms**: "Failed to get OmniFocus document"

**Solution**:
1. Open System Settings → Privacy & Security → Automation
2. Enable OmniFocus for your terminal/app
3. Run diagnostic: \`run_diagnostics()\`

### 6. Date/Time Issues
**Symptoms**: Tasks created with wrong times

**Cause**: Timezone handling

**Solution**: Use local time format
\`\`\`javascript
// Correct formats:
"2024-01-15"          // Date only
"2024-01-15 14:30"    // Date and time (local)
\`\`\`

### 7. Cache-Related Issues
**Symptoms**: Not seeing recent changes

**Cache Durations**:
- Tasks: 30 seconds
- Projects: 5 minutes
- Tags: 5 minutes
- Analytics: 1 hour

**Force Refresh**: Change any parameter
\`\`\`javascript
// These hit different cache keys:
list_tasks({ limit: 50 })
list_tasks({ limit: 51 })
\`\`\`

### 8. Invalid Period Values
**Symptoms**: "Invalid period" errors

**Solution**: Use exact values
\`\`\`javascript
// ❌ Wrong:
get_productivity_stats({ period: "last_week" })
get_productivity_stats({ period: "this week" })

// ✅ Correct:
get_productivity_stats({ period: "week" })  // Current week
// Valid: "today", "week", "month", "quarter", "year"
\`\`\`

### 9. Export Failures
**Symptoms**: Empty exports or errors

**Common Issues**:
1. **Missing directory**: Ensure outputDirectory exists for bulk_export
2. **Format typos**: Use exact "json", "csv", or "markdown"
3. **Memory limits**: Use filters to reduce data size

### 10. Recurring Task Issues
**Symptoms**: Recurring tasks not showing correctly

**Solution**: Use specialized tools
\`\`\`javascript
// Don't use list_tasks for recurring analysis
const recurring = await analyze_recurring_tasks({
  activeOnly: true,
  includeHistory: true
});
\`\`\`

## Diagnostic Steps

### 1. Test Basic Connection
\`\`\`javascript
await run_diagnostics();
\`\`\`

### 2. Check Version
\`\`\`javascript
await get_version_info();
\`\`\`

### 3. Minimal Test
\`\`\`javascript
// Simplest possible operation
await get_task_count({ limit: 1 });
\`\`\`

### 4. Progressive Testing
\`\`\`javascript
// Start simple, add complexity
await list_projects({ limit: 1 });                    // Basic
await list_projects({ includeTaskCounts: true });     // With counts
await list_projects({ includeStats: true });          // Full stats
\`\`\`

## Performance Optimization Checklist

✓ Use specialized tools (todays_agenda, get_overdue_tasks)
✓ Enable skipAnalysis on list_tasks
✓ Set includeDetails: false when possible  
✓ Use appropriate limits (50-100)
✓ Choose correct tag tool (namesOnly, fastMode, get_active_tags)
✓ Avoid includeUsageStats unless required
✓ Leverage caching (repeated calls are free)
✓ Use date range tools instead of filtering

## Getting Help

1. **Enable debug logging**:
   \`LOG_LEVEL=debug\` in environment

2. **Check the docs**:
   - README.md for examples
   - CLAUDE.md for architecture
   - Type definitions in src/omnifocus/api/

3. **Run diagnostics**:
   \`run_diagnostics({ testScript: "your custom test" })\`

Remember: Most issues are either permissions, wrong tool choice, or missing performance flags!
`;

export class TroubleshootingPrompt extends BasePrompt {
  name = 'troubleshooting_guide';
  description = 'Comprehensive troubleshooting guide for OmniFocus MCP. Covers common errors, performance issues, and diagnostic steps.';
  arguments = [];

  generateMessages(_args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Help me troubleshoot issues with OmniFocus MCP.'
        }
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: TROUBLESHOOTING_GUIDE
        }
      }
    ];
  }
}