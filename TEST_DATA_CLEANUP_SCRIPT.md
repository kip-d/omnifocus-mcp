# 🧹 OmniFocus MCP Test Data Cleanup Script

This script provides automated cleanup commands for test data created during MCP server testing.

## Usage Instructions

1. **Identify Your Test Tag**: Replace `{timestamp}` with your actual test session timestamp
2. **Run Commands in Order**: Execute the commands sequentially as shown
3. **Verify Results**: Check that all test data has been removed

---

## Automated Cleanup Sequence

### Step 1: Inventory Test Data (Optional)
```bash
# Count test tasks
tasks mode="all" tags=["@mcp-test-{timestamp}"] limit=200

# Count test projects (manual filter needed)
projects operation="list" limit=100

# Find test folders (manual filter for "MCP Test Area")
folders operation="list"
```

### Step 2: Delete All Test Tasks
```bash
# Query all test tasks first
tasks mode="all" tags=["@mcp-test-{timestamp}"] limit=200

# For each task ID returned, run:
# manage_task operation="delete" taskId="{task-id}"

# Example automated sequence (replace IDs with actual values):
manage_task operation="delete" taskId="task-id-1"
manage_task operation="delete" taskId="task-id-2"
manage_task operation="delete" taskId="task-id-3"
# ... continue for all test tasks
```

### Step 3: Delete Test Projects
```bash
# First identify test projects by filtering results for test tag or name pattern
projects operation="list" details=true limit=100

# Delete each test project:
projects operation="delete" projectId="test-project-id-1"
projects operation="delete" projectId="test-project-id-2"
# ... continue for all test projects
```

### Step 4: Clean Up Test Folders
```bash
# Delete child folders first
folders operation="delete" folderId="child-folder-id-1"
folders operation="delete" folderId="child-folder-id-2"

# Then delete parent folders
folders operation="delete" folderId="parent-folder-id"
```

### Step 5: Remove All Test Tags
```bash
# Delete child tags first (if any were created)
tags operation="manage" action="delete" tagName="@home-test"
tags operation="manage" action="delete" tagName="@office-test"
tags operation="manage" action="delete" tagName="@errands-test"
tags operation="manage" action="delete" tagName="@high-energy-test"
tags operation="manage" action="delete" tagName="@low-energy-test"

# Delete parent tags
tags operation="manage" action="delete" tagName="@contexts-test-{timestamp}"
tags operation="manage" action="delete" tagName="@energy-test-{timestamp}"

# Delete the main test identifier tag
tags operation="manage" action="delete" tagName="@mcp-test-{timestamp}"
```

### Step 6: Verification
```bash
# Verify no test data remains
tasks mode="search" search="Test {timestamp}"
tasks mode="all" tags=["@mcp-test-{timestamp}"] limit=10

# Should return empty results if cleanup successful
```

---

## Manual Cleanup (Fallback)

If automated cleanup fails, use these manual steps in OmniFocus:

### Option 1: Tag-Based Cleanup
1. Open OmniFocus
2. Press ⌘-O (Quick Open)
3. Search for your test tag: `@mcp-test-{timestamp}`
4. Select all results with ⌘-A
5. Delete with ⌫ (Delete key)
6. Confirm deletion

### Option 2: Name-Based Cleanup
1. Use Quick Open (⌘-O)
2. Search for "Test {timestamp}" (your actual timestamp)
3. Select and delete all results
4. Search for "MCP Test Area"
5. Delete any test folders found

### Option 3: Manual Tag Cleanup
1. Go to Tags view in OmniFocus
2. Find and delete test tags:
   - `@mcp-test-{timestamp}`
   - Any child tags created during testing
3. Empty Trash to permanently remove

---

## Emergency Cleanup Commands

If you need to quickly find and remove test data:

```bash
# Nuclear option: Find everything with "test" and your timestamp
tasks mode="search" search="{timestamp}"
projects operation="list" limit=200
# Manually review and delete everything that matches your test session

# Find any remaining MCP test artifacts
tasks mode="search" search="MCP"
tasks mode="search" search="Test"
folders operation="search" searchQuery="MCP"
```

---

## Validation Commands

After cleanup, verify success with these commands:

```bash
# Should return 0 results:
tasks mode="search" search="{timestamp}"
tasks mode="all" tags=["@mcp-test-{timestamp}"] limit=1

# Check tag list doesn't contain test tags:
tags operation="list" namesOnly=true

# Verify no test projects remain:
projects operation="list" limit=50
# (manually verify no test projects visible)

# Check folders don't contain test folders:
folders operation="list"
# (manually verify no "MCP Test" folders)
```

---

## Troubleshooting

### Can't Delete Tasks
- **Issue**: "Task is in use" or similar error
- **Solution**: Complete the task first, then delete:
  ```bash
  manage_task operation="complete" taskId="{task-id}"
  manage_task operation="delete" taskId="{task-id}"
  ```

### Can't Delete Projects
- **Issue**: Project contains tasks
- **Solution**: Delete all tasks first, then project
- **Alternative**: Move tasks to inbox first:
  ```bash
  manage_task operation="update" taskId="{task-id}" projectId=""
  ```

### Can't Delete Folders
- **Issue**: Folder contains projects
- **Solution**: Delete or move projects first, then folder

### Can't Delete Tags
- **Issue**: Tag is in use by tasks
- **Solution**: Delete all tasks with tag first, then delete tag

### Partial Cleanup
- **Issue**: Some items remain after automated cleanup
- **Solution**: Use manual OmniFocus cleanup or run targeted delete commands

---

## Post-Cleanup Checklist

- [ ] All test tasks deleted
- [ ] All test projects deleted
- [ ] All test folders deleted
- [ ] All test tags deleted
- [ ] OmniFocus Trash emptied
- [ ] No search results for test timestamp
- [ ] No search results for "MCP Test"
- [ ] System runs normally
- [ ] No performance impact from testing

---

## Best Practices for Future Testing

1. **Always use unique timestamps**: Ensures easy identification and cleanup
2. **Tag everything**: Every test item should have the test tag
3. **Document test session**: Keep track of what was created
4. **Clean up immediately**: Don't let test data accumulate
5. **Verify cleanup**: Always run verification commands
6. **Use descriptive names**: Make test items easily identifiable

This cleanup script ensures that OmniFocus MCP testing doesn't pollute production data and provides multiple recovery options if automated cleanup fails.