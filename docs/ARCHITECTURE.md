# OmniFocus MCP Architecture Guide

## Executive Summary

The OmniFocus MCP server uses a **hybrid JavaScript execution model** that combines JXA (JavaScript for Automation) with targeted OmniJS bridge operations to achieve optimal performance and functionality.

## JavaScript Execution Model

### Primary: JXA (JavaScript for Automation)
- **Entry point**: All scripts start with `Application('OmniFocus')`
- **Execution**: Via `osascript -l JavaScript` through stdin piping
- **Use cases**: Reading properties, simple CRUD operations, direct API access
- **Performance**: Good for most operations (<1 second for 2000+ tasks)

### Secondary: evaluateJavascript() Bridge
- **Pattern**: JXA script calls `app.evaluateJavascript(omniJsCode)`
- **Use cases**: Operations JXA cannot handle or needs performance boost
- **When required**:
  - Tag assignment during task creation
  - Task movement between projects (preserving IDs)
  - Setting repetition rules
  - Bulk operations requiring speed

### Never: Pure OmniJS
- No scripts run purely in OmniJS context
- OmniJS code only executes through evaluateJavascript() bridge

## Decision Tree: Which Approach to Use

### Quick Decision Guide

**Start with Pure JXA for:**
- Reading task/project/tag properties
- Simple CRUD operations (create, update, delete)
- Queries and filters
- Most standard OmniFocus operations

**Add Bridge for:**
- ✅ **Tag assignment during task creation** (JXA limitation)
- ✅ **Task movement between projects** (preserves IDs better)
- ✅ **Setting repetition rules** (complex rule objects)
- ✅ **Bulk operations** (100+ items, significant performance boost)
- ✅ **Perspective queries** (faster execution)

### Detailed Decision Tree

```
Operation needed?
├── Reading data (tasks, projects, tags)
│   ├── Simple queries → Pure JXA
│   └── Complex filters or bulk → JXA + Bridge (if needed)
├── Creating/Updating tasks
│   ├── Without tags → Pure JXA
│   ├── With tags → JXA + Bridge
│   └── With repetition → JXA + Bridge
├── Task movement/organization
│   ├── Simple property changes → Pure JXA
│   └── Project movement/hierarchy → JXA + Bridge
└── Bulk operations (>100 items) → JXA + Bridge
```

## Implementation Patterns

### Pattern 1: Pure JXA
```typescript
export const SIMPLE_OPERATION_SCRIPT = `
  ${getCoreHelpers()}

  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();

    // Direct JXA operations
    const task = doc.flattenedTasks().find(t => t.id() === taskId);
    if (task) {
      task.name = newName;
      task.flagged = true;
    }

    return JSON.stringify({ success: true });
  })()
`;
```

### Pattern 2: JXA + Bridge
```typescript
export const COMPLEX_OPERATION_SCRIPT = `
  ${getCoreHelpers()}
  ${getBridgeOperations()}

  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();

    // JXA operations first
    const task = createTask(doc, params);

    // Bridge operation for what JXA can't do
    if (params.tags) {
      const result = assignTagsViaBridge(app, task.id(), params.tags);
      if (!result.success) {
        return JSON.stringify({ error: result.error });
      }
    }

    return JSON.stringify({ success: true, taskId: task.id() });
  })()
`;
```

## Helper System Organization

### Current Structure
```
src/omnifocus/scripts/shared/
├── helpers.ts              # Main helper functions (18 different helper sets)
├── bridge-helpers.ts       # evaluateJavascript templates and operations
├── minimal-tag-bridge.ts   # Specialized tag bridge operations
└── repeat-helpers.ts       # Repetition rule helpers
```

### Helper Function Selection Guide

**By Size (when size matters):**
- **getMinimalHelpers()** - Basic utilities (~3KB)
- **getBasicHelpers()** - Standard operations (~5KB)
- **getCoreHelpers()** - Essential utilities (~8KB)
- **getAllHelpers()** - Complete suite (~30KB, **safe to use freely**)

**By Domain (when functionality matters):**
- **getAnalyticsHelpers()** - Date parsing, completions, patterns
- **getRecurrenceApplyHelpers()** - Repetition rule application
- **getValidationHelpers()** - Input validation and Claude Desktop bug detection
- **getFullStatusHelpers()** - Complete task status serialization
- **getSerializationHelpers()** - Data formatting and JSON serialization

**For Bridge Operations:**
- **getBridgeOperations()** - From bridge-helpers.ts, evaluateJavascript templates

## Script Size Considerations

### Empirical Limits (Tested September 2025)
- **JXA Direct**: 523KB (~523,000 characters)
- **OmniJS Bridge**: 261KB (~261,000 characters)

### Current Usage
- Largest script: ~31KB (6% of JXA limit)
- All scripts well within empirical limits
- Previous 19KB "limit" was incorrect assumption

### Recommendations
- Use appropriate helper level for functionality needed
- No need for aggressive size optimization
- Script size is rarely the limiting factor

## Performance Guidelines

### JXA Performance Rules
1. **Never use whose() or where() methods** - Takes 25+ seconds
2. **Use direct iteration with try/catch** - 50% faster than wrapper functions
3. **Early exit conditions** - Check completed/date conditions first
4. **Cache timestamp comparisons** - Don't create Date objects in loops

### When to Use Bridge for Performance
- Bulk operations (>100 items)
- Complex data transformations
- Operations requiring precise timing
- Perspective queries (significant speed boost)

## Error Handling Patterns

### JXA Error Handling
```javascript
function safeGet(fn) {
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

// Usage
const name = safeGet(() => task.name()) || 'Unnamed';
```

### Bridge Error Handling
```javascript
function executeBridgeOperation(app, template, params) {
  try {
    const script = formatBridgeScript(template, params);
    const result = app.evaluateJavascript(script);
    return JSON.parse(result);
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
```

## Security Considerations

### Bridge Script Safety
- Always use template-based script generation
- Never concatenate user input directly into scripts
- Use `JSON.stringify()` for parameter injection
- Validate bridge operation results

### Example Safe Bridge Template
```javascript
const SAFE_TEMPLATE = [
  '(() => {',
  '  const task = Task.byIdentifier($TASK_ID$);',
  '  if (!task) return JSON.stringify({ success: false, error: "not_found" });',
  '  const tags = $TAGS$;',
  '  task.clearTags();',
  '  tags.forEach(name => task.addTag(Tag.byName(name) || new Tag(name)));',
  '  return JSON.stringify({ success: true });',
  '})()'
].join('\\n');
```

## Common Anti-Patterns

### ❌ Don't Do This
```javascript
// Direct string concatenation - security risk
const script = `task.name = "${userInput}";`;

// Using whose() - performance killer
const tasks = doc.flattenedTasks.whose({completed: false})();

// Pure OmniJS without JXA wrapper
const omniJsScript = 'Task.byIdentifier("123").name = "new";';
```

### ✅ Do This Instead
```javascript
// Template-based parameter injection
const script = formatBridgeScript(template, { NAME: userInput });

// Direct iteration with early exit
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  if (safeGet(() => task.completed())) continue;
  // Process incomplete task
}

// JXA wrapper with bridge call
const result = app.evaluateJavascript(omniJsScript);
```

## Testing Patterns

### Direct Tool Testing
```bash
# Test with proper MCP initialization
node test-single-tool.js tasks '{"mode":"today","limit":"3"}'
```

### Environment Differences
- **CLI Testing**: Works for read operations, write operations may fail
- **Claude Desktop**: All operations work correctly
- **Root Cause**: Unknown environment-specific script execution difference

## Migration Guidelines

### From Legacy Patterns
1. Replace direct `evaluateJavascript` strings with templates
2. Consolidate duplicate helper functions
3. Use performance-optimized scripts for production
4. Remove experimental script variants

### Future Development
1. Start with Pure JXA for new operations
2. Add bridge operations only when JXA limitations require it
3. Use getAllHelpers() freely (no size constraints)
4. Test with both CLI tools and Claude Desktop

## Troubleshooting

### Common Issues
- **Scripts timeout**: Check for whose() usage, implement early exits
- **Bridge operations fail**: Verify template parameters and error handling
- **CLI vs Claude Desktop differences**: Use Claude Desktop for write operations

### Debug Patterns
- Add console.error() statements for execution tracking
- Use structured error returns with context
- Implement graceful fallbacks for bridge operations

## Performance Benchmarks

### Typical Operation Times
- Task queries (2000+ tasks): <1 second
- Task creation: <0.5 seconds
- Tag operations via bridge: <1 second
- Bulk exports: 2-5 seconds (depending on size)

### When Performance Degrades
- Using whose() methods: 25+ seconds
- No early exit conditions: 5-10x slower
- Complex nested operations: Variable

## Tool Architecture (V2.1.0)

### Self-Contained Design
Each of the 15 consolidated tools contains complete implementation without delegation:

**Core Tools**:
- `tasks` - Self-contained query implementation with 8 modes
- `manage_task` - Self-contained CRUD operations
- `projects` - Self-contained project operations
- `folders` - Self-contained folder operations (10 operations)
- `tags` - Self-contained tag management

**Analytics Tools**: 5 tools for GTD metrics and analysis
**Utility Tools**: 4 tools for export, perspectives, recurring tasks, system info

### Implementation Pattern
```typescript
class ConsolidatedTool extends BaseTool {
  async execute(args: ToolArgs): Promise<ToolResponse> {
    switch (args.operation) {
      case 'create': return await this.executeCreate(args);
      case 'update': return await this.executeUpdate(args);
      // Direct implementation, no delegation
    }
  }

  private async executeCreate(args: CreateArgs): Promise<ToolResponse> {
    const result = await this.execJson(CREATE_SCRIPT, args);
    return this.formatResponse(result);
  }
}
```

## Future Considerations

### Scalability
- Easy to add new operations to existing tools
- Clear patterns for new consolidated tools
- Maintainable without delegation complexity

### Performance Evolution
- Monitor for new JXA limitations
- Expand bridge operations as needed
- Continue empirical testing of actual limits

This architecture guide provides the framework for consistent, performant, and maintainable OmniFocus automation scripts.