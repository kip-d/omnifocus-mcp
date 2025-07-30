# User Feedback and MCP Limitations

Last Updated: July 25, 2025 (v1.4.0)

This document addresses common user suggestions and explains architectural limitations of the Model Context Protocol (MCP) that may not be immediately obvious to users familiar with traditional APIs or CLI tools.

## Common User Suggestions and Why They Can't Be Implemented

### 1. Progress Indicators for Long Operations

**User Request**: "Consider adding progress indicators for long-running operations (>10 seconds)"

**Why This Isn't Possible**: 
MCP is a request-response protocol, not a streaming protocol. The architecture works as follows:
- Client sends a request
- Server processes the request (however long it takes)
- Server sends back a single response

There is no mechanism for:
- Sending intermediate progress updates
- Streaming partial results
- WebSocket-style real-time communication
- Progress bars or status updates

**What We Do Instead**:
- Include `query_time_ms` in responses so users know how long operations took
- Implement aggressive caching to avoid repeated long operations
- Add configurable limits to prevent extremely long queries
- Document expected performance characteristics

### 2. Real-time Updates or Notifications

**Why This Isn't Possible**: 
MCP servers are stateless and only respond to requests. They cannot:
- Push notifications to clients
- Watch for changes in OmniFocus
- Send unsolicited updates

**What We Do Instead**:
- Cache invalidation on write operations ensures data consistency
- Fast polling can be implemented on the client side if needed

### 3. Batch Progress Updates

**User Expectation**: When processing multiple items, show progress like "Processing item 5 of 20..."

**Why This Isn't Possible**: 
The entire operation must complete before any response is sent. MCP doesn't support:
- Chunked responses
- Server-sent events
- Incremental updates

**What We Do Instead**:
- Provide summary statistics in the final response
- Break large operations into smaller chunks when possible
- Document which operations may take longer

## Key Differences from Traditional APIs and CLI Tools

### MCP vs REST APIs

| Feature | REST API | MCP |
|---------|----------|-----|
| Progress Updates | Can use SSE or WebSockets | Single response only |
| Partial Results | Can stream responses | Must wait for completion |
| Long Polling | Supported | Not applicable |
| Webhooks | Common | Not supported |

### MCP vs CLI Tools

| Feature | CLI Tool | MCP |
|---------|----------|-----|
| Progress Bars | Standard (stdout) | Not possible |
| Interactive Prompts | Common | Not supported |
| Incremental Output | Line-by-line output | Single JSON response |
| Ctrl+C Cancellation | Standard | No cancellation mechanism |

## Performance Expectations

Given these limitations, users should expect:

1. **Long operations will block** - Operations taking 45+ seconds must complete fully
2. **No feedback during processing** - The client will appear to "hang" during long operations
3. **Caching is critical** - First requests may be slow, subsequent ones should be fast
4. **Timeouts matter** - Claude Desktop has a timeout limit that we cannot exceed

## Known Performance Characteristics (v1.4.0)

Based on extensive user testing with ~2,000 tasks and 175 projects:

### Fast Operations (<1 second)
- **Basic queries**: list_tasks (624ms), list_projects (929ms)
- **Creation**: create_task (418ms), create_project (1.5s)
- **Analytics**: productivity stats, task velocity, overdue analysis
- **Simple operations**: get_version_info (112ms)

### Slow Operations (Known Limitations)
- **todays_agenda**: ~48 seconds (must scan all 2,000 tasks)
- **list_tags with usage stats**: ~40 seconds (counts usage across all tasks)
- **get_task_count**: ~25 seconds (filtered iteration)
- **update_task**: ~15-17 seconds (Task.byIdentifier fallback)
- **complete_task**: ~15 seconds (Task.byIdentifier fallback)

These are **expected behaviors** due to:
1. OmniFocus JXA API limitations (Task.byIdentifier unreliable, no filtered queries)
2. MCP architectural constraints (no progress updates)
3. Large dataset sizes requiring O(n) operations

## Workarounds and Best Practices

### For Users:
1. **Be patient** with first-time operations - they populate the cache
2. **Use filters** to reduce dataset sizes when possible
3. **Understand caching** - repeated operations are much faster

### For Developers:
1. **Set appropriate timeouts** in Claude Desktop configuration
2. **Use the cache** - it's essential for usability
3. **Add limits** to prevent runaway queries
4. **Document performance** in tool descriptions

## Future Considerations

While we cannot change MCP's fundamental architecture, potential improvements include:

1. **Smarter caching strategies** - Predictive cache warming
2. **Query optimization** - Better filtering at the JXA level
3. **Chunked operations** - Break large tasks into smaller requests
4. **Performance hints** - Warn users before long operations

## Tag Assignment Limitation

**Known Issue**: Tags cannot be assigned during task creation (JXA API limitation)

**Workaround**: Create the task first, then use `update_task` to add tags:
```javascript
// Step 1: Create task
const task = await create_task({ name: "My Task" });

// Step 2: Add tags
await update_task({ 
  taskId: task.id, 
  updates: { tags: ["Work", "Important"] }
});
```

## Summary

MCP bridges operate under different constraints than traditional APIs or CLI tools. The lack of progress indicators and streaming responses is not a limitation of our implementation, but a fundamental characteristic of the MCP protocol. Understanding these constraints helps set appropriate user expectations and guides development decisions.

### Key Takeaways for v1.4.0

1. **All 24 functions are working** - The bridge is functionally complete
2. **Performance varies by operation type** - Simple queries are fast, full scans are slow
3. **Caching is essential** - 1-minute cache makes repeated operations instant
4. **JXA API limitations are real** - We work around them where possible
5. **User workflows should adapt** - Use fast operations when possible, batch slow ones