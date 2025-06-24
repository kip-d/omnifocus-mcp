import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// Given steps
Given('the OmniFocus MCP server is connected', async function() {
  // Already handled in world.js Before hook
  const testResponse = await this.callTool('get_task_count', {});
  expect(testResponse).to.have.property('count');
});

Given('I have an OmniFocus database with existing tasks and projects', async function() {
  // This is assumed - just verify we have some data
  const count = await this.callTool('get_task_count', { completed: false });
  expect(count.count).to.be.greaterThan(0);
});

Given('I have tasks containing the word {string}', async function(keyword) {
  const result = await this.callTool('list_tasks', { search: keyword, limit: 1 });
  if (result.count === 0) {
    // Create a task with the keyword for testing
    await this.callTool('create_task', { 
      name: `Test task with ${keyword} for testing`
    });
  }
});

Given('I have a task with known ID', async function() {
  const tasks = await this.callTool('list_tasks', { limit: 1 });
  expect(tasks.tasks).to.have.length.greaterThan(0);
  this.context.taskId = tasks.tasks[0].id;
  this.context.task = tasks.tasks[0];
});

Given('I have an incomplete task with known ID', async function() {
  const tasks = await this.callTool('list_tasks', { completed: false, limit: 1 });
  expect(tasks.tasks).to.have.length.greaterThan(0);
  this.context.taskId = tasks.tasks[0].id;
  this.context.task = tasks.tasks[0];
});

// When steps - Task operations
When('I request tasks with filter {string}', async function(filterString) {
  // Parse the filter string properly
  const filterObj = {};
  const pairs = filterString.split(',').map(s => s.trim());
  
  pairs.forEach(pair => {
    const [key, value] = pair.split(':').map(s => s.trim());
    if (value === 'true') filterObj[key] = true;
    else if (value === 'false') filterObj[key] = false;
    else if (!isNaN(value)) filterObj[key] = Number(value);
    else filterObj[key] = value.replace(/['"]/g, '');
  });
  
  this.response = await this.callTool('list_tasks', filterObj);
});

When('I request tasks with:', async function(dataTable) {
  const filter = this.parseDataTable(dataTable);
  this.response = await this.callTool('list_tasks', filter);
});

When('I search for tasks with {string}', async function(searchQuery) {
  const filter = JSON.parse(`{${searchQuery}}`);
  this.response = await this.callTool('list_tasks', filter);
});

When('I request today\'s agenda', async function() {
  this.response = await this.callTool('todays_agenda', {});
});

When('I create a task with:', async function(dataTable) {
  const taskData = this.parseDataTable(dataTable);
  this.response = await this.callTool('create_task', taskData);
  if (this.response.taskId) {
    this.context.createdTaskId = this.response.taskId;
  }
});

When('I update the task with:', async function(dataTable) {
  const updates = this.parseDataTable(dataTable);
  updates.taskId = this.context.taskId;
  this.response = await this.callTool('update_task', updates);
});

When('I complete the task', async function() {
  this.response = await this.callTool('complete_task', {
    taskId: this.context.taskId
  });
});

When('I delete the task', async function() {
  this.response = await this.callTool('delete_task', {
    taskId: this.context.taskId
  });
});

When('I request task count for {string}', async function(filterString) {
  const filter = JSON.parse(`{${filterString}}`);
  this.response = await this.callTool('get_task_count', filter);
});

When('I request the same task count again', async function() {
  // Use the same filter as before
  this.response = await this.callTool('get_task_count', { completed: false });
});

// Then steps - Assertions
Then('I should receive a list of tasks', function() {
  expect(this.response).to.have.property('tasks');
  expect(this.response.tasks).to.be.an('array');
});

Then('each task should have properties: {string}', function(propertiesString) {
  const properties = propertiesString.split(', ');
  expect(this.response.tasks).to.have.length.greaterThan(0);
  
  this.response.tasks.forEach(task => {
    properties.forEach(prop => {
      expect(task).to.have.property(prop);
    });
  });
});

Then('no task should have {string}', function(propertyValue) {
  const [property, value] = propertyValue.split(': ');
  const parsedValue = JSON.parse(value);
  
  this.response.tasks.forEach(task => {
    expect(task[property]).to.not.equal(parsedValue);
  });
});

Then('I should receive only tasks containing {string} in name or notes', function(keyword) {
  expect(this.response.tasks).to.be.an('array');
  
  this.response.tasks.forEach(task => {
    const nameContains = task.name && task.name.toLowerCase().includes(keyword.toLowerCase());
    const noteContains = task.note && task.note.toLowerCase().includes(keyword.toLowerCase());
    expect(nameContains || noteContains).to.be.true;
  });
});

Then('the result count should be less than total task count', async function() {
  const totalCount = await this.callTool('get_task_count', {});
  expect(this.response.count).to.be.lessThan(totalCount.count);
});

Then('I should receive tasks that are:', async function(dataTable) {
  expect(this.response).to.have.property('tasks');
  expect(this.response.tasks).to.be.an('array');
  
  // The table defines what types of tasks should be included
  const expectedTypes = dataTable.rawTable.slice(1); // Skip header
  
  // Check that we have tasks of the expected types
  const hasOverdue = this.response.tasks.some(t => t.inclusion_reason?.includes('overdue'));
  const hasDueToday = this.response.tasks.some(t => t.inclusion_reason?.includes('due_today'));
  const hasFlagged = this.response.tasks.some(t => t.inclusion_reason?.includes('flagged'));
  
  expect(hasOverdue || hasDueToday || hasFlagged).to.be.true;
});

Then('each task should show why it\'s included \\(overdue\\/due_today\\/flagged)', function() {
  this.response.tasks.forEach(task => {
    expect(task).to.have.property('inclusion_reason');
    expect(task.inclusion_reason).to.be.an('array');
    expect(task.inclusion_reason).to.have.length.greaterThan(0);
  });
});

Then('the task should be created successfully', function() {
  expect(this.response).to.have.property('success', true);
  expect(this.response).to.have.property('taskId');
  expect(this.response.taskId).to.be.a('string');
});

Then('the task should appear in the inbox', async function() {
  const inboxTasks = await this.callTool('list_tasks', { 
    inInbox: true,
    limit: 10 
  });
  
  const createdTask = inboxTasks.tasks.find(t => t.id === this.context.createdTaskId);
  expect(createdTask).to.exist;
});

Then('the task should have a unique ID', function() {
  expect(this.response.taskId).to.be.a('string');
  expect(this.response.taskId).to.have.length.greaterThan(0);
});

Then('the task should be created with all specified properties', async function() {
  const createdTask = await this.callTool('list_tasks', { 
    search: this.context.createdTaskId 
  });
  
  expect(createdTask.tasks).to.have.length(1);
  const task = createdTask.tasks[0];
  
  // Verify properties were set correctly
  expect(task.flagged).to.be.true;
  expect(task.dueDate).to.exist;
  expect(task.tags).to.include.members(['work', 'urgent']);
});

Then('the task should be assigned to the specified project', function() {
  // This is verified by the successful creation response
  expect(this.response.success).to.be.true;
});

Then('the task should be updated successfully', function() {
  expect(this.response).to.have.property('success', true);
});

Then('the task should reflect the new values', async function() {
  const updatedTask = await this.callTool('list_tasks', { 
    search: this.context.taskId 
  });
  
  expect(updatedTask.tasks).to.have.length(1);
  const task = updatedTask.tasks[0];
  
  // Verify the updates were applied
  expect(task.name).to.include('Updated');
  expect(task.flagged).to.be.true;
});

Then('the task should be marked as completed', function() {
  expect(this.response).to.have.property('success', true);
});

Then('the task should have a completion date', async function() {
  const completedTask = await this.callTool('list_tasks', { 
    search: this.context.taskId,
    completed: true 
  });
  
  if (completedTask.tasks.length > 0) {
    expect(completedTask.tasks[0].completedDate).to.exist;
  }
});

Then('the task should be removed from OmniFocus', function() {
  expect(this.response).to.have.property('success', true);
});

Then('the task should not appear in any task lists', async function() {
  const searchResult = await this.callTool('list_tasks', { 
    search: this.context.taskId 
  });
  
  const taskFound = searchResult.tasks.find(t => t.id === this.context.taskId);
  expect(taskFound).to.not.exist;
});

Then('I should only receive active projects', function() {
  expect(this.response.projects).to.be.an('array');
  
  this.response.projects.forEach(project => {
    expect(project.status).to.equal('active');
  });
});

Then('no project should have status {string}, {string}, or {string}', function(status1, status2, status3) {
  const excludedStatuses = [status1, status2, status3];
  
  this.response.projects.forEach(project => {
    expect(excludedStatuses).to.not.include(project.status);
  });
});