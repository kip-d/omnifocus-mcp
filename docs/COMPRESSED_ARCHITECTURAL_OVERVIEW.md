# OmniFocus MCP Server - Compressed Architectural Overview

## 🏗️ **Core Architecture**

### **Server Structure**
```
src/
├── index.ts              # MCP server entry point
├── tools/                # MCP tool implementations
├── omnifocus/            # OmniAutomation integration layer
├── cache/                # TTL-based caching system
├── utils/                # Shared utilities
└── prompts/              # Pre-built MCP prompts
```

### **Key Design Principles**
1. **Tool Consolidation** - V2 tools combine related functionality (e.g., `query_tasks` replaces 7 individual tools)
2. **Performance First** - Ultra-optimized JXA scripts with manual filtering (25x faster than `whose()`)
3. **Summary-First Responses** - Quick insights before detailed data
4. **Intelligent Caching** - TTL-based with operation-specific invalidation
5. **Error Recovery** - Helpful error messages with recovery suggestions
6. **Security First** - No direct database access, parameter sanitization, controlled tool access

## 🔧 **Core Components**

### **OmniAutomation Layer**
- **OmniAutomation.ts** - Core execution engine via `osascript -l JavaScript`
- **Script Templates** - JXA templates with `{{placeholder}}` syntax
- **Parameter Escaping** - Automatic JSON escaping and validation
- **Timeout Management** - Configurable script execution limits

### **Tool Architecture**
- **BaseTool Class** - Abstract base with Zod validation and error handling
- **Consolidated Tools** - Single tools with operation/queryType parameters
- **Response Formatting** - Standardized success/error responses with metadata
- **Cache Integration** - Automatic caching with TTL and invalidation

### **Caching System**
```typescript
Cache TTLs:
- tasks: 1 minute
- projects: 10 minutes  
- folders: 10 minutes
- analytics: 1 hour
- tags: 20 minutes
- reviews: 5 minutes
```

## 🛠️ **Tool Categories**

### **V2 Consolidated Tools (Recommended)**
1. **`tasks`** - Single tool with 9 modes (overdue, flagged, next_actions, etc.)
2. **`projects`** - Unified project operations (list, create, update, etc.)
3. **`manage_folder`** - All folder operations via `operation` parameter
4. **`manage_reviews`** - GTD review workflows
5. **`perspectives`** - OmniFocus perspective queries

### **Essential Tools (Always Available)**
- **Task CRUD** - create_task, update_task, complete_task, delete_task
- **Export Tools** - export_tasks, export_projects, bulk_export
- **Analytics** - productivity_stats, task_velocity, analyze_overdue
- **Recurring Tasks** - analyze_recurring_tasks, get_recurring_patterns

### **Legacy Tools (Deprecated)**
- All V1 tools removed in v2.0.0 for better performance
- Functionality consolidated into V2 tools

## 📜 **Script Architecture**

### **JXA Script Patterns**
```typescript
// Template structure
export const SCRIPT_NAME = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const params = {{params}};
    
    // Script logic here
    
    return JSON.stringify(result);
  })();
`;
```

### **Performance Optimizations**
- **Manual Filtering** - 25x faster than `whose()` queries
- **Early Exits** - Skip completed tasks first
- **Batch Processing** - Process multiple items in single loops
- **Timestamp Caching** - Avoid repeated Date object creation

### **Shared Helpers**
- **Safe Utilities** - `safeGet()`, `safeGetDate()`, `safeGetProject()`
- **Task Analysis** - `isTaskEffectivelyCompleted()`, `isTaskAvailable()`
- **Error Handling** - `formatError()`, `isValidDate()`

## 🔄 **Data Flow**

### **Request Processing**
1. **Tool receives request** → Zod validation
2. **Build JXA script** from template with parameters
3. **Execute via OmniAutomation** → spawn `osascript`
4. **Parse JSON response** → handle errors gracefully
5. **Cache results** → TTL-based with operation type
6. **Format response** → standardized success/error format

### **Error Handling**
- **Validation Errors** - Zod schema violations with helpful messages
- **Script Errors** - OmniFocus-specific error recovery suggestions
- **Permission Errors** - Clear instructions for granting access
- **Timeout Errors** - Performance optimization suggestions

## 🎯 **Key Patterns & Conventions**

### **Tool Implementation**
```typescript
export class ToolName extends BaseTool<SchemaType> {
  name = 'tool_name';
  description = 'Clear description of what the tool does';
  schema = SchemaType;

  async executeValidated(args: ValidatedArgs): Promise<Response> {
    const timer = new OperationTimer();
    try {
      // Tool logic here
      return createSuccessResponse('operation', data, timer.toMetadata());
    } catch (error) {
      return this.handleError(error);
    }
  }
}
```

### **Response Formatting**
```typescript
// Success response
createSuccessResponse(operation, data, {
  from_cache: false,
  query_time_ms: timer.elapsed,
  // ... other metadata
});

// Error response  
createErrorResponse(operation, errorCode, message, details, metadata);
```

### **Caching Strategy**
```typescript
// Check cache first
const cached = this.cache.get<Type>('category', cacheKey);
if (cached) return cached;

// Execute and cache
const result = await this.executeScript();
this.cache.set('category', cacheKey, result);
```

## 🚀 **Performance Characteristics**

### **Query Performance**
- **Small queries (<100 tasks)**: <100ms
- **Medium queries (100-1000 tasks)**: 100-500ms  
- **Large queries (1000+ tasks)**: 500ms-2s
- **Export operations**: 2-30s depending on data size

### **Optimization Techniques**
- **Manual filtering loops** instead of `whose()` queries
- **Early exit conditions** for completed/irrelevant tasks
- **Batch processing** of related operations
- **Intelligent caching** with operation-specific TTLs

## 🔒 **Security & Reliability**

### **Input Validation**
- **Zod schemas** for all tool parameters
- **Parameter escaping** in JXA script generation
- **Type coercion** for MCP bridge compatibility
- **Size limits** on script execution

### **Error Recovery**
- **Graceful degradation** when OmniFocus unavailable
- **Helpful error messages** with recovery steps
- **Automatic retry logic** for transient failures
- **Detailed logging** for debugging

## 📊 **Development Workflow**

### **Adding New Tools**
1. **Create tool class** extending `BaseTool`
2. **Define Zod schema** for parameter validation
3. **Implement JXA script** with performance optimizations
4. **Add to tools/index.ts** registration
5. **Write tests** in appropriate test directory

### **Testing Strategy**
- **Unit tests** - Individual tool functionality
- **Integration tests** - MCP protocol communication
- **Performance tests** - Query timing and optimization
- **Manual tests** - Real OmniFocus interaction

### **Performance Monitoring**
- **Query timing** in response metadata
- **Cache hit rates** and eviction counts
- **Script execution** success/failure rates
- **Memory usage** and cleanup intervals

## 🎯 **Common Gotchas & Solutions**

### **JXA Limitations**
- **No async/await** - Use synchronous loops
- **Limited error handling** - Wrap in try-catch blocks
- **Memory constraints** - Process in batches
- **Bridge limitations** - Use `evaluateJavascript()` for complex operations

### **Performance Issues**
- **Avoid `whose()` queries** - Use manual filtering instead
- **Limit result sets** - Use `limit` parameter consistently
- **Cache expensive operations** - Analytics and exports
- **Batch related operations** - Reduce script execution overhead

### **Error Handling**
- **Always check for null** - OmniFocus objects can be undefined
- **Use safe utilities** - `safeGet()`, `safeGetDate()`, etc.
- **Handle script failures** - Return helpful error messages
- **Log debugging info** - Include context in error responses

## 🔮 **Future Architecture Directions**

### **Planned Improvements**
- **Real-time updates** - WebSocket integration for live data
- **Advanced analytics** - Machine learning insights
- **Batch operations** - Multi-item operations in single calls
- **Plugin system** - Extensible tool architecture

### **Scalability Considerations**
- **Database optimization** - Query result caching
- **Connection pooling** - Multiple OmniFocus instances
- **Load balancing** - Distribute query load
- **Performance monitoring** - Real-time metrics collection

## ⚠️ **Technical Debt & Limitations**

### **Current Limitations**
- **Script duplication** - Some helper functions repeated across scripts
- **Complex error handling** - Multiple error handling paths in some tools
- **Memory management** - Large result sets can cause memory pressure
- **Bridge overhead** - MCP-to-JXA conversion adds latency

### **Known Issues**
- **Timeout handling** - Some long-running operations may exceed limits
- **Cache invalidation** - Complex dependencies between cached data
- **Error recovery** - Some failure modes not fully handled
- **Performance variance** - Query times can vary significantly

## 🔌 **MCP Integration Status**

### **Implemented Features**
- **Tools** - 44+ tools fully implemented and tested
- **Prompts** - Pre-built prompts for common workflows
- **Resources** - Basic resource management (limited)
- **Protocol** - Full MCP v0.1.0 compliance

### **Integration Patterns**
- **Tool registration** - Automatic discovery and registration
- **Parameter validation** - Zod schemas ensure data integrity
- **Response formatting** - Standardized MCP response structure
- **Error handling** - Consistent error response format

### **Client Compatibility**
- **Claude Desktop** - Fully tested and supported
- **Other MCP clients** - Should work with standard MCP clients
- **Protocol versioning** - Backward compatible within v0.1.0

---

**This enhanced overview incorporates insights from the existing architecture documentation and covers:**
- **Essential architecture patterns** and conventions
- **Security considerations** and technical debt
- **MCP integration status** and client compatibility  
- **Performance characteristics** and optimization techniques
- **Development workflow** and testing strategies

**For detailed implementation, refer to the specific tool files and JXA scripts.**
