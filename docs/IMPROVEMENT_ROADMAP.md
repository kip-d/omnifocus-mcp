# OmniFocus MCP Server - Improvement Roadmap

*Generated: September 19, 2025*
*Status: Post-cleanup analysis - codebase unified and ready for enhancements*

This document outlines potential improvements to enhance the OmniFocus MCP server's performance, usability, and feature completeness. Each improvement includes implementation approach and impact assessment.

## 🚀 High-Impact Improvements

### 1. Performance Optimization

#### Cache Warming on Startup
**Problem**: Cold start delays when accessing projects/tags for the first time
**Solution**: Pre-populate cache with frequently accessed data during server initialization
**Impact**: Eliminates 1-3 second delays on first queries
**Implementation**:
```typescript
// Add to server startup sequence
await Promise.all([
  cache.warm('projects', () => projectsTool.listAll()),
  cache.warm('tags', () => tagsTool.listAll()),
  cache.warm('perspectives', () => perspectivesTool.listAll())
]);
```

#### Batch Operation Tools
**Problem**: Creating/updating multiple items requires separate API calls
**Solution**: Single tools that handle multiple operations atomically
**Impact**: 10x faster for bulk operations, reduced API surface
**Implementation**:
- `batch_create_tasks` - Create multiple tasks in one call
- `batch_update_tasks` - Update multiple tasks with different changes
- `batch_move_tasks` - Move multiple tasks between projects efficiently

#### Query Result Pagination
**Problem**: Large datasets (2000+ tasks) cause timeouts and memory issues
**Solution**: Implement cursor-based pagination with configurable page sizes
**Impact**: Handle unlimited dataset sizes reliably
**Implementation**:
```typescript
{
  "tool": "tasks",
  "arguments": {
    "limit": 50,
    "cursor": "eyJpZCI6InRhc2stMTIzIiwidGltZSI6MTY5NDA0MDAwMH0=",
    "mode": "all"
  }
}
```

#### Smart Cache Invalidation
**Problem**: Cache clears everything on any write operation
**Solution**: Granular cache keys that only invalidate affected data
**Impact**: Better cache hit rates, faster subsequent queries
**Implementation**:
- Project-specific cache keys: `tasks:project:abc123`
- Tag-specific cache keys: `tasks:tag:work`
- Time-based cache keys: `tasks:today`, `tasks:overdue`

### 2. Developer Experience

#### Enhanced Error Messages
**Problem**: Generic error messages don't help users diagnose issues
**Solution**: Context-aware error messages with actionable guidance
**Impact**: Faster troubleshooting, better user experience
**Implementation**:
```typescript
// Instead of: "Script execution failed"
// Provide: "OmniFocus is not running. Please launch OmniFocus and grant accessibility permissions in System Preferences > Privacy & Security > Accessibility."

// Error message enhancement categories:
// - Permission issues → Link to setup guide
// - OmniFocus not running → Launch instructions
// - Script timeouts → Database optimization suggestions
// - Invalid parameters → Format examples
```

#### Structured Logging with Correlation IDs
**Problem**: Difficult to trace requests through complex operations
**Solution**: Structured logging with request correlation and timing
**Impact**: Faster debugging, better observability
**Implementation**:
```typescript
const correlationId = generateId();
logger.info('Tool execution started', {
  correlationId,
  tool: 'tasks',
  userId: 'anonymous',
  parameters: sanitizeForLogging(args)
});
```

#### Tool Usage Analytics
**Problem**: Don't know which features are most valuable to optimize
**Solution**: Anonymous usage tracking with performance metrics
**Impact**: Data-driven optimization priorities
**Implementation**:
- Track tool usage frequency
- Measure execution times by tool and parameter combinations
- Identify performance bottlenecks in real usage
- Export analytics via dedicated tool

#### Auto-Recovery Mechanisms
**Problem**: Transient failures require manual retry
**Solution**: Intelligent retry with exponential backoff
**Impact**: Better reliability, fewer user-visible failures
**Implementation**:
- Detect recoverable vs. permanent failures
- Retry with backoff for script timeouts, permission errors
- Circuit breaker pattern for repeated failures
- Graceful degradation when OmniFocus is busy

### 3. Feature Completeness

#### Advanced Search Capabilities
**Problem**: Limited search functionality compared to OmniFocus UI
**Solution**: Full-text search with natural language query parsing
**Impact**: More powerful task discovery and organization
**Implementation**:
```typescript
// Natural language queries:
"tasks due this week in work projects"
"overdue tasks tagged urgent or important"
"completed tasks from last month with notes containing 'budget'"

// Full-text search:
"find tasks containing 'quarterly review' in name or notes"
```

#### Workflow Automation
**Problem**: Complex workflows require multiple manual tool calls
**Solution**: Composite tools that chain multiple operations
**Impact**: Simplified complex operations, better UX for common workflows
**Implementation**:
- `process_inbox` - Review, categorize, and organize inbox items
- `weekly_review` - Generate review agenda and mark projects reviewed
- `project_template` - Create project with predefined task structure
- `gtd_capture` - Intelligent task creation with automatic project/context assignment

#### Custom Field Support
**Problem**: OmniFocus custom metadata not accessible
**Solution**: Support for custom variables and metadata fields
**Impact**: Full feature parity with OmniFocus capabilities
**Implementation**:
- Expose custom variables in task/project data
- Support custom field filtering and sorting
- Allow custom field updates via API

#### Attachment Management
**Problem**: Cannot access or manage file attachments
**Solution**: Tools for attachment listing, download, and management
**Impact**: Complete task data accessibility
**Implementation**:
- List attachments with metadata (filename, size, type)
- Download attachment content (base64 encoded)
- Attachment search and filtering
- *Note: Upload capability limited by MCP protocol*

### 4. Integration & Extensibility

#### Webhook Support
**Problem**: No way to react to OmniFocus changes in external systems
**Solution**: Configurable webhooks for task/project state changes
**Impact**: Enable real-time integrations with other tools
**Implementation**:
```typescript
// Webhook configuration tool
{
  "tool": "configure_webhook",
  "arguments": {
    "url": "https://api.example.com/omnifocus-updates",
    "events": ["task.completed", "project.created"],
    "filter": { "tags": ["work"] }
  }
}
```

#### Template System
**Problem**: Repetitive project/task creation
**Solution**: Reusable templates for common structures
**Impact**: Faster setup of recurring project types
**Implementation**:
- Template definition format (JSON/YAML)
- Variable substitution in templates
- Template library with common GTD patterns
- Custom template creation and sharing

#### Plugin Architecture
**Problem**: Specific workflow needs require core changes
**Solution**: Plugin system for custom tools and behaviors
**Impact**: Extensibility without core modifications
**Implementation**:
- Plugin registration and discovery
- Sandboxed execution environment
- Plugin lifecycle management
- Standard plugin interfaces for common patterns

#### Import/Export Improvements
**Problem**: Limited format support for data exchange
**Solution**: Enhanced import/export with multiple formats
**Impact**: Better integration with other productivity tools
**Implementation**:
- JSON/YAML export with full metadata
- CSV import/export for spreadsheet compatibility
- Markdown export for documentation
- iCal export for calendar integration
- *Import formats: CSV, JSON, plain text with smart parsing*

## 🔧 Quick Wins (Same-day implementation)

### 1. Error Message Enhancement
- **Effort**: 2-3 hours
- **Files**: All tool error handling
- **Approach**: Create error message templates with context

### 2. Cache Warming
- **Effort**: 1-2 hours
- **Files**: `src/server.ts`, cache initialization
- **Approach**: Add startup cache population

### 3. Basic Usage Analytics
- **Effort**: 2-4 hours
- **Files**: `src/tools/base.ts`, new analytics tool
- **Approach**: Add execution tracking to base tool class

### 4. Simple Batch Operations
- **Effort**: 4-6 hours
- **Files**: New `BatchOperationsToolV2.ts`
- **Approach**: Wrapper around existing tools with transaction support

### 5. Structured Logging
- **Effort**: 2-3 hours
- **Files**: `src/utils/logger.ts`, all tools
- **Approach**: Add correlation ID middleware and structured format

## 📋 Implementation Priority Matrix

| Improvement | User Impact | Technical Complexity | Implementation Time |
|------------|-------------|---------------------|-------------------|
| Error Messages | High | Low | 2-3 hours |
| Cache Warming | High | Low | 1-2 hours |
| Batch Operations | High | Medium | 4-6 hours |
| Usage Analytics | Medium | Low | 2-4 hours |
| Structured Logging | Medium | Low | 2-3 hours |
| Auto-Recovery | High | Medium | 6-8 hours |
| Advanced Search | High | High | 1-2 days |
| Workflow Automation | High | High | 2-3 days |
| Webhook Support | Medium | High | 1-2 days |
| Plugin Architecture | Low | High | 3-5 days |

## 🧪 Advanced Testing & Validation

### Real LLM Integration Testing with Ollama
**Problem**: Current simulation tests use scripted workflows, not actual AI reasoning
**Solution**: Hybrid testing approach with both scripted and real LLM integration tests
**Impact**: Validate genuine AI decision-making and discover emergent tool usage patterns

#### Current Implementation (Scripted Simulation)
- **LLMAssistantSimulator class** speaks JSON-RPC 2.0 directly to MCP server
- **Hardcoded workflows** mimic realistic LLM behavior patterns
- **Full MCP protocol compliance** with initialization, tool discovery, error handling
- **Fast & deterministic** - ideal for CI/CD validation

#### Proposed Ollama Integration
```typescript
// Hybrid testing approach
describe('LLM Integration Tests', () => {
  // Fast, deterministic protocol validation (existing)
  describe('Scripted Workflows', () => { /* 14 current tests */ });

  // Slow, realistic AI reasoning validation (new)
  describe('Real LLM Workflows', () => {
    it('should handle "plan my week" with actual AI', async () => {
      const conversation = await ollama.chat([
        { role: 'system', content: 'You are a productivity assistant...' },
        { role: 'user', content: 'Help me plan my week' }
      ], { tools: await mcpServer.getToolDefinitions() });

      // Validate LLM made sensible tool choices
      expect(conversation.toolCalls).toContainLogicalSequence();
    });
  });
});
```

#### Implementation Strategy
- **Keep current tests** for fast CI/CD and deterministic validation
- **Add ollama tests** as optional deep integration tests
- **Environment flag** to enable/disable (`ENABLE_REAL_LLM_TESTS=true`)
- **Recommended models**: Phi-3-mini (3.8B), Qwen2-0.5B, Llama 3.2 1B

#### Benefits of Real LLM Testing
- **Genuine AI reasoning** about tool selection and sequencing
- **Natural language understanding** of complex user requests
- **Emergent behavior discovery** - unexpected but valid tool combinations
- **Stress testing** - non-deterministic exploration of edge cases
- **Validation of tool descriptions** - do they actually guide LLM decisions correctly?

#### Implementation Requirements
- **Effort**: 1-2 days for basic integration
- **Dependencies**: ollama installation, model management
- **Resources**: GPU/CPU for inference (even small models)
- **Test reliability**: Non-deterministic results require statistical validation

## 🎯 Recommended Next Steps

1. **Start with Quick Wins**: Error messages and cache warming for immediate impact
2. **Add Batch Operations**: High user value with reasonable complexity
3. **Implement Analytics**: Data-driven optimization foundation
4. **Experiment with Real LLM Testing**: Validate AI reasoning patterns (optional)
5. **Consider Advanced Features**: Based on user feedback and analytics data

## 📊 Success Metrics

- **Performance**: Query response time, cache hit rates, script execution time
- **Reliability**: Error rates, retry success rates, uptime
- **Usability**: Tool usage frequency, error message helpfulness scores
- **Feature Adoption**: New tool usage, workflow completion rates
- **AI Integration**: Tool selection accuracy, conversation flow quality (if implemented)

---

*This roadmap is living document. Update based on user feedback, performance data, and development priorities.*