# Error Handling Guide for OmniFocus MCP Server

## Overview

This guide provides comprehensive error handling patterns and best practices for the OmniFocus MCP server. It covers:

- Error taxonomy and classification
- Standardized error response formats
- Error handling patterns for different layers
- Best practices for robust error handling
- Testing error scenarios

## Error Taxonomy

### Error Categories

The server uses a structured error taxonomy defined in `src/utils/error-taxonomy.ts`:

```typescript
export const ERROR_CATEGORIES = {
  VALIDATION: 'validation_error',
  EXECUTION: 'execution_error',
  INTEGRATION: 'integration_error',
  CONFIGURATION: 'configuration_error',
  PERMISSION: 'permission_error',
  NOT_FOUND: 'not_found_error',
  RATE_LIMIT: 'rate_limit_error',
  TIMEOUT: 'timeout_error',
  UNEXPECTED: 'unexpected_error'
} as const;
```

### Error Severity Levels

```typescript
export const ERROR_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
} as const;
```

## Standardized Error Response Format

All errors follow the `StandardResponseV2` format:

```typescript
interface StandardResponseV2<T = unknown> {
  success: false;
  error: string;
  message: string;
  suggestion?: string;
  details?: unknown;
  metadata: StandardMetadataV2;
}

interface StandardMetadataV2 {
  operation: string;
  timestamp: string;
  error_category?: string;
  error_severity?: string;
  error_code?: string;
}
```

### Example Error Response

```json
{
  "success": false,
  "error": "validation_error",
  "message": "Invalid task ID format",
  "suggestion": "Use a valid OmniFocus task ID (11-character alphanumeric)",
  "details": {
    "invalid_id": "abc123",
    "expected_format": "11-character alphanumeric"
  },
  "metadata": {
    "operation": "get_task",
    "timestamp": "2025-12-10T02:00:00.000Z",
    "error_category": "validation",
    "error_severity": "high",
    "error_code": "INVALID_TASK_ID"
  }
}
```

## Error Handling Patterns

### 1. Input Validation Errors

**Location:** Tool entry points, schema validation

**Pattern:**
```typescript
try {
  const validatedArgs = this.schema.parse(args);
  // Process validated input
} catch (error) {
  if (error instanceof z.ZodError) {
    return this.handleValidationError(error, 'create_task');
  }
  throw error;
}
```

**Example:** Invalid date format in task creation

### 2. OmniJS Script Execution Errors

**Location:** Script execution wrappers

**Pattern:**
```typescript
const result = await this.execJson(script);
if (isScriptError(result)) {
  return this.handleScriptError(result, 'task_creation');
}
```

**Example:** OmniFocus not running, permission denied

### 3. Resource Not Found Errors

**Location:** Data access layers

**Pattern:**
```typescript
const task = await this.findTaskById(taskId);
if (!task) {
  return this.handleNotFoundError('task', taskId);
}
```

**Example:** Task with specified ID doesn't exist

### 4. Permission Errors

**Location:** System access points

**Pattern:**
```typescript
try {
  await this.checkOmniFocusPermissions();
} catch (error) {
  return this.handlePermissionError(error);
}
```

**Example:** Automation permissions not granted

### 5. Rate Limit Errors

**Location:** API endpoints, batch operations

**Pattern:**
```typescript
if (this.rateLimiter.isRateLimited()) {
  return this.handleRateLimitError('task_creation');
}
```

**Example:** Too many requests in short time period

## Layer-Specific Error Handling

### BaseTool Class

The `BaseTool` class provides common error handling methods:

```typescript
protected handleErrorV2(
  error: string,
  details?: unknown,
  category: string = ERROR_CATEGORIES.UNEXPECTED,
  severity: string = ERROR_SEVERITY.HIGH
): StandardResponseV2 {
  return {
    success: false,
    error: category,
    message: this.getErrorMessage(error, category),
    suggestion: this.getErrorSuggestion(category),
    details: this.sanitizeErrorDetails(details),
    metadata: {
      operation: this.getOperationName(),
      timestamp: new Date().toISOString(),
      error_category: category,
      error_severity: severity
    }
  };
}
```

### QueryTasksTool Specific Errors

**Common Errors:**
- Invalid filter combinations
- Unsupported query modes
- Cache retrieval failures
- Script generation errors

**Example:**
```typescript
if (filter.completed && filter.available) {
  return this.handleErrorV2(
    'Conflicting filters: completed and available are mutually exclusive',
    { completed: filter.completed, available: filter.available },
    ERROR_CATEGORIES.VALIDATION,
    ERROR_SEVERITY.MEDIUM
  );
}
```

### ManageTaskTool Specific Errors

**Common Errors:**
- Invalid task updates
- Missing required fields
- Invalid repetition rules
- Tag assignment failures

**Example:**
```typescript
if (!taskData.name || taskData.name.trim() === '') {
  return this.handleErrorV2(
    'Task name is required',
    null,
    ERROR_CATEGORIES.VALIDATION,
    ERROR_SEVERITY.HIGH
  );
}
```

## Best Practices

### 1. Early Validation

Validate inputs as early as possible to fail fast:
```typescript
// Validate at tool entry point
const validationResult = this.validateInputs(args);
if (!validationResult.valid) {
  return this.handleValidationError(validationResult.errors);
}
```

### 2. Contextual Error Messages

Provide specific, actionable error messages:
```typescript
// ❌ Bad: "Error occurred"
// ✅ Good: "Task ID 'abc123' is invalid. Use 11-character alphanumeric IDs."
```

### 3. Error Chaining

Preserve error context when re-throwing:
```typescript
try {
  // Operation that might fail
} catch (error) {
  throw new Error('Failed to create task', { cause: error });
}
```

### 4. Graceful Degradation

Handle errors gracefully without crashing:
```typescript
try {
  return await this.executeWithRetry(operation, 3);
} catch (error) {
  this.logError(error);
  return this.fallbackResponse();
}
```

### 5. Error Logging

Log errors with sufficient context:
```typescript
this.logger.error('Task creation failed', {
  taskData: sanitize(taskData),
  error: error.message,
  stack: error.stack,
  context: 'create_task_operation'
});
```

## Testing Error Scenarios

### Unit Test Examples

```typescript
describe('QueryTasksTool error handling', () => {
  it('should handle invalid task ID format', async () => {
    const result = await tool.execute({ id: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('validation_error');
    expect(result.message).toContain('Invalid task ID');
  });

  it('should handle OmniFocus not running', async () => {
    mockOmniFocusNotRunning();
    const result = await tool.execute({ mode: 'all' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('integration_error');
  });
});
```

### Integration Test Examples

```typescript
describe('ManageTaskTool integration errors', () => {
  it('should handle task not found', async () => {
    const result = await tool.updateTask({
      id: 'non-existent-task-id',
      name: 'Updated name'
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_found_error');
  });

  it('should handle permission denied', async () => {
    // Simulate permission error
    const result = await tool.createTask({ name: 'Test' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('permission_error');
  });
});
```

## Common Error Patterns and Solutions

### Pattern 1: Script Execution Timeout

**Symptom:** Script takes too long to execute

**Solution:**
```typescript
const result = await this.execJsonWithTimeout(script, 30000); // 30s timeout
if (result.error === 'timeout') {
  return this.handleErrorV2(
    'Script execution timed out',
    { timeout: '30s', script_size: script.length },
    ERROR_CATEGORIES.TIMEOUT,
    ERROR_SEVERITY.MEDIUM
  );
}
```

### Pattern 2: Invalid Filter Combinations

**Symptom:** User provides conflicting filters

**Solution:**
```typescript
const conflictingFilters = this.detectConflictingFilters(filter);
if (conflictingFilters.length > 0) {
  return this.handleErrorV2(
    `Conflicting filters: ${conflictingFilters.join(', ')}`,
    { filter },
    ERROR_CATEGORIES.VALIDATION,
    ERROR_SEVERITY.MEDIUM
  );
}
```

### Pattern 3: Resource Not Found

**Symptom:** Requested resource doesn't exist

**Solution:**
```typescript
const resource = await this.findResource(resourceId);
if (!resource) {
  return this.handleNotFoundError(resourceType, resourceId);
}
```

### Pattern 4: Permission Denied

**Symptom:** Automation permissions not granted

**Solution:**
```typescript
try {
  await this.checkPermissions();
} catch (error) {
  return this.handlePermissionError(error);
}
```

## Error Response Customization

### Adding Custom Error Messages

Extend the error messages in `src/utils/error-messages.ts`:

```typescript
export const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  INVALID_TASK_ID: 'Task ID must be 11-character alphanumeric',
  MISSING_TASK_NAME: 'Task name is required',
  INVALID_DATE_FORMAT: 'Date must be in YYYY-MM-DD format',
  // Add more custom messages as needed
};
```

### Adding Custom Error Suggestions

```typescript
export const CUSTOM_ERROR_SUGGESTIONS: Record<string, string> = {
  INVALID_TASK_ID: 'Use a valid OmniFocus task ID or query tasks to find the correct ID',
  MISSING_TASK_NAME: 'Provide a descriptive name for the task',
  INVALID_DATE_FORMAT: 'Use format like "2025-12-31" for dates',
  // Add more custom suggestions as needed
};
```

## Error Monitoring and Analytics

### Error Tracking

Track errors for analytics and monitoring:

```typescript
this.metrics.trackError({
  error_category: result.error,
  error_code: result.metadata.error_code,
  operation: result.metadata.operation,
  severity: result.metadata.error_severity,
  timestamp: result.metadata.timestamp
});
```

### Error Rate Monitoring

```typescript
const errorRate = this.metrics.calculateErrorRate('last_24_hours');
if (errorRate > 0.1) { // 10% error rate
  this.alertHighErrorRate(errorRate);
}
```

## Migration Guide

### From V1 to V2 Error Handling

**V1 Pattern:**
```typescript
// V1 - Simple error objects
return { error: 'Task not found', details: { id: taskId } };
```

**V2 Pattern:**
```typescript
// V2 - Standardized error format
return this.handleErrorV2(
  'Task not found',
  { id: taskId },
  ERROR_CATEGORIES.NOT_FOUND,
  ERROR_SEVERITY.MEDIUM
);
```

### Benefits of V2 Error Handling

1. **Consistency:** All errors follow the same format
2. **Context:** Rich metadata for debugging and analytics
3. **Actionability:** Clear suggestions for users
4. **Monitoring:** Easy to track and analyze errors
5. **Documentation:** Self-documenting error taxonomy

## Future Enhancements

### 1. Error Recovery Patterns

Implement automatic recovery for transient errors:
```typescript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries || !isTransientError(error)) {
        throw error;
      }
      await sleep(1000 * attempt); // Exponential backoff
    }
  }
}
```

### 2. Circuit Breaker Pattern

```typescript
const circuitBreaker = new CircuitBreaker({
  threshold: 5,
  timeout: 60000
});

if (circuitBreaker.isOpen()) {
  return this.handleErrorV2(
    'Service temporarily unavailable',
    null,
    ERROR_CATEGORIES.INTEGRATION,
    ERROR_SEVERITY.HIGH
  );
}

try {
  const result = await circuitBreaker.execute(operation);
  return result;
} catch (error) {
  return this.handleErrorV2(
    'Operation failed',
    error,
    ERROR_CATEGORIES.EXECUTION,
    ERROR_SEVERITY.HIGH
  );
}
```

### 3. Enhanced Error Context

Add more context to error responses:
```typescript
interface EnhancedErrorResponse extends StandardResponseV2 {
  recovery_suggestions?: string[];
  related_documentation?: string[];
  support_contact?: string;
  error_id?: string; // Unique error identifier for tracking
}
```

## Conclusion

This error handling guide provides a comprehensive framework for robust error management in the OmniFocus MCP server. By following these patterns and best practices, you can:

- **Improve reliability** through consistent error handling
- **Enhance user experience** with clear, actionable error messages
- **Simplify debugging** with rich error context and metadata
- **Enable monitoring** through standardized error taxonomy
- **Facilitate maintenance** with well-documented error patterns

The standardized error handling approach ensures that all tools and components handle errors consistently, making the system more predictable and easier to maintain.