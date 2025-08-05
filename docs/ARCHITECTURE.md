# Architecture Overview

This document describes the technical architecture of the OmniFocus MCP Server.

## Project Structure

```
src/
├── cache/          # TTL-based caching system
├── omnifocus/      # OmniAutomation integration layer
│   └── scripts/    # JXA script templates
├── tools/          # MCP tool implementations
│   ├── tasks/      # Task CRUD operations
│   ├── projects/   # Project management
│   ├── analytics/  # Productivity analysis
│   └── export/     # Data export functionality
├── utils/          # Logging and helper utilities
└── index.ts        # Server entry point
```

## Core Components

### OmniAutomation Layer

The heart of the system is the OmniAutomation integration:

- **OmniAutomation.ts**: Core execution engine
  - Wraps scripts with error handling
  - Manages script execution via `osascript`
  - Handles parameter substitution
  - Enforces timeouts and size limits

- **RobustOmniAutomation.ts**: Enhanced reliability
  - Connection monitoring
  - Retry logic
  - Consecutive failure tracking

- **DiagnosticOmniAutomation.ts**: Debugging support
  - Detailed logging
  - Performance metrics
  - Script execution diagnostics

### Script Templates

All OmniFocus interactions use JavaScript for Automation (JXA) templates:

- Templates use `{{placeholder}}` syntax for parameters
- Scripts are built using `buildScript()` method
- Parameters are escaped using `JSON.stringify()`
- Scripts wrapped with app initialization and error handling

Example template structure:
```javascript
export const CREATE_TASK_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskData = {{taskData}};
    
    // Script logic here
    
    return JSON.stringify(result);
  })();
`;
```

### Execution Flow

1. **Tool receives request** → validates parameters
2. **Build script** from template with parameters
3. **Execute via OmniAutomation**:
   - Spawn `osascript -l JavaScript`
   - Pipe script to stdin
   - Parse JSON response
4. **Cache results** based on operation type
5. **Return formatted response** to MCP client

### Caching System

Intelligent TTL-based caching:

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}
```

Cache invalidation:
- Automatic on TTL expiry
- Manual on write operations
- Selective by operation type

### Tool Organization

Tools follow a consistent pattern:

```typescript
export class SomeTaskTool extends BaseTool {
  async execute(args: ToolArgs): Promise<ToolResponse> {
    // 1. Validate arguments
    // 2. Check cache
    // 3. Build script
    // 4. Execute via OmniAutomation
    // 5. Cache results
    // 6. Return response
  }
}
```

## Design Decisions

### Why JXA over AppleScript?
- Better JSON handling
- Familiar JavaScript syntax
- Easier string escaping
- Modern language features

### Why stdin over command arguments?
- Avoids shell escaping issues
- No command line length limits
- Safer parameter passing
- Better for complex data

### Why separate script templates?
- Clear separation of concerns
- Easier testing and debugging
- Reusable components
- Type safety with TypeScript

### Why aggressive caching?
- OmniFocus API calls are expensive
- Most data doesn't change rapidly
- Dramatic performance improvement
- Configurable per data type

## Security Considerations

- **No direct database access**: Only official APIs
- **Parameter sanitization**: All inputs escaped
- **Script size limits**: Prevent DoS
- **Timeout protection**: Scripts limited to 120s
- **Read-only by default**: Write operations explicit

## Error Handling

Multi-layer error handling:

1. **TypeScript validation**: Parameter types
2. **Script-level try/catch**: JXA execution
3. **Process-level handling**: osascript failures
4. **MCP protocol errors**: Proper error codes

Error response format:
```javascript
{
  error: true,
  message: "Human-readable error",
  code: "ERROR_CODE",
  details: { /* context */ }
}
```

## Performance Characteristics

- **Cold start**: ~2-3s (loading OmniFocus)
- **Cached queries**: ~50ms
- **Uncached queries**: 1-3s depending on size
- **Write operations**: ~200-500ms
- **Analytics**: 3-5s (heavy computation)

## MCP Integration

Server implements standard MCP patterns:

- **Tools**: Exposed via `listTools()`
- **Prompts**: Ready but awaiting client support
- **Resources**: Not implemented (no use case)
- **Sampling**: Not implemented

## Future Architecture Considerations

### Potential Improvements
- WebSocket support for real-time updates
- Background sync process
- More granular caching
- Query optimization layer
- Batch operation improvements

### Technical Debt
- Some script duplication
- Complex error handling paths
- Cache invalidation complexity
- JXA API limitations workarounds

## Development Workflow

1. **TypeScript first**: All code in TypeScript
2. **Build required**: `npm run build` before running
3. **Test with Inspector**: Validate tool behavior
4. **Check with real OmniFocus**: Final validation
5. **Monitor performance**: Use built-in metrics