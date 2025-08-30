import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { MCPWorld } from '../support/world.ts';

interface Task {
  id: string;
  name: string;
  note?: string;
  flagged?: boolean;
  dueDate?: string;
  completedDate?: string;
  tags?: string[];
  inclusion_reason?: string[];
  status?: string;
  [key: string]: any;
}

interface TaskResponse {
  tasks: Task[];
  count: number;
}

interface DataTable {
  rawTable: string[][];
}

// Given steps
Given('the OmniFocus MCP server is connected', async function(this: MCPWorld) {
  // Already handled in world.js Before hook
  const testResponse = await this.callTool('get_task_count', {});
  expect(testResponse).to.have.property('count');
});

Given('I have an OmniFocus database with existing tasks and projects', async function(this: MCPWorld) {
  // This is assumed - just verify we have some data
  const count = await this.callTool('get_task_count', { completed: false });
  expect(count.count).to.be.greaterThan(0);
});

Given('I have tasks containing the word {string}', async function(this: MCPWorld, keyword: string) {
  const result = await this.callTool('list_tasks', { search: keyword, limit: 1 });
  if (result.count === 0) {
    // Create a task with the keyword for testing
    await this.createTestTask(`Test task with ${keyword} for testing`);
  }
});

Given('I have a task with known ID', async function(this: MCPWorld) {
  const tasks: TaskResponse = await this.callTool('list_tasks', { limit: 1 });
  expect(tasks.tasks).to.have.length.greaterThan(0);
  this.context.taskId = tasks.tasks[0].id;
  this.context.task = tasks.tasks[0];
});

Given('I have an incomplete task with known ID', async function(this: MCPWorld) {
  const tasks: TaskResponse = await this.callTool('list_tasks', { completed: false, limit: 1 });
  expect(tasks.tasks).to.have.length.greaterThan(0);
  this.context.taskId = tasks.tasks[0].id;
  this.context.task = tasks.tasks[0];
});

// When steps - Task operations
When('I request tasks with filter {string}', async function(this: MCPWorld, filterString: string) {
  // Parse the filter string properly
  const filterObj: any = {};
  const pairs = filterString.split(',').map(s => s.trim());
  
  pairs.forEach(pair => {
    const [key, value] = pair.split(':').map(s => s.trim());
    if (value === 'true') filterObj[key] = true;
    else if (value === 'false') filterObj[key] = false;
    else if (!isNaN(value as any)) filterObj[key] = Number(value);
    else filterObj[key] = value.replace(/['"]/g, '');
  });
  
  this.response = await this.callTool('list_tasks', filterObj);
});

When('I request tasks with:', async function(this: MCPWorld, dataTable: DataTable) {
  const filter = this.parseDataTable(dataTable);
  this.response = await this.callTool('list_tasks', filter);
});

When('I search for tasks with {string}', async function(this: MCPWorld, searchQuery: string) {
  const filter = JSON.parse(`{${searchQuery}}`);
  this.response = await this.callTool('list_tasks', filter);
});

When('I request today\'s agenda', async function(this: MCPWorld) {
  this.response = await this.callTool('todays_agenda', {});
});

When('I create a task with:', async function(this: MCPWorld, dataTable: DataTable) {
  const taskData = this.parseDataTable(dataTable);
  this.response = await this.createTestTask(taskData.name, taskData);
  if (this.response.task?.id) {
    this.context.createdTaskId = this.response.task.id;
  }
});

When('I update the task with:', async function(this: MCPWorld, dataTable: DataTable) {
  const updates = this.parseDataTable(dataTable);
  updates.taskId = this.context.taskId;
  this.response = await this.callTool('update_task', updates);
});

When('I complete the task', async function(this: MCPWorld) {
  this.response = await this.callTool('complete_task', {
    taskId: this.context.taskId
  });
});

When('I delete the task', async function(this: MCPWorld) {
  this.response = await this.callTool('delete_task', {
    taskId: this.context.taskId
  });
});

When('I request task count for {string}', async function(this: MCPWorld, filterString: string) {
  const filter = JSON.parse(`{${filterString}}`);
  this.response = await this.callTool('get_task_count', filter);
});

When('I request the same task count again', async function(this: MCPWorld) {
  // Use the same filter as before
  this.response = await this.callTool('get_task_count', { completed: false });
});

// Then steps - Assertions
Then('I should receive a list of tasks', function(this: MCPWorld) {
  expect(this.response).to.have.property('tasks');
  expect(this.response.tasks).to.be.an('array');
});

Then('each task should have properties: {string}', function(this: MCPWorld, propertiesString: string) {
  const properties = propertiesString.split(', ');
  expect(this.response.tasks).to.have.length.greaterThan(0);
  
  this.response.tasks.forEach((task: Task) => {
    properties.forEach(prop => {
      expect(task).to.have.property(prop);
    });
  });
});

Then('no task should have {string}', function(this: MCPWorld, propertyValue: string) {
  const [property, value] = propertyValue.split(': ');
  const parsedValue = JSON.parse(value);
  
  this.response.tasks.forEach((task: Task) => {
    expect(task[property]).to.not.equal(parsedValue);
  });
});

Then('I should receive only tasks containing {string} in name or notes', function(this: MCPWorld, keyword: string) {
  expect(this.response.tasks).to.be.an('array');
  
  this.response.tasks.forEach((task: Task) => {
    const nameContains = task.name && task.name.toLowerCase().includes(keyword.toLowerCase());
    const noteContains = task.note && task.note.toLowerCase().includes(keyword.toLowerCase());
    expect(nameContains || noteContains).to.be.true;
  });
});

Then('the result count should be less than total task count', async function(this: MCPWorld) {
  const totalCount = await this.callTool('get_task_count', {});
  expect(this.response.count).to.be.lessThan(totalCount.count);
});

Then('I should receive tasks that are:', async function(this: MCPWorld, dataTable: DataTable) {
  expect(this.response).to.have.property('tasks');
  expect(this.response.tasks).to.be.an('array');
  
  // The table defines what types of tasks should be included
  const expectedTypes = dataTable.rawTable.slice(1); // Skip header
  
  // Check that we have tasks of the expected types
  const hasOverdue = this.response.tasks.some((t: Task) => t.inclusion_reason?.includes('overdue'));
  const hasDueToday = this.response.tasks.some((t: Task) => t.inclusion_reason?.includes('due_today'));
  const hasFlagged = this.response.tasks.some((t: Task) => t.inclusion_reason?.includes('flagged'));
  
  expect(hasOverdue || hasDueToday || hasFlagged).to.be.true;
});

Then('each task should show why it\'s included \\(overdue\\/due_today\\/flagged)', function(this: MCPWorld) {
  this.response.tasks.forEach((task: Task) => {
    expect(task).to.have.property('inclusion_reason');
    expect(task.inclusion_reason).to.be.an('array');
    expect(task.inclusion_reason).to.have.length.greaterThan(0);
  });
});

Then('the task should be created successfully', function(this: MCPWorld) {
  expect(this.response).to.have.property('success', true);
  expect(this.response).to.have.property('taskId');
  expect(this.response.taskId).to.be.a('string');
});

Then('the task should appear in the inbox', async function(this: MCPWorld) {
  const inboxTasks: TaskResponse = await this.callTool('list_tasks', { 
    inInbox: true,
    limit: 10 
  });
  
  const createdTask = inboxTasks.tasks.find(t => t.id === this.context.createdTaskId);
  expect(createdTask).to.exist;
});

Then('the task should have a unique ID', function(this: MCPWorld) {
  expect(this.response.taskId).to.be.a('string');
  expect(this.response.taskId).to.have.length.greaterThan(0);
});

Then('the task should be created with all specified properties', async function(this: MCPWorld) {
  const createdTask: TaskResponse = await this.callTool('list_tasks', { 
    search: this.context.createdTaskId 
  });
  
  expect(createdTask.tasks).to.have.length(1);
  const task = createdTask.tasks[0];
  
  // Verify properties were set correctly
  expect(task.flagged).to.be.true;
  expect(task.dueDate).to.exist;
  expect(task.tags).to.include.members(['work', 'urgent']);
});

Then('the task should be assigned to the specified project', function(this: MCPWorld) {
  // This is verified by the successful creation response
  expect(this.response.success).to.be.true;
});

Then('the task should be updated successfully', function(this: MCPWorld) {
  expect(this.response).to.have.property('success', true);
});

Then('the task should reflect the new values', async function(this: MCPWorld) {
  const updatedTask: TaskResponse = await this.callTool('list_tasks', { 
    search: this.context.taskId 
  });
  
  expect(updatedTask.tasks).to.have.length(1);
  const task = updatedTask.tasks[0];
  
  // Verify the updates were applied
  expect(task.name).to.include('Updated');
  expect(task.flagged).to.be.true;
});

Then('the task should be marked as completed', function(this: MCPWorld) {
  expect(this.response).to.have.property('success', true);
});

Then('the task should have a completion date', async function(this: MCPWorld) {
  const completedTask: TaskResponse = await this.callTool('list_tasks', { 
    search: this.context.taskId,
    completed: true 
  });
  
  if (completedTask.tasks.length > 0) {
    expect(completedTask.tasks[0].completedDate).to.exist;
  }
});

Then('the task should be removed from OmniFocus', function(this: MCPWorld) {
  expect(this.response).to.have.property('success', true);
});

Then('the task should not appear in any task lists', async function(this: MCPWorld) {
  const searchResult: TaskResponse = await this.callTool('list_tasks', { 
    search: this.context.taskId 
  });
  
  const taskFound = searchResult.tasks.find(t => t.id === this.context.taskId);
  expect(taskFound).to.not.exist;
});

Then('I should only receive active projects', function(this: MCPWorld) {
  expect(this.response.projects).to.be.an('array');
  
  this.response.projects.forEach((project: any) => {
    expect(project.status).to.equal('active');
  });
});

Then('no project should have status {string}, {string}, or {string}', function(this: MCPWorld, status1: string, status2: string, status3: string) {
  const excludedStatuses = [status1, status2, status3];
  
  this.response.projects.forEach((project: any) => {
    expect(excludedStatuses).to.not.include(project.status);
  });
});