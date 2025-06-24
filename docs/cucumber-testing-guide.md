# Cucumber Testing Guide for OmniFocus MCP

## Overview

This project now includes comprehensive Cucumber.js testing support for BDD (Behavior-Driven Development) testing of the OmniFocus MCP server.

## Setup

### Installation
```bash
npm install --save-dev @cucumber/cucumber chai
```

### Project Structure
```
test/
├── features/
│   ├── omnifocus-mcp.feature      # Comprehensive 40+ scenarios
│   ├── basic-tests.feature        # Basic functionality tests
│   ├── simple-demo.feature        # Simple working demo
│   ├── support/
│   │   └── world.js              # MCP connection setup
│   └── step_definitions/
│       ├── task_steps.js         # Task-related steps
│       ├── project_steps.js      # Project management steps
│       ├── analytics_steps.js    # Analytics steps
│       ├── tag_steps.js          # Tag management steps
│       ├── export_steps.js       # Export functionality steps
│       ├── performance_steps.js  # Performance/caching steps
│       ├── error_steps.js        # Error handling steps
│       └── simple_steps.js       # Simple demo steps
├── scenarios/
│   └── all-features.json         # Structured test scenarios
└── results/
    └── cucumber-report.html      # Test results (generated)
```

## Running Tests

### Quick Start
```bash
# Run the simple demo
npx cucumber-js test/features/simple-demo.feature

# Run basic tests
npx cucumber-js test/features/basic-tests.feature

# Run all tests
npx cucumber-js

# Run with specific format
npx cucumber-js --format html:test-results/report.html
```

### Using the Test Scripts
```bash
# Run Cucumber tests with summary
./scripts/run-cucumber-tests.sh

# Run all test suites (includes Cucumber)
./scripts/run-all-tests.sh
```

## Writing Gherkin Scenarios

### Basic Scenario Structure
```gherkin
Feature: Task Management
  As a user
  I want to manage my OmniFocus tasks
  So that I can be productive

  Background:
    Given the OmniFocus MCP server is connected

  Scenario: List incomplete tasks
    When I request tasks with filter "completed: false"
    Then I should receive a list of tasks
    And each task should have properties: id, name, project
```

### Data Tables
```gherkin
Scenario: Create a task with properties
  When I create a task with:
    | name     | Important meeting      |
    | flagged  | true                  |
    | dueDate  | 2025-06-25T10:00:00Z |
    | tags     | ["work", "urgent"]    |
  Then the task should be created successfully
```

## Available Step Definitions

### Given Steps
- `Given the OmniFocus MCP server is connected`
- `Given I have a task with known ID`
- `Given I have a project named {string}`
- `Given I have a tag named {string}`

### When Steps (Actions)
- `When I request tasks with filter {string}`
- `When I create a task with:` (data table)
- `When I update the task with:` (data table)
- `When I complete the task`
- `When I delete the task`
- `When I request productivity stats for {string}`
- `When I export tasks with:` (data table)
- `When I list all tags sorted by {string}`

### Then Steps (Assertions)
- `Then I should receive a list of tasks`
- `Then the task should be created successfully`
- `Then I should receive statistics including:` (data table)
- `Then I should receive an error message`
- `Then the error should indicate {string}`

## MCP World Context

The `world.js` file provides:
- Automatic MCP server connection
- Tool execution via `this.callTool(name, params)`
- Shared context between steps via `this.context`
- Response time tracking
- Data table parsing

### Using in Step Definitions
```javascript
When('I create a task', async function() {
  this.response = await this.callTool('create_task', {
    name: 'Test task'
  });
  this.context.taskId = this.response.taskId;
});

Then('the task exists', async function() {
  const task = await this.callTool('list_tasks', {
    search: this.context.taskId
  });
  expect(task.tasks).to.have.length(1);
});
```

## Test Coverage

### Current Coverage
- ✅ Task Management (list, create, update, complete, delete)
- ✅ Project Management (CRUD operations)
- ✅ Analytics (productivity stats, velocity, overdue analysis)
- ✅ Tag Management (list, create, rename, delete, merge)
- ✅ Export Functionality (JSON, CSV, bulk export)
- ✅ Search and Filtering
- ✅ Performance and Caching
- ✅ Error Handling

### Running Coverage Report
```bash
# Generate test report
node test/generate-test-report.js

# Open in browser
open test-report.html
```

## Debugging Tests

### Enable Debug Output
```bash
DEBUG=true npx cucumber-js
```

### Common Issues

1. **Timeout Errors**
   - Increase timeout in world.js: `setDefaultTimeout(60 * 1000)`
   - Some operations (like today's agenda) can be slow

2. **JSON Parse Errors**
   - Check filter syntax in feature files
   - Use proper quotes for string values

3. **Connection Issues**
   - Ensure MCP server is built: `npm run build`
   - Check server logs for errors

## Best Practices

1. **Keep Scenarios Focused**
   - One scenario per feature/behavior
   - Use Background for common setup

2. **Use Descriptive Names**
   - Scenario names should explain the business value
   - Step definitions should be reusable

3. **Data-Driven Tests**
   - Use Scenario Outlines for multiple test cases
   - Use data tables for complex inputs

4. **Clean Up After Tests**
   - Delete test tasks/projects created during tests
   - Use After hooks for cleanup

## Integration with CI/CD

Add to your CI pipeline:
```yaml
# .github/workflows/test.yml
- name: Run Cucumber Tests
  run: |
    npm run build
    npx cucumber-js --format json:test-results/cucumber.json
    
- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: cucumber-results
    path: test-results/
```

## Next Steps

1. Add more scenarios for edge cases
2. Implement Scenario Outlines for data-driven tests
3. Add visual reporting with cucumber-html-reporter
4. Set up parallel test execution
5. Add test tagging for selective execution