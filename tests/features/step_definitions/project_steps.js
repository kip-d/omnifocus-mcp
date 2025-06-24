import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// Given steps
Given('I have a project named {string}', async function(projectName) {
  const projects = await this.callTool('list_projects', { search: projectName });
  
  if (projects.projects.length === 0) {
    // Create the project if it doesn't exist
    await this.callTool('create_project', { name: projectName });
  }
  
  const updatedProjects = await this.callTool('list_projects', { search: projectName });
  this.context.project = updatedProjects.projects.find(p => p.name === projectName);
  expect(this.context.project).to.exist;
});

Given('I have a project with incomplete tasks', async function() {
  // Find a project with tasks
  const projects = await this.callTool('list_projects', {});
  
  for (const project of projects.projects) {
    if (project.taskCount > 0) {
      this.context.project = project;
      break;
    }
  }
  
  if (!this.context.project) {
    // Create a project with a task
    const createResult = await this.callTool('create_project', { 
      name: 'Test Project with Tasks' 
    });
    
    await this.callTool('create_task', {
      name: 'Task in project',
      projectId: createResult.projectId
    });
    
    const projects = await this.callTool('list_projects', { 
      search: 'Test Project with Tasks' 
    });
    this.context.project = projects.projects[0];
  }
  
  expect(this.context.project).to.exist;
});

Given('I have an empty project', async function() {
  // Create a new empty project
  const projectName = `Empty Project ${Date.now()}`;
  await this.callTool('create_project', { name: projectName });
  
  const projects = await this.callTool('list_projects', { search: projectName });
  this.context.project = projects.projects[0];
  expect(this.context.project.taskCount).to.equal(0);
});

// When steps - Project operations
When('I request all projects', async function() {
  this.response = await this.callTool('list_projects', {});
});

When('I request projects with {string}', async function(filterString) {
  const filter = JSON.parse(`{${filterString}}`);
  this.response = await this.callTool('list_projects', filter);
});

When('I create a project with:', async function(dataTable) {
  const projectData = this.parseDataTable(dataTable);
  this.response = await this.callTool('create_project', projectData);
  
  if (this.response.projectId) {
    this.context.createdProjectId = this.response.projectId;
    this.context.createdProjectName = projectData.name;
  }
});

When('I update the project with:', async function(dataTable) {
  const updates = this.parseDataTable(dataTable);
  
  this.response = await this.callTool('update_project', {
    projectName: this.context.project.name,
    updates: updates
  });
});

When('I complete the project with {string}', async function(paramsString) {
  const params = JSON.parse(`{${paramsString}}`);
  
  this.response = await this.callTool('complete_project', {
    projectName: this.context.project.name,
    ...params
  });
});

When('I delete the project', async function() {
  this.response = await this.callTool('delete_project', {
    projectName: this.context.project.name
  });
});

// Then steps - Project assertions
Then('I should receive a list of projects', function() {
  expect(this.response).to.have.property('projects');
  expect(this.response.projects).to.be.an('array');
});

Then('each project should have: {string}', function(propertiesString) {
  const properties = propertiesString.split(', ');
  
  expect(this.response.projects).to.have.length.greaterThan(0);
  
  this.response.projects.forEach(project => {
    properties.forEach(prop => {
      expect(project).to.have.property(prop);
    });
  });
});

Then('the project should be created successfully', function() {
  expect(this.response).to.have.property('success', true);
  expect(this.response).to.have.property('projectId');
});

Then('the project should appear in the {word} folder', async function(folderName) {
  const projects = await this.callTool('list_projects', { 
    search: this.context.createdProjectName 
  });
  
  const project = projects.projects.find(p => p.name === this.context.createdProjectName);
  expect(project).to.exist;
  
  if (folderName !== 'root') {
    expect(project.folder).to.equal(folderName);
  }
});

Then('the project should be updated successfully', function() {
  expect(this.response).to.have.property('success', true);
});

Then('the project status should be {string}', async function(expectedStatus) {
  const projects = await this.callTool('list_projects', { 
    search: this.context.project.name 
  });
  
  const project = projects.projects.find(p => p.name === this.context.project.name);
  expect(project).to.exist;
  expect(project.status).to.equal(expectedStatus);
});

Then('the project should be marked as done', function() {
  expect(this.response).to.have.property('success', true);
});

Then('all tasks in the project should be completed', async function() {
  const tasks = await this.callTool('list_tasks', {
    projectId: this.context.project.id,
    completed: false
  });
  
  expect(tasks.count).to.equal(0);
});

Then('the project should be removed from OmniFocus', function() {
  expect(this.response).to.have.property('success', true);
});