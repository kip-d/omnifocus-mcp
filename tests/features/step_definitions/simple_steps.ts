import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { MCPWorld } from '../support/world.js';

// Simple step definitions that work with the MCP server

When('I count incomplete tasks', async function(this: MCPWorld) {
  this.response = await this.callTool('get_task_count', {
    completed: false
  });
});

Then('I should have more than {int} incomplete tasks', async function(this: MCPWorld, minCount: number) {
  expect(this.response).to.have.property('count');
  expect(this.response.count).to.be.greaterThan(minCount);
  console.log(`  → Found ${this.response.count} incomplete tasks`);
});

When('I get today\'s agenda', async function(this: MCPWorld) {
  this.response = await this.callTool('todays_agenda', {});
});

Then('I should see my agenda for today', function(this: MCPWorld) {
  expect(this.response).to.have.property('tasks');
  expect(this.response.tasks).to.be.an('array');
  console.log(`  → Today's agenda has ${this.response.tasks.length} items`);
  console.log(`  → Overdue: ${this.response.overdue_count || 0}, Flagged: ${this.response.flagged_count || 0}`);
});

When('I create a simple test task', async function(this: MCPWorld) {
  const taskName = `Cucumber Test - ${new Date().toISOString()}`;
  this.response = await this.callTool('create_task', {
    name: taskName
  });
  this.context.createdTaskName = taskName;
});

Then('the task should be created', function(this: MCPWorld) {
  expect(this.response).to.have.property('success', true);
  expect(this.response).to.have.property('task');
  expect(this.response.task).to.have.property('id');
  console.log(`  → Created task: "${this.context.createdTaskName}"`);
  console.log(`  → Task ID: ${this.response.task.id}`);
});

When('I list all my tags', async function(this: MCPWorld) {
  this.response = await this.callTool('list_tags', {
    sortBy: 'name',
    includeEmpty: false
  });
});

Then('I should see a list of tags', function(this: MCPWorld) {
  expect(this.response).to.have.property('tags');
  expect(this.response.tags).to.be.an('array');
  console.log(`  → Found ${this.response.tags.length} tags in use`);
  
  // Show top 5 tags
  if (this.response.tags.length > 0) {
    console.log('  → Top tags:');
    this.response.tags.slice(0, 5).forEach((tag: any) => {
      console.log(`     • ${tag.name} (${tag.taskCount} tasks)`);
    });
  }
});