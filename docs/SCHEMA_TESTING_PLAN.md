# Schema Testing Plan for OmniFocus MCP

## Problem Analysis

The test suite has recurring failures due to mismatches between:
1. **Test expectations** - What the tests expect tools to accept/return
2. **Schema definitions** - Zod schemas that validate parameters
3. **Tool implementations** - Actual parameter processing in tools

## Root Causes

### 1. Schema Validation Happens Before Mock Injection
- Tools validate parameters in `execute()` before `executeValidated()`
- Mocks are injected after instantiation
- Invalid parameters throw `McpError` before mocks can intercept

### 2. Response Structure Variations
Different tools use different response patterns:
- Some use `{ success, data, error }`
- Others use `{ success, data, metadata }`
- V2 tools use specialized response creators

### 3. Parameter Coercion Requirements
Claude Desktop converts all parameters to strings, requiring:
- Number coercion: `z.union([z.number(), z.string().transform()])`
- Boolean coercion: `"true"/"false" → boolean`
- Complex nested structures need deep coercion

## Solution Strategy

### Phase 1: Schema Test Utilities
Create reusable utilities for schema-compliant testing:

```typescript
// tests/utils/schema-helpers.ts
export class SchemaTestHelper {
  // Generate valid params from schema
  static generateValidParams(schema: ZodSchema): any
  
  // Create schema-compliant mocks
  static createSchemaMock(tool: BaseTool): any
  
  // Validate test data against schema
  static validateTestData(schema: ZodSchema, data: any): boolean
}
```

### Phase 2: Mock Factories
Create factories that produce schema-compliant mocks:

```typescript
// tests/utils/mock-factories.ts
export const createFolderToolMock = () => ({
  execute: vi.fn().mockImplementation(async (params) => {
    // Validate params match schema
    const validated = ManageFolderSchema.parse(params);
    
    // Return schema-compliant response
    return createEntityResponse('manage_folder', {
      folder: { id: 'test-id', name: validated.name }
    });
  })
});
```

### Phase 3: Test Pattern Standardization

#### Pattern A: Tools with Discriminated Unions (operation-based)
```typescript
describe('ManageFolderTool', () => {
  let tool: ManageFolderTool;
  
  beforeEach(() => {
    tool = createToolWithMocks(ManageFolderTool, {
      schema: ManageFolderSchema,
      mockResponse: (params) => {
        switch(params.operation) {
          case 'create': return { folder: {...} };
          case 'update': return { folder: {...} };
          // etc.
        }
      }
    });
  });
});
```

#### Pattern B: Tools with Simple Parameters
```typescript
describe('ExportTasksTool', () => {
  let tool: ExportTasksTool;
  
  beforeEach(() => {
    tool = createToolWithMocks(ExportTasksTool, {
      schema: ExportTasksSchema,
      defaultParams: { format: 'json' },
      mockResponse: { data: '[]', count: 0 }
    });
  });
});
```

### Phase 4: Schema Documentation
Generate documentation from schemas:

```typescript
// scripts/generate-schema-docs.ts
async function generateSchemaDocs() {
  const schemas = await loadAllSchemas();
  
  for (const [name, schema] of schemas) {
    const doc = {
      name,
      parameters: extractParameters(schema),
      validations: extractValidations(schema),
      examples: generateExamples(schema)
    };
    
    await writeDoc(doc);
  }
}
```

## Implementation Steps

### Step 1: Create Test Infrastructure
1. **Schema test utilities** - Helper functions for schema validation
2. **Mock factories** - Schema-aware mock generators
3. **Response builders** - Consistent response structure creators

### Step 2: Fix Failing Tests by Category

#### A. Folder Tools (ManageFolderTool, QueryFoldersTool)
- Issue: Discriminated union operations
- Fix: Create operation-aware mocks
- Validate: `operation` field matches schema enum

#### B. Export Tools (BulkExportTool, ExportTasksTool)
- Issue: Optional parameters with defaults
- Fix: Apply schema defaults in tests
- Validate: Response includes required export metadata

#### C. Recurring Tools (AnalyzeRecurring, GetPatterns)
- Issue: Boolean coercion for string parameters
- Fix: Use coercion helpers in test data
- Validate: `activeOnly`, `includeCompleted` as strings

### Step 3: Validation Strategy

```typescript
// Before each test
const params = {
  operation: 'create',
  name: 'Test Folder'
};

// Validate against schema
const result = ManageFolderSchema.safeParse(params);
if (!result.success) {
  console.error('Test params invalid:', result.error);
}

// Use validated params
const response = await tool.execute(result.data);
```

### Step 4: Error Handling Pattern

```typescript
it('should handle invalid parameters', async () => {
  // Test schema validation errors
  await expect(
    tool.execute({ operation: 'invalid' })
  ).rejects.toThrow(McpError);
  
  // Test should NOT reach mock
  expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
});
```

## Benefits

1. **Consistency** - All tests follow same patterns
2. **Maintainability** - Schema changes automatically propagate
3. **Type Safety** - TypeScript inference from schemas
4. **Documentation** - Tests serve as usage examples
5. **Reliability** - No more schema-related failures

## Success Metrics

- ✅ All 591 tests passing
- ✅ No schema validation errors in tests
- ✅ Test coverage > 90%
- ✅ Clear error messages for schema violations
- ✅ Documentation generated from schemas

## Next Actions

1. Create `tests/utils/schema-helpers.ts`
2. Create `tests/utils/mock-factories.ts`
3. Update failing tests with new patterns
4. Generate schema documentation
5. Verify all tests pass