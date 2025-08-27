# Pattern Analysis Tool - Testing Instructions

## For User Testing Group

### Getting the Latest Version

```bash
# Fetch latest changes
git fetch origin

# Switch to pattern-analysis branch
git checkout pattern-analysis

# Pull latest changes
git pull origin pattern-analysis

# Build the project
npm run build

# Verify you have commit 186b98a or later
git log --oneline -1
```

### Testing in Claude Desktop

The pattern analysis tool should now work with various parameter formats that Claude Desktop might send.

#### Test Case 1: Find Duplicate Tasks
Ask Claude to find duplicate tasks in your OmniFocus database.

Expected Claude Desktop call:
```json
{
  "patterns": ["duplicates"],
  "options": {
    "similarity_threshold": 0.85,
    "exclude_completed": true
  }
}
```

#### Test Case 2: Find Dormant Projects
Ask Claude to identify dormant projects (no activity in 90 days).

Expected Claude Desktop call:
```json
{
  "patterns": ["dormant_projects"],
  "options": {
    "dormant_threshold_days": 90,
    "exclude_completed": true
  }
}
```

#### Test Case 3: Multiple Pattern Analysis
Ask Claude to analyze your database for duplicates, stalled tasks, and orphaned tags.

Expected Claude Desktop call:
```json
{
  "patterns": ["duplicates", "stalled_tasks", "orphaned_tags"],
  "options": {}
}
```

### Known Parameter Variations

Claude Desktop may send parameters in different formats. All of these should work:

1. **Field name variations:**
   - `excludeCompleted` or `exclude_completed`
   - `similarityThreshold` or `similarity_threshold`
   - `dormantThresholdDays` or `dormant_threshold_days`

2. **Boolean negation:**
   - `excludeCompleted: true` = `include_completed: false`
   - `exclude_completed: true` = `include_completed: false`

3. **String encoding:**
   - Direct object: `{...}`
   - JSON string: `"{...}"`
   - Double-encoded: `"\"{...}\""`

### What to Report

If you encounter issues, please provide:

1. **The exact prompt you gave Claude**
   Example: "Can you find duplicate tasks in my OmniFocus database?"

2. **Any error messages** that appear in:
   - Claude Desktop UI (main chat area)
   - Upper right corner notifications (briefly appearing errors)
   - Console logs (if accessible)

3. **Your OmniFocus version**
   Get this by asking Claude to run the get_version_info tool

4. **Approximate database size**
   - Number of tasks (rough estimate)
   - Number of projects

### Troubleshooting

#### If you see "Cannot read properties of null"
1. Ensure OmniFocus is running
2. Check no modal dialogs are blocking OmniFocus
3. Try a simpler query first (e.g., just "duplicates" pattern)

#### If results are empty when they shouldn't be
1. Try without `exclude_completed` option
2. Lower the similarity threshold for duplicates
3. Check if you have any items matching the pattern

#### If Claude Desktop shows brief errors in upper right
These are usually JSON parsing issues that have been fixed. Ensure you have the latest version (commit 186b98a or later).

### Testing Script (Optional)

For developers who want to test directly:

```bash
# Test with the MCP inspector
npx @modelcontextprotocol/inspector dist/index.js

# Then call the analyze_patterns tool with:
# Tool: analyze_patterns
# Arguments:
{
  "patterns": ["duplicates"],
  "options": {
    "exclude_completed": true,
    "similarity_threshold": 0.8
  }
}
```

### Success Criteria

The tool is working correctly if:
1. It returns findings without errors
2. The findings match what you expect in your database
3. Performance is reasonable (< 30 seconds for most databases)
4. Different parameter formats all work

### Reporting Success

If everything works, please confirm:
- Which test cases you tried
- Approximate time for results
- Any patterns that were particularly useful

Thank you for testing!