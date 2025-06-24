import { When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

// When steps - Export operations
When('I export tasks with:', async function(dataTable) {
  const params = this.parseDataTable(dataTable);
  this.response = await this.callTool('export_tasks', params);
});

When('I export projects with {string}', async function(paramsString) {
  const params = JSON.parse(`{${paramsString}}`);
  this.response = await this.callTool('export_projects', params);
});

When('I perform bulk export to {string}', async function(outputDirectory) {
  // Use a test directory
  const testDir = path.join(process.cwd(), 'test-export-' + Date.now());
  
  this.response = await this.callTool('bulk_export', {
    outputDirectory: testDir,
    format: 'json',
    includeCompleted: true,
    includeProjectStats: true
  });
  
  this.context.exportDirectory = testDir;
});

// Then steps - Export assertions
Then('I should receive a JSON array of flagged tasks', function() {
  expect(this.response).to.have.property('format', 'json');
  expect(this.response).to.have.property('data');
  
  const tasks = JSON.parse(this.response.data);
  expect(tasks).to.be.an('array');
  
  // Verify all tasks are flagged
  tasks.forEach(task => {
    expect(task.flagged).to.be.true;
  });
});

Then('I should receive CSV data with headers', function() {
  expect(this.response).to.have.property('format', 'csv');
  expect(this.response).to.have.property('data');
  
  const lines = this.response.data.split('\n');
  expect(lines.length).to.be.greaterThan(1);
  
  // Check header row
  const headers = lines[0].split(',');
  expect(headers).to.include('name');
});

Then('only specified fields should be included', function() {
  const lines = this.response.data.split('\n');
  const headers = lines[0].split(',');
  
  // Should only have the fields we requested
  expect(headers).to.have.members(['name', 'project', 'dueDate']);
});

Then('only tasks from {string} project should be exported', function(projectName) {
  if (this.response.format === 'json') {
    const tasks = JSON.parse(this.response.data);
    tasks.forEach(task => {
      expect(task.project).to.equal(projectName);
    });
  }
});

Then('each project should include:', async function(dataTable) {
  const projects = JSON.parse(this.response.data);
  expect(projects).to.be.an('array');
  
  const expectedFields = dataTable.rawTable.slice(1).map(row => row[0]);
  
  projects.forEach(project => {
    expectedFields.forEach(field => {
      expect(project).to.have.property(field);
    });
  });
});

Then('the following files should be created:', async function(dataTable) {
  const expectedFiles = dataTable.rawTable.slice(1); // Skip header
  
  expectedFiles.forEach(row => {
    const fileName = row[0];
    const filePath = path.join(this.context.exportDirectory, fileName);
    
    expect(existsSync(filePath)).to.be.true;
    
    // Verify content is valid JSON
    const content = readFileSync(filePath, 'utf8');
    expect(() => JSON.parse(content)).to.not.throw();
  });
});

Then('each file should be valid JSON', function() {
  // Already verified in the previous step
  expect(true).to.be.true;
});