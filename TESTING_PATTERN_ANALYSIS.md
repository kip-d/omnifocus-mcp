# Testing Pattern Analysis Feature

Thank you for helping test the new pattern analysis feature for OmniFocus MCP! This feature provides database-wide insights to help you identify duplicates, dormant projects, tag issues, and more.

## Installation Instructions

### 1. Clone and Switch to Pattern Analysis Branch

```bash
# If you haven't cloned the repo yet:
git clone https://github.com/kip-d/omnifocus-mcp.git
cd omnifocus-mcp

# If you already have the repo cloned:
cd omnifocus-mcp
git fetch origin
git checkout pattern-analysis
git pull origin pattern-analysis
```

### 2. Install Dependencies and Build

```bash
npm install
npm run build
```

### 3. Update Claude Desktop Configuration

Edit your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add or update the OmniFocus MCP configuration to point to your local build:

```json
{
  "mcpServers": {
    "omnifocus-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/omnifocus-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

**Important**: Replace `/absolute/path/to/omnifocus-mcp` with the actual path where you cloned the repository.

### 4. Restart Claude Desktop

Quit and restart Claude Desktop to load the new configuration.

## Testing the Pattern Analysis Tool

### Quick Test
Ask Claude to analyze your OmniFocus patterns:

> "Can you analyze my OmniFocus database for duplicates and dormant projects?"

### Comprehensive Test
Try these specific requests:

1. **Find duplicate tasks:**
   > "Check for duplicate tasks in my OmniFocus with at least 80% similarity"

2. **Identify dormant projects:**
   > "Find projects that haven't been updated in the last 30 days"

3. **Audit tags:**
   > "Analyze my tag usage and find underused or redundant tags"

4. **Check deadline health:**
   > "Show me overdue tasks and dates with too many deadlines"

5. **Full analysis:**
   > "Run a complete pattern analysis on my OmniFocus database"

### What to Look For

The tool will return:
- **Health Score**: 0-100 rating of your system's organization
- **Findings**: Specific issues found for each pattern
- **Recommendations**: Actionable suggestions for improvement
- **Item Details**: Specific tasks/projects that need attention

### Example Expected Output

```
Health Score: 75 (Fair)

Key Findings:
• Found 3 potential duplicate task clusters
• 5 projects haven't been modified in over 60 days
• 12 tasks are overdue
• 7 tags are rarely used (less than 3 times)

Recommendations:
• Review and merge duplicate tasks
• Archive or reactivate dormant projects
• Reschedule overdue tasks
• Consolidate underused tags
```

## Feedback Requested

Please let us know:

1. **Performance**: How long did the analysis take? Was it acceptable?
2. **Accuracy**: Were the duplicates actual duplicates? Were dormant projects truly inactive?
3. **Usefulness**: Were the insights actionable and helpful?
4. **False Positives**: Did it flag things that weren't actually issues?
5. **Missing Patterns**: What other patterns would you like to see analyzed?

## Reporting Issues

If you encounter any issues:

1. **Error messages**: Copy the exact error message
2. **Context**: What command did you give Claude?
3. **Database size**: Approximately how many tasks/projects do you have?
4. **System**: macOS version and OmniFocus version

Report issues at: https://github.com/kip-d/omnifocus-mcp/issues

## Advanced Testing (Optional)

For power users who want to test specific parameters:

```javascript
// Test with custom thresholds
{
  "tool": "analyze_patterns",
  "arguments": {
    "patterns": ["duplicates", "dormant_projects", "tag_audit"],
    "options": {
      "dormant_threshold_days": "45",
      "duplicate_similarity_threshold": "0.90",
      "max_tasks": "1000",
      "include_completed": "false"
    }
  }
}
```

You can test this directly using the MCP inspector:
```bash
npx @modelcontextprotocol/inspector dist/index.js
```

## Known Limitations

- First run may be slow on large databases (3000+ tasks)
- Duplicate detection is text-based and may miss context
- Pattern detection uses heuristics that may not match all workflows

## Rolling Back

If you need to switch back to the main branch:

```bash
git checkout main
git pull origin main
npm install
npm run build
# Restart Claude Desktop
```

## Thank You!

Your testing helps improve OmniFocus MCP for everyone. We appreciate your time and feedback!

---

**Current Version**: v2.1.0-alpha (pattern-analysis branch)  
**Main Feature**: Database-wide pattern analysis for GTD optimization