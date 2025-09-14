# JXA Integration Types for OmniFocus MCP

This directory contains comprehensive TypeScript type definitions for JavaScript for Automation (JXA) integration with OmniFocus. These types address the lessons learned from script size limits, performance issues, and context switching problems documented in `docs/LESSONS_LEARNED.md`.

## Overview

The JXA integration types provide:

- **Type Safety**: Precise method signatures for all OmniFocus objects in JXA context
- **Performance Monitoring**: Types for tracking script size limits and execution metrics
- **Error Handling**: Comprehensive error types for JXA-specific failures
- **Helper Management**: Types for managing helper function categories and sizes
- **Bridge Operations**: Types for context switching between JXA and evaluateJavascript
- **Validation**: Zod schemas for runtime validation of script parameters and results

## File Structure

```
src/omnifocus/
├── jxa-integration-types.ts      # Core JXA integration types
├── jxa-helper-types.ts          # Helper function types and configurations
├── jxa-script-result-types.ts   # Script execution result types
├── jxa-types-index.ts           # Centralized exports
├── JXA_TYPES_README.md          # This documentation
└── [legacy files]               # Existing type files (being phased out)
```

## Core Types

### JXA Execution Context

```typescript
interface JXAExecutionContext {
  readonly app: OmniFocusApplication;
  readonly document: OmniFocusDocument;
  readonly database: OmniFocusDatabase;
  readonly console: Console;
  readonly version: string;
  readonly platform: 'macOS';
}
```

### OmniFocus Object Types

All OmniFocus objects have precise method signatures:

```typescript
interface OmniFocusTask extends OmniFocusActiveObject {
  // Core properties
  readonly id: () => string;
  readonly name: () => string;
  name: (value: string) => void;
  
  // Status properties
  readonly completed: () => boolean;
  completed: (value: boolean) => void;
  readonly flagged: () => boolean;
  flagged: (value: boolean) => void;
  
  // Date properties
  readonly dueDate: () => Date | null;
  dueDate: (value: Date | null) => void;
  
  // ... many more methods
}
```

### Script Execution Results

```typescript
type JXAScriptResult<T = unknown> = JXAScriptSuccess<T> | JXAScriptError;

interface JXAScriptSuccess<T = unknown> {
  readonly success: true;
  readonly data: T;
  readonly metadata: JXAScriptMetadata;
  readonly performance?: JXAPerformanceMetrics;
}

interface JXAScriptError {
  readonly success: false;
  readonly error: JXAExecutionError;
  readonly metadata: JXAScriptMetadata;
  readonly context?: string;
  readonly suggestions?: string[];
}
```

## Helper Function Management

### Helper Categories

The types define helper function categories with size limits:

```typescript
type JXAHelperCategory = 
  | 'minimal'          // Essential utilities only (~5KB)
  | 'basic'            // Common operations (~15KB)
  | 'tag_operations'   // Tag-specific helpers (~8KB)
  | 'recurrence'       // Recurring task helpers (~35KB)
  | 'analytics'        // Analytics helpers (~20KB)
  | 'serialization'    // Export/serialization helpers (~15KB)
  | 'all';             // Complete helper suite (~75KB - avoid!)
```

### Size Constants

```typescript
const HELPER_SIZES = {
  MINIMAL: 5000,           // ~5KB - Essential utilities only
  BASIC: 15000,            // ~15KB - Common operations
  TAG_OPERATIONS: 8000,    // ~8KB - Tag-specific helpers
  RECURRENCE: 35000,       // ~35KB - Recurring task helpers
  ANALYTICS: 20000,        // ~20KB - Analytics helpers
  SERIALIZATION: 15000,    // ~15KB - Export/serialization helpers
  ALL: 75000,              // ~75KB - Complete helper suite (AVOID!)
} as const;
```

## Error Handling

### Comprehensive Error Types

```typescript
type JXAErrorType = 
  | 'script_too_large'           // Script exceeds size limits
  | 'syntax_error'               // JavaScript syntax errors
  | 'runtime_error'              // JXA runtime errors
  | 'type_conversion_error'      // "Can't convert types" errors
  | 'timeout_error'              // Script execution timeout
  | 'memory_error'               // Memory allocation failures
  | 'context_error'              // Bridge context switching issues
  | 'omni_focus_error'           // OmniFocus-specific errors
  | 'permission_error'           // Automation permission issues
  | 'unknown_error';             // Unexpected errors
```

### Error-Specific Result Types

```typescript
interface ScriptSizeLimitError extends JXAScriptError {
  readonly error: JXAExecutionError & {
    readonly type: 'script_too_large';
    readonly details: {
      readonly currentSize: number;
      readonly maxSize: number;
      readonly helperSize: number;
      readonly coreScriptSize: number;
      readonly recommendations: string[];
    };
  };
}
```

## Performance Monitoring

### Performance Metrics

```typescript
interface JXAPerformanceMetrics {
  readonly scriptSize: number;
  readonly executionTimeMs: number;
  readonly memoryUsageBytes?: number;
  readonly operationCount: number;
  readonly errorCount: number;
  readonly contextSwitches: number;
  readonly timestamp: number;
}
```

### Script Size Limits

```typescript
const SCRIPT_LIMITS = {
  MAX_SIZE: 300000,        // 300KB - Maximum script size
  WARNING_THRESHOLD: 250000, // 250KB - Warning threshold
  CRITICAL_THRESHOLD: 280000, // 280KB - Critical threshold
  JXA_RUNTIME_LIMIT: 50000,   // 50KB - JXA runtime parsing limit
  JXA_TRUNCATION_LIMIT: 20000, // 20KB - Script truncation limit
} as const;
```

## Bridge Operations

### Context Switching Types

```typescript
type JXABridgeOperation = 
  | 'evaluate_javascript'        // Switch to evaluateJavascript context
  | 'jxa_direct'                 // Direct JXA method calls
  | 'mixed_context'              // Mixed context (problematic)
  | 'safe_context';              // Safe context with proper error handling

interface JXABridgeContext {
  readonly operation: JXABridgeOperation;
  readonly sourceContext: string;
  readonly targetContext: string;
  readonly timestamp: number;
  readonly success: boolean;
  readonly error?: JXAExecutionError;
}
```

## Validation Schemas

### Zod Schemas for Runtime Validation

```typescript
const JXAScriptMetadataSchema = z.object({
  executionTimeMs: z.number(),
  scriptSize: z.number(),
  memoryUsageBytes: z.number().optional(),
  context: z.string(),
  timestamp: z.number(),
  version: z.string(),
  platform: z.string(),
  helperCategory: z.string().optional(),
  bridgeOperations: z.number().optional(),
  errorCount: z.number(),
  warningCount: z.number(),
});

const OmniFocusTaskDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  completed: z.boolean(),
  flagged: z.boolean(),
  // ... many more fields
});
```

## Type Guards

### Comprehensive Type Guards

```typescript
// Check if a value is a valid JXA execution result
function isJXAExecutionResult(value: unknown): value is JXAScriptExecutionResult

// Check if a value is an OmniFocus task in JXA context
function isOmniFocusTask(value: unknown): value is OmniFocusTask

// Check if a result is a script size limit error
function isScriptSizeLimitError(result: JXAScriptResult): result is ScriptSizeLimitError

// Check if a result is a syntax error
function isSyntaxError(result: JXAScriptResult): result is SyntaxErrorResult
```

## Usage Examples

### Basic Usage

```typescript
import { 
  JXAScriptResult, 
  OmniFocusTask, 
  isJXAScriptSuccess,
  createJXAScriptSuccess 
} from './jxa-types-index.js';

// Execute a script and handle the result
const result: JXAScriptResult<OmniFocusTask[]> = await automation.executeJson(script);

if (isJXAScriptSuccess(result)) {
  const tasks = result.data;
  console.log(`Found ${tasks.length} tasks`);
} else {
  console.error(`Script failed: ${result.error.message}`);
}
```

### Helper Function Management

```typescript
import { 
  JXAHelperCategory, 
  HELPER_SIZES, 
  SCRIPT_LIMITS 
} from './jxa-types-index.js';

// Choose appropriate helper category based on script needs
const helperCategory: JXAHelperCategory = 'basic'; // 15KB
const maxScriptSize = SCRIPT_LIMITS.MAX_SIZE; // 300KB

if (helperCategory === 'all') {
  console.warn('Avoid using "all" helpers - can cause script size issues!');
}
```

### Error Handling

```typescript
import { 
  isScriptSizeLimitError, 
  isSyntaxError, 
  isTypeConversionError 
} from './jxa-types-index.js';

const result = await automation.executeJson(script);

if (isScriptSizeLimitError(result)) {
  const { currentSize, maxSize, recommendations } = result.error.details;
  console.error(`Script too large: ${currentSize}/${maxSize} bytes`);
  console.log('Recommendations:', recommendations);
} else if (isSyntaxError(result)) {
  const { line, column, function: func } = result.error.details;
  console.error(`Syntax error at line ${line}, column ${column} in ${func}`);
} else if (isTypeConversionError(result)) {
  const { expectedType, actualType, context } = result.error.details;
  console.error(`Type conversion error in ${context}: expected ${expectedType}, got ${actualType}`);
}
```

## Migration Guide

### From Legacy Types

If you're using the legacy `script-result-types.ts`, migrate to the new types:

```typescript
// OLD (legacy)
import { ScriptResult, ScriptSuccess, ScriptError } from './script-result-types.js';

// NEW (comprehensive)
import { JXAScriptResult, JXAScriptSuccess, JXAScriptError } from './jxa-types-index.js';
```

### Key Differences

1. **More Specific**: New types provide precise method signatures for OmniFocus objects
2. **Better Error Handling**: Comprehensive error types with specific details
3. **Performance Monitoring**: Built-in performance metrics and size tracking
4. **Helper Management**: Types for managing helper function categories and sizes
5. **Validation**: Zod schemas for runtime validation

## Best Practices

### 1. Use Appropriate Helper Categories

```typescript
// ✅ GOOD - Use minimal helpers for simple operations
const script = `${getMinimalHelpers()} ${coreScript}`; // ~5KB

// ❌ BAD - Avoid all helpers unless absolutely necessary
const script = `${getAllHelpers()} ${coreScript}`; // ~75KB - too large!
```

### 2. Monitor Script Sizes

```typescript
import { SCRIPT_LIMITS } from './jxa-types-index.js';

const scriptSize = script.length;
if (scriptSize > SCRIPT_LIMITS.WARNING_THRESHOLD) {
  console.warn(`Script size approaching limit: ${scriptSize}/${SCRIPT_LIMITS.MAX_SIZE}`);
}
```

### 3. Handle Errors Specifically

```typescript
import { isScriptSizeLimitError, isSyntaxError } from './jxa-types-index.js';

if (isScriptSizeLimitError(result)) {
  // Handle script size issues
  const recommendations = result.error.details.recommendations;
  // Apply recommendations...
} else if (isSyntaxError(result)) {
  // Handle syntax errors
  const { line, column } = result.error.details;
  // Fix syntax at line/column...
}
```

### 4. Use Type Guards

```typescript
import { isOmniFocusTask, isOmniFocusProject } from './jxa-types-index.js';

// Validate objects before using them
if (isOmniFocusTask(task)) {
  const taskName = task.name(); // Type-safe method call
}
```

## Integration with Existing Code

The new types are designed to integrate seamlessly with existing code:

1. **Backward Compatibility**: Legacy types are still available
2. **Gradual Migration**: You can migrate incrementally
3. **Enhanced Functionality**: New types provide additional features without breaking existing code

## Future Enhancements

Planned enhancements include:

1. **Code Generation**: TypeScript code generation for JXA scripts
2. **Performance Profiling**: Enhanced performance monitoring
3. **Automated Testing**: Type-driven testing for JXA operations
4. **Documentation Generation**: Auto-generated documentation from types

## Contributing

When adding new types:

1. Follow the existing patterns and naming conventions
2. Include comprehensive JSDoc comments
3. Add appropriate type guards and validation schemas
4. Update this README with examples
5. Consider performance implications and script size limits

## References

- [LESSONS_LEARNED.md](../../docs/LESSONS_LEARNED.md) - Critical lessons from development
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines
- [OmniFocus API Documentation](./api/README.md) - Official API types
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18/) - MCP protocol details