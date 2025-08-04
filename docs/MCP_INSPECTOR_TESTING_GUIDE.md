# MCP Inspector Testing Guide for OmniFocus MCP Server

This guide will help you effectively test the OmniFocus MCP server using the MCP Inspector browser interface.

## Starting the MCP Inspector

1. **Build the project first** (critical!):
   ```bash
   npm run build
   ```

2. **Launch the Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector dist/index.js
   ```

3. **Access the browser interface**:
   - The browser should open automatically
   - If not, navigate to the URL shown in the terminal (usually `http://localhost:6274`)
   - You'll see the auth token in the URL - this is normal

## Understanding the Interface

The MCP Inspector has several key sections:

### 1. **Connection Status** (Top)
- Should show "Connected" in green
- If disconnected, check that OmniFocus is running

### 2. **Available Tools** (Left Panel)
- Lists all available MCP tools
- Click on any tool to see its parameters
- Tools are grouped by category:
  - **Task Operations**: `list_tasks`, `create_task`, `update_task`, etc.
  - **Project Operations**: `list_projects`, `create_project`, etc.
  - **Analytics**: `get_productivity_stats`, `analyze_overdue_tasks`, etc.
  - **Export**: `export_tasks`, `export_projects`, `bulk_export`

### 3. **Tool Testing Area** (Center)
- Input parameters for the selected tool
- Execute button to run the tool
- Response viewer showing results

### 4. **Request/Response Log** (Bottom)
- Shows raw JSON-RPC communication
- Useful for debugging

## Recommended Testing Sequence

### Phase 1: Basic Connectivity
1. **Test `get_version_info`**
   - No parameters needed
   - Should return version details
   - Confirms basic server connectivity

2. **Test `get_task_count`**
   - Parameters: `{"completed": false}`
   - Should return count quickly
   - Confirms OmniFocus connection

### Phase 2: Read Operations
3. **Test `list_tasks` with various filters**
   ```json
   {
     "completed": false,
     "limit": 5
   }
   ```
   
   Then try with performance options:
   ```json
   {
     "completed": false,
     "limit": 10,
     "skipAnalysis": true,
     "includeDetails": false
   }
   ```

4. **Test `todays_agenda`**
   ```json
   {
     "includeFlagged": true,
     "includeOverdue": true,
     "limit": 10,
     "includeDetails": false
   }
   ```

5. **Test tag operations**
   - `list_tags`: `{"fastMode": true}`
   - `get_active_tags`: `{}` (no parameters)

### Phase 3: Performance Testing
6. **Compare performance with different options**:
   
   **Full detail query**:
   ```json
   {
     "completed": false,
     "limit": 50,
     "includeDetails": true,
     "skipAnalysis": false
   }
   ```
   
   **Optimized query**:
   ```json
   {
     "completed": false,
     "limit": 50,
     "includeDetails": false,
     "skipAnalysis": true
   }
   ```

### Phase 4: Write Operations
7. **Create a test task**:
   ```json
   {
     "name": "MCP Inspector Test Task",
     "note": "Created via MCP Inspector testing",
     "flagged": true,
     "dueDate": "2025-08-10"
   }
   ```
   
   Note the returned task ID for next steps.

8. **Update the task** (use the ID from step 7):
   ```json
   {
     "taskId": "YOUR_TASK_ID_HERE",
     "updates": {
       "tags": ["test", "mcp-inspector"],
       "note": "Updated via MCP Inspector"
     }
   }
   ```

9. **Complete the task**:
   ```json
   {
     "taskId": "YOUR_TASK_ID_HERE"
   }
   ```

### Phase 5: Export Testing
10. **Test export formats**:
    
    **JSON export**:
    ```json
    {
      "format": "json",
      "filter": {
        "completed": false,
        "limit": 5
      }
    }
    ```
    
    **CSV export**:
    ```json
    {
      "format": "csv",
      "filter": {
        "completed": false,
        "limit": 5
      }
    }
    ```
    
    **Markdown export**:
    ```json
    {
      "format": "markdown",
      "filter": {
        "completed": false,
        "limit": 10
      }
    }
    ```

### Phase 6: Analytics Testing
11. **Test productivity stats**:
    ```json
    {
      "period": "week"
    }
    ```

12. **Test overdue analysis**:
    ```json
    {
      "includeCompletedOverdue": false,
      "groupBy": "project"
    }
    ```

## Key Performance Metrics to Watch

When testing, pay attention to these in the response metadata:

1. **`query_time_ms`** - Total query execution time
2. **`from_cache`** - Whether results came from cache
3. **`tasks_scanned`** - Number of tasks processed
4. **`filter_time_ms`** - Time spent filtering
5. **`analysis_time_ms`** - Time for recurring task analysis

## Expected Performance Benchmarks

Based on recent optimizations:

- **`list_tasks` (10 items)**: ~1-2 seconds
- **`get_active_tags`**: ~2 seconds (down from 38s)
- **`todays_agenda`**: ~5-10 seconds (down from 26s)
- **`get_task_count`**: <500ms
- **Export operations**: 2-5 seconds depending on size

## Common Issues to Test For

1. **Large Dataset Performance**
   - Try `limit: 100` or more
   - Monitor response times

2. **Complex Filters**
   - Combine multiple filters
   - Test tag arrays: `{"tags": ["work", "urgent"]}`

3. **Date Handling**
   - Test various date formats
   - Check timezone conversions

4. **Cache Behavior**
   - Run same query twice
   - Second should show `"from_cache": true`

5. **Error Handling**
   - Try invalid task IDs
   - Test with malformed parameters

## Debugging Tips

1. **Check the Console** - Browser DevTools console may show additional errors
2. **Review Raw Logs** - The request/response log shows exact JSON-RPC communication
3. **Test Incrementally** - Start simple, add complexity gradually
4. **Note Response Times** - Track which operations are slow

## Testing Checklist

- [ ] Server connects successfully
- [ ] Basic read operations work
- [ ] Performance optimizations show improvement
- [ ] Write operations create/update/complete tasks
- [ ] All export formats work (JSON, CSV, Markdown)
- [ ] Analytics tools return meaningful data
- [ ] Cache is working (second identical query is faster)
- [ ] Error messages are helpful
- [ ] Large queries don't timeout
- [ ] Tag operations complete in reasonable time

## Reporting Issues

When reporting issues, please include:
1. The exact parameters used
2. The response time from metadata
3. Any error messages
4. Whether it worked previously
5. Your OmniFocus task/project count (approximate)

Happy testing! Your feedback helps improve performance and reliability.