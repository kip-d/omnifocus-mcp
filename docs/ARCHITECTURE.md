# OmniFocus MCP Server Architecture (V2.1.0)

This document describes the self-contained architecture implemented in v2.1.0, which eliminated delegation patterns in favor of direct implementation.

## Architecture Evolution

### V1.x: Individual Tools
- 22 separate tool files
- Direct implementation per tool
- Simple but high tool count

### V2.0.0: Consolidated with Delegation
- 15 consolidated tools
- Delegation to individual component tools
- Reduced tool count but complex routing

### V2.1.0: Self-Contained Implementation
- 15 consolidated tools
- Direct implementation in each tool
- Optimal balance of simplicity and functionality

## Self-Contained Design Principles

### 1. Direct Implementation
Each consolidated tool contains its complete implementation instead of delegating to component tools:

```typescript
// V2.0.0 - Delegation Pattern (REMOVED)
class FoldersTool extends BaseTool {
  async execute(args: FoldersArgs): Promise<ToolResponse> {
    switch (args.operation) {
      case 'create':
        return await this.manageFolderTool.execute({ operation: 'create', ...args });
      case 'list':
        return await this.queryFoldersTool.execute(args);
    }
  }
}

// V2.1.0 - Self-Contained Pattern (CURRENT)
class FoldersTool extends BaseTool {
  async execute(args: FoldersArgs): Promise<ToolResponse> {
    switch (args.operation) {
      case 'create':
        return await this.executeCreate(args);
      case 'list':
        return await this.executeList(args);
    }
  }

  private async executeCreate(args: CreateFolderArgs): Promise<ToolResponse> {
    // Direct implementation here
    const result = await this.execJson(CREATE_FOLDER_SCRIPT, args);
    return this.formatResponse(result);
  }
}
```

### 2. Eliminated Files
The following 11 individual tool files were removed in v2.1.0:

**Task Tools (4 removed)**
- `src/tools/tasks/CreateTaskTool.ts`
- `src/tools/tasks/UpdateTaskTool.ts` 
- `src/tools/tasks/CompleteTaskTool.ts`
- `src/tools/tasks/DeleteTaskTool.ts`

**Folder Tools (2 removed)**
- `src/tools/folders/QueryFoldersTool.ts`
- `src/tools/folders/ManageFolderTool.ts`

**Export Tools (3 removed)**
- `src/tools/export/ExportTasksTool.ts`
- `src/tools/export/ExportProjectsTool.ts`
- `src/tools/export/BulkExportTool.ts`

**Recurring Tools (2 removed)**
- `src/tools/recurring/AnalyzeRecurringTasksTool.ts`
- `src/tools/recurring/GetRecurringPatternsTool.ts`

### 3. Performance Benefits

**Before (V2.0.0 - Delegation)**
```
Client Request → ConsolidatedTool → ComponentTool → Script Execution
                     ↓                    ↓
                Parameter Routing → Parameter Validation → Result Formatting
```

**After (V2.1.0 - Self-Contained)**
```
Client Request → ConsolidatedTool → Script Execution
                     ↓
                Direct Implementation → Result Formatting
```

**Improvements:**
- Eliminated wrapper overhead
- Reduced parameter routing complexity  
- Simplified error handling paths
- Faster execution with fewer layers

## Current Tool Structure

### Core Tools (15 total)

**Task Operations (2)**
- `tasks` - Self-contained query implementation with 8 modes
- `manage_task` - Self-contained CRUD operations

**Project Operations (1)**
- `projects` - Self-contained project operations

**Organization (3)**
- `folders` - Self-contained folder operations (10 operations)
- `tags` - Self-contained tag management
- `manage_reviews` - Self-contained review workflow

**Analytics (5)**
- `productivity_stats` - Self-contained GTD metrics
- `task_velocity` - Self-contained velocity analysis
- `analyze_overdue` - Self-contained bottleneck analysis
- `workflow_analysis` - Self-contained workflow insights
- `analyze_patterns` - Self-contained pattern detection

**Utilities (4)**
- `export` - Self-contained export operations (fixed async issues)
- `recurring_tasks` - Self-contained recurring analysis
- `perspectives` - Self-contained perspective operations
- `system` - Self-contained system operations

## Implementation Patterns

### 1. Operation Routing
```typescript
async execute(args: ToolArgs): Promise<ToolResponse> {
  // Direct switch to implementation methods
  switch (args.operation) {
    case 'create': return await this.executeCreate(args);
    case 'update': return await this.executeUpdate(args);
    case 'delete': return await this.executeDelete(args);
    default: return this.errorResponse(`Unknown operation: ${args.operation}`);
  }
}
```

### 2. Script Execution
```typescript
private async executeOperation(args: OperationArgs): Promise<ToolResponse> {
  try {
    // Direct script execution
    const result = await this.execJson(OPERATION_SCRIPT, args);
    
    if (isScriptSuccess(result)) {
      return this.successResponse(result.data);
    } else {
      return this.errorResponse(result.error);
    }
  } catch (error) {
    return this.errorResponse(`Script execution failed: ${error}`);
  }
}
```

### 3. Response Formatting
```typescript
private successResponse(data: any): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        data,
        metadata: {
          operation_time_ms: Date.now() - this.startTime,
          from_cache: false
        }
      })
    }]
  };
}
```

## Migration Path

### For Developers

**No Breaking Changes**: All tool signatures and responses remain identical. The consolidation is internal only.

**Test Updates**: Test mocking patterns needed updates:
```typescript
// V2.0.0 - Mock component tools
vi.mocked(queryFoldersTool.execute).mockResolvedValue(mockResponse);

// V2.1.0 - Mock script execution
(tool as any).execJson = vi.fn().mockResolvedValue(mockResponse);
```

### For Users

**Zero Impact**: All MCP tool calls work identically. No client-side changes required.

## Architecture Benefits

### 1. Maintainability
- Single source of truth per consolidated tool
- Eliminated cross-tool dependencies
- Simplified debugging and testing

### 2. Performance  
- Removed delegation overhead
- Direct script execution paths
- Faster parameter validation

### 3. Code Quality
- Consistent implementation patterns
- Reduced code duplication
- Clear separation of concerns

## Future Considerations

### Scalability
The self-contained pattern scales well:
- Easy to add new operations to existing tools
- Clear patterns for new consolidated tools
- Maintainable without delegation complexity

### Testing
Simplified test patterns:
- Mock script execution directly
- No complex tool interaction mocking
- Clear test boundaries per tool

### Documentation
Self-contained tools are easier to document:
- Single tool = single responsibility
- Clear operation parameters
- Predictable response patterns

## Technical Details

### File Structure
```
src/tools/
├── tasks/
│   └── TasksTool.ts              # Self-contained with 8 modes
├── folders/
│   └── FoldersTool.ts           # Self-contained with 10 operations
├── export/
│   └── ExportTool.ts            # Self-contained with fixed async issues
└── [other consolidated tools...]
```

### Dependency Graph
```
MCP Server
├── 15 Consolidated Tools (self-contained)
├── Shared Base Classes
├── JXA Scripts
└── Cache Layer
```

No inter-tool dependencies in v2.1.0 architecture.

## Lessons Learned

### 1. Delegation Complexity
V2.0.0 delegation added complexity without significant benefits. Direct implementation is clearer.

### 2. Async Issues  
Self-contained implementation helped identify and fix `fs.promises` hanging issues in export operations.

### 3. Test Maintenance
Self-contained tools are much easier to test and maintain long-term.

### 4. Performance Impact
Removing delegation layers provided measurable performance improvements without sacrificing functionality.

The v2.1.0 self-contained architecture represents the optimal balance of functionality, performance, and maintainability for the OmniFocus MCP server.