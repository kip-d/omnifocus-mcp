import { When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { MCPWorld } from '../support/world.ts';

interface DataTable {
  rawTable: string[][];
}

// When steps - Error scenarios
When('I try to update task with ID {string}', async function(this: MCPWorld, taskId: string) {
  try {
    this.response = await this.callTool('update_task', {
      taskId: taskId,
      name: 'This should fail'
    });
    this.context.errorOccurred = false;
  } catch (error) {
    this.context.error = error;
    this.context.errorOccurred = true;
  }
});

When('I try to update project {string}', async function(this: MCPWorld, projectName: string) {
  try {
    this.response = await this.callTool('update_project', {
      projectName: projectName,
      updates: { note: 'This should fail' }
    });
    this.context.errorOccurred = false;
  } catch (error) {
    this.context.error = error;
    this.context.errorOccurred = true;
  }
});

When('I simultaneously:', async function(this: MCPWorld, dataTable: DataTable) {
  // For concurrent operations testing
  const operations = dataTable.rawTable.slice(1).map(row => row[1]);
  
  const promises = operations.map(async (op) => {
    if (op.includes('Create task')) {
      return this.callTool('create_task', { name: op });
    } else if (op.includes('List all tasks')) {
      return this.callTool('list_tasks', { limit: 10 });
    }
    return Promise.resolve({});
  });
  
  const results = await Promise.all(promises);
  this.context.concurrentResults = results;
});

// Then steps - Error assertions
Then('I should receive an error message', function(this: MCPWorld) {
  expect(this.context.errorOccurred).to.be.true;
  expect(this.context.error).to.exist;
});

Then('the error should indicate {string}', function(this: MCPWorld, expectedMessage: string) {
  expect(this.context.error.message.toLowerCase()).to.include(expectedMessage.toLowerCase());
});

Then('I should receive at most {int} tasks', function(this: MCPWorld, maxTasks: number) {
  expect(this.response.tasks).to.have.length.at.most(maxTasks);
});

Then('the response should indicate if more results exist', function(this: MCPWorld) {
  expect(this.response).to.have.property('has_more');
});

Then('I should receive an empty task list', function(this: MCPWorld) {
  expect(this.response.tasks).to.be.an('array');
  expect(this.response.tasks).to.have.length(0);
});

Then('no error should occur', function(this: MCPWorld) {
  expect(this.response).to.exist;
  expect(this.context.errorOccurred).to.not.be.true;
});

Then('the special characters should be preserved', async function(this: MCPWorld) {
  // Verify the created task has the special characters
  const createdTask = await this.callTool('list_tasks', {
    search: this.context.createdTaskId
  });
  
  expect(createdTask.tasks).to.have.length.greaterThan(0);
  const task = createdTask.tasks[0];
  
  expect(task.name).to.include('"quotes"');
  expect(task.name).to.include('émojis');
  expect(task.name).to.include('🎯');
});

Then('tasks without due dates should not be included', function(this: MCPWorld) {
  // All tasks in the response should have due dates
  this.response.tasks.forEach((task: any) => {
    expect(task.dueDate).to.exist;
  });
});

Then('no error should occur for null date values', function(this: MCPWorld) {
  expect(this.response).to.exist;
  expect(this.response.tasks).to.be.an('array');
});

Then('all operations should complete successfully', function(this: MCPWorld) {
  expect(this.context.concurrentResults).to.have.length(3);
  
  this.context.concurrentResults.forEach((result: any) => {
    expect(result).to.exist;
  });
});

Then('no data corruption should occur', async function(this: MCPWorld) {
  // Verify the system is still functional
  const count = await this.callTool('get_task_count', {});
  expect(count.count).to.be.a('number');
  expect(count.count).to.be.greaterThan(0);
});