import { When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { MCPWorld } from '../support/world.js';

interface DataTable {
  rawTable: string[][];
}

// When steps - Analytics operations
When('I request productivity stats for {string}', async function(this: MCPWorld, paramsString: string) {
  const params = JSON.parse(`{${paramsString}}`);
  this.response = await this.callTool('get_productivity_stats', params);
});

When('I request task velocity for {string}', async function(this: MCPWorld, paramsString: string) {
  const params = JSON.parse(`{${paramsString}}`);
  this.response = await this.callTool('get_task_velocity', params);
});

When('I analyze overdue tasks grouped by {string}', async function(this: MCPWorld, groupBy: string) {
  this.response = await this.callTool('analyze_overdue_tasks', {
    groupBy: groupBy
  });
});

When('I analyze recurring tasks', async function(this: MCPWorld) {
  this.response = await this.callTool('analyze_recurring_tasks', {
    activeOnly: true,
    sortBy: 'frequency'
  });
});

// Then steps - Analytics assertions
Then('I should receive statistics including:', async function(this: MCPWorld, dataTable: DataTable) {
  expect(this.response).to.have.property('stats');
  
  const expectedMetrics = dataTable.rawTable.slice(1); // Skip header
  
  expectedMetrics.forEach(row => {
    const metricName = row[0];
    expect(this.response.stats).to.have.property(metricName);
  });
});

Then('I should receive velocity metrics including:', async function(this: MCPWorld, dataTable: DataTable) {
  expect(this.response).to.have.property('velocity');
  
  const expectedMetrics = dataTable.rawTable.slice(1); // Skip header
  
  expectedMetrics.forEach(row => {
    const metricName = row[0];
    expect(this.response.velocity).to.have.property(metricName);
  });
});

Then('I should receive:', async function(this: MCPWorld, dataTable: DataTable) {
  const expectedFields = dataTable.rawTable.slice(1); // Skip header
  
  expectedFields.forEach(row => {
    const fieldName = row[0];
    
    if (this.response.analysis) {
      expect(this.response.analysis).to.have.property(fieldName);
    } else if (this.response.patterns) {
      expect(this.response).to.have.property(fieldName);
    } else {
      expect(this.response).to.have.property(fieldName);
    }
  });
});