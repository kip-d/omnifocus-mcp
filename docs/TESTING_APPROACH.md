# Testing Approach for OmniFocus MCP

## Why Vitest Instead of Cucumber?

After evaluating both approaches, we chose **Vitest** over Cucumber for the following reasons:

### Cucumber Issues
- **ES Module compatibility problems** - Complex module loading requirements
- **TypeScript configuration complexity** - Difficult to get ts-node working properly
- **Overkill for the use case** - Existing Vitest setup already comprehensive
- **Maintenance overhead** - Additional framework complexity without significant benefits

### Vitest Advantages
- **Native TypeScript support** - No configuration complexity
- **ES Module compatibility** - Works seamlessly with our setup
- **Fast execution** - Better performance for unit and integration tests
- **Rich ecosystem** - Excellent mocking, coverage, and assertion libraries
- **Simpler maintenance** - Single test framework for the entire project

## Test Data Management

### Overview
We use a **"MCP testing 2357"** tag to identify and manage test data, ensuring we never permanently alter existing OmniFocus data.

### Key Features
- **Automatic cleanup** - Test data is cleaned up after each test
- **Tag-based identification** - All test data is tagged with `MCP testing 2357`
- **Comprehensive tracking** - Tasks, projects, and other data are tracked for cleanup
- **Safe testing** - No risk of affecting real OmniFocus data

### Usage

#### Basic Test Data Creation
```typescript
import { TestDataManager } from './test-data-management.test.ts';

describe('My Test Suite', () => {
  let testManager: TestDataManager;

  beforeAll(async () => {
    testManager = new TestDataManager();
    await testManager.startServer();
  });

  afterAll(async () => {
    await testManager.cleanupTestData();
    await testManager.stop();
  });

  it('should test task creation', async () => {
    // Create test task - automatically tagged and tracked
    const result = await testManager.createTestTask('My Test Task', {
      flagged: true,
      note: 'Test note'
    });
    
    expect(result.success).toBe(true);
    expect(result.task.tags).toContain('MCP testing 2357');
  });
});
```

#### Test Project Creation
```typescript
it('should test project operations', async () => {
  // Create test project
  const project = await testManager.createTestProject('Test Project');
  
  // Create task in project
  const task = await testManager.createTestTask('Task in Project', {
    projectId: project.project.id
  });
  
  expect(task.task.projectId).toBe(project.project.id);
});
```

### Manual Cleanup

If you need to manually clean up test data, use the cleanup script:

```bash
npm run cleanup:test-data
```

This will remove all tasks and projects tagged with "MCP testing 2357".

## Test Structure

### Unit Tests (`tests/unit/`)
- **Fast execution** - No OmniFocus dependency
- **Mocked dependencies** - Uses mocks for OmniFocus interactions
- **Comprehensive coverage** - Tests individual functions and modules

### Integration Tests (`tests/integration/`)
- **Real OmniFocus interaction** - Tests actual MCP protocol communication
- **End-to-end scenarios** - Verifies complete workflows
- **Test data management** - Uses the TestDataManager for safe testing

### Test Data Management Tests (`tests/unit/test-data-management.test.ts`)
- **Demonstrates best practices** - Shows how to use TestDataManager
- **Validates cleanup** - Ensures test data is properly managed
- **Template for new tests** - Reference implementation for other test suites

## Best Practices

### 1. Always Use TestDataManager
```typescript
// ✅ Good - Uses TestDataManager
const task = await testManager.createTestTask('Test Task');

// ❌ Bad - Direct API calls without tracking
const task = await callTool('create_task', { name: 'Test Task' });
```

### 2. Clean Up After Tests
```typescript
// ✅ Good - Automatic cleanup
afterEach(async () => {
  await testManager.cleanupTestData();
});

// ❌ Bad - No cleanup
// Test data accumulates over time
```

### 3. Use Descriptive Test Names
```typescript
// ✅ Good - Clear test purpose
it('should create flagged tasks with notes', async () => {

// ❌ Bad - Unclear test purpose
it('should work', async () => {
```

### 4. Test Edge Cases
```typescript
it('should handle invalid task IDs gracefully', async () => {
  const result = await testManager.callTool('get_task', { id: 'invalid-id' });
  expect(result.success).toBe(false);
  expect(result.error).toContain('not found');
});
```

## Migration from Cucumber

If you have existing Cucumber scenarios, you can migrate them to Vitest:

### Before (Cucumber)
```gherkin
Scenario: Create and cleanup test task
  Given I have a test task named "Sample Test Task"
  When I verify the task exists
  Then the test task should be created successfully
```

### After (Vitest)
```typescript
it('should create and cleanup test task', async () => {
  const result = await testManager.createTestTask('Sample Test Task');
  expect(result.success).toBe(true);
  
  const task = await testManager.callTool('get_task', { id: result.task.id });
  expect(task.success).toBe(true);
});
```

## Conclusion

The Vitest-based approach provides:
- **Better developer experience** - Simpler setup and faster feedback
- **Type safety** - Full TypeScript support
- **Reliable test data management** - Safe testing without data pollution
- **Easier maintenance** - Single test framework, clear patterns
- **Better performance** - Faster test execution

This approach is more suitable for TypeScript MCP projects and provides all the benefits of BDD-style testing without the complexity of Cucumber.
