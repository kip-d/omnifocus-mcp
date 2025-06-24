# Gherkin Step Definitions for OmniFocus MCP

This document provides the implementation patterns for the Gherkin scenarios.

## Common Steps

### Given Steps
```javascript
Given('the OmniFocus MCP server is connected', async function() {
  this.mcp = await connectToMCPServer('omnifocus-cached');
  expect(this.mcp.connected).toBe(true);
});

Given('I have an OmniFocus database with existing tasks and projects', async function() {
  // This is assumed - OmniFocus should already have data
  const count = await this.mcp.call('get_task_count', { completed: false });
  expect(count.count).toBeGreaterThan(0);
});

Given('I have a task with known ID', async function() {
  const tasks = await this.mcp.call('list_tasks', { limit: 1 });
  this.taskId = tasks.tasks[0].id;
  expect(this.taskId).toBeDefined();
});

Given('I have a project named {string}', async function(projectName) {
  const projects = await this.mcp.call('list_projects', { search: projectName });
  this.project = projects.projects.find(p => p.name === projectName);
  expect(this.project).toBeDefined();
});
```

### When Steps
```javascript
When('I request tasks with filter {string}', async function(filterJson) {
  const filter = JSON.parse(`{${filterJson}}`);
  this.response = await this.mcp.call('list_tasks', filter);
});

When('I create a task with:', async function(dataTable) {
  const taskData = dataTable.rowsHash();
  if (taskData.tags) taskData.tags = JSON.parse(taskData.tags);
  this.response = await this.mcp.call('create_task', taskData);
});

When('I request productivity stats for {string}', async function(periodJson) {
  const params = JSON.parse(`{${periodJson}}`);
  this.response = await this.mcp.call('get_productivity_stats', params);
});

When('I export tasks with:', async function(dataTable) {
  const params = dataTable.rowsHash();
  if (params.filter) params.filter = JSON.parse(params.filter);
  if (params.fields) params.fields = JSON.parse(params.fields);
  this.response = await this.mcp.call('export_tasks', params);
});
```

### Then Steps
```javascript
Then('I should receive a list of tasks', function() {
  expect(this.response).toHaveProperty('tasks');
  expect(Array.isArray(this.response.tasks)).toBe(true);
});

Then('each task should have properties: {listOfStrings}', function(properties) {
  const props = properties.split(', ');
  this.response.tasks.forEach(task => {
    props.forEach(prop => {
      expect(task).toHaveProperty(prop);
    });
  });
});

Then('no task should have {string}', function(property) {
  const [key, value] = property.split(': ');
  this.response.tasks.forEach(task => {
    expect(task[key]).not.toBe(JSON.parse(value));
  });
});

Then('the task should be created successfully', function() {
  expect(this.response).toHaveProperty('success', true);
  expect(this.response).toHaveProperty('taskId');
});

Then('I should receive statistics including:', function(dataTable) {
  const expectedStats = dataTable.hashes();
  expectedStats.forEach(stat => {
    expect(this.response.stats).toHaveProperty(stat.Metric);
  });
});
```

## Testing Patterns

### 1. Task Filtering Tests
```javascript
// Complex filter combination
const filter = {
  completed: false,
  flagged: true,
  projectId: 'project-123',
  tags: ['work', 'urgent'],
  dueBefore: '2025-07-01T00:00:00Z',
  available: true
};
const result = await mcp.call('list_tasks', filter);
```

### 2. CRUD Operation Tests
```javascript
// Create
const created = await mcp.call('create_task', {
  name: 'Test task',
  projectId: 'project-id',
  tags: ['test']
});

// Read
const task = await mcp.call('list_tasks', {
  search: created.taskId
});

// Update
await mcp.call('update_task', {
  taskId: created.taskId,
  flagged: true,
  name: 'Updated test task'
});

// Delete
await mcp.call('delete_task', {
  taskId: created.taskId
});
```

### 3. Analytics Tests
```javascript
// Productivity stats with different groupings
const byProject = await mcp.call('get_productivity_stats', {
  period: 'week',
  groupBy: 'project'
});

const byTag = await mcp.call('get_productivity_stats', {
  period: 'week', 
  groupBy: 'tag'
});

// Verify different groupings return different structures
expect(byProject.stats.byProject).toBeDefined();
expect(byTag.stats.byTag).toBeDefined();
```

### 4. Export Tests
```javascript
// JSON export
const jsonExport = await mcp.call('export_tasks', {
  format: 'json',
  filter: { flagged: true }
});
expect(JSON.parse(jsonExport.data)).toBeInstanceOf(Array);

// CSV export
const csvExport = await mcp.call('export_tasks', {
  format: 'csv',
  filter: { flagged: true },
  fields: ['name', 'project', 'dueDate']
});
expect(csvExport.data).toMatch(/^name,project,dueDate/);
```

### 5. Error Handling Tests
```javascript
// Invalid ID
try {
  await mcp.call('update_task', {
    taskId: 'invalid-id-12345',
    name: 'This should fail'
  });
  fail('Should have thrown an error');
} catch (error) {
  expect(error.message).toContain('not found');
}

// Invalid parameters
try {
  await mcp.call('create_task', {
    // Missing required 'name' field
    projectId: 'some-project'
  });
  fail('Should have thrown an error');
} catch (error) {
  expect(error.message).toContain('required');
}
```

### 6. Performance Tests
```javascript
// Cache testing
const start1 = Date.now();
const result1 = await mcp.call('get_task_count', { completed: false });
const time1 = Date.now() - start1;

const start2 = Date.now();
const result2 = await mcp.call('get_task_count', { completed: false });
const time2 = Date.now() - start2;

expect(result2.from_cache).toBe(true);
expect(time2).toBeLessThan(time1 * 0.5); // At least 50% faster
```

## Running the Tests

### With Cucumber.js
```bash
npm install --save-dev @cucumber/cucumber
npx cucumber-js test/features/omnifocus-mcp.feature
```

### As Manual Test Checklist
Each scenario can be executed manually in Claude Desktop by:
1. Opening a new conversation
2. Confirming OmniFocus MCP is connected
3. Running each scenario's steps using the MCP tools
4. Verifying the expected outcomes

### Automated Test Runner
```javascript
// test/run-gherkin-tests.js
import { testRunner } from './gherkin-test-runner.js';
import { scenarios } from './features/omnifocus-mcp.feature';

async function runAllTests() {
  for (const scenario of scenarios) {
    console.log(`Running: ${scenario.name}`);
    try {
      await testRunner.runScenario(scenario);
      console.log(`✅ ${scenario.name} PASSED`);
    } catch (error) {
      console.error(`❌ ${scenario.name} FAILED:`, error.message);
    }
  }
}
```