# Testing Guide for OmniFocus MCP

## Overview

This guide explains how to write tests that properly handle schema validation and parameter coercion in the OmniFocus
MCP server.

## Key Concepts

### 1. Schema Validation

All tools validate input parameters using Zod schemas before execution. Tests must provide schema-compliant parameters
or expect validation errors.

### 2. Claude Desktop String Coercion

Claude Desktop converts all parameters to strings during transport. Our schemas handle this with coercion helpers, but
tests need to account for this behavior.

### 3. Response Structures

Different tools use different response patterns. Always check the tool's actual implementation for the correct
structure.

## Using Test Utilities

### Schema Test Helper

```typescript
import { SchemaTestHelper } from '../utils/schema-helpers';
import { ManageFolderSchema } from '../../src/tools/schemas/folder-schemas';

// Generate valid parameters with defaults
const params = SchemaTestHelper.generateValidParams(ManageFolderSchema, {
  operation: 'create',
  name: 'Test Folder',
});

// Validate test data
const validation = SchemaTestHelper.validateTestData(ManageFolderSchema, params);
if (!validation.valid) {
  console.error('Invalid params:', validation.errors);
}

// Create schema-compliant mock
const tool = SchemaTestHelper.createSchemaMock(ManageFolderTool, {
  omniAutomation: mockOmniAutomation,
});
```

### Mock Factories

```typescript
import { createMockedTool, createManageFolderMock } from '../utils/mock-factories';

// Create a fully mocked tool
const tool = createMockedTool(ManageFolderTool, {
  omniAutomation: createManageFolderMock({
    create: { folder: { id: '1', name: 'Created' } },
  }),
});

// Test with operation-specific responses
const result = await tool.execute({
  operation: 'create',
  name: 'Test Folder',
});
```

### Response Builder

```typescript
import { ResponseBuilder } from '../utils/mock-factories';

// Create consistent responses
const successResponse = ResponseBuilder.success({ tasks: [] }, { operation: 'list_tasks' });

const errorResponse = ResponseBuilder.error('VALIDATION_ERROR', 'Invalid parameters');
```

## Test Patterns

### Pattern 1: Tools with Operations (Discriminated Unions)

```typescript
describe('ManageFolderTool', () => {
  let tool: ManageFolderTool;
  let mockOmniAutomation: any;

  beforeEach(() => {
    mockOmniAutomation = createManageFolderMock();
    tool = createMockedTool(ManageFolderTool, {
      omniAutomation: mockOmniAutomation,
    });
  });

  it('should create folder', async () => {
    const result = await tool.execute({
      operation: 'create',
      name: 'Test Folder',
    });

    expect(result.success).toBe(true);
    expect(result.data.folder.name).toBe('Test Folder');
  });
});
```

### Pattern 2: Simple Parameter Tools

```typescript
describe('ExportTasksTool', () => {
  let tool: ExportTasksTool;

  beforeEach(() => {
    tool = createMockedTool(ExportTasksTool, {
      omniAutomation: createExportTasksMock(),
    });
  });

  it('should export with default format', async () => {
    const result = await tool.execute({});

    expect(result.data.format).toBe('json');
  });
});
```

### Pattern 3: Testing Schema Validation

```typescript
it('should reject invalid parameters', async () => {
  // Invalid operation should throw McpError
  await expect(tool.execute({ operation: 'invalid' })).rejects.toThrow('Invalid parameters');

  // Mock should not be called for invalid params
  expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
});
```

### Pattern 4: Testing with Coercion

```typescript
it('should handle string coercion', async () => {
  // Simulate Claude Desktop string conversion
  const params = {
    operation: 'create',
    name: 'Test',
    includeEmpty: 'true', // String boolean
    limit: '50', // String number
  };

  const result = await tool.execute(params);

  // Tool should handle coercion internally
  expect(result.success).toBe(true);
});
```

## Common Issues and Solutions

### Issue: Test fails with "Invalid parameters"

**Solution**: Check that all required fields are provided and match schema types.

```typescript
// ❌ Wrong - missing required field
await tool.execute({ name: 'Test' });

// ✅ Correct - includes required operation
await tool.execute({ operation: 'create', name: 'Test' });
```

### Issue: Mock not being called

**Solution**: Ensure mock is injected before calling execute.

```typescript
// ❌ Wrong - mock injected after instantiation may not work
const tool = new ManageFolderTool(mockCache);
tool.execute({ ... }); // Validation happens before mock can intercept

// ✅ Correct - use createMockedTool
const tool = createMockedTool(ManageFolderTool, {
  omniAutomation: mockOmniAutomation
});
```

### Issue: Response structure mismatch

**Solution**: Check tool's actual response format.

```typescript
// ❌ Wrong - assuming wrong structure
expect(result.tasks).toBeDefined();

// ✅ Correct - matching actual structure
expect(result.data.tasks).toBeDefined();
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/unit/tools/folders.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Best Practices

1. **Always validate against schemas** - Use SchemaTestHelper to ensure params are valid
2. **Mock at the right level** - Mock OmniAutomation, not the tool's execute method
3. **Use factories for consistency** - Create reusable mocks with mock-factories
4. **Test both success and error cases** - Include validation errors and execution failures
5. **Document complex test setups** - Add comments explaining non-obvious test arrangements

## Further Reading

- [Schema Testing Plan](../docs/SCHEMA_TESTING_PLAN.md)
- [Zod Documentation](https://zod.dev)
- [Vitest Documentation](https://vitest.dev)
