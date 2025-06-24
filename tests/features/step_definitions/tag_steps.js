import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// Given steps
Given('I have a tag named {string}', async function(tagName) {
  const tags = await this.callTool('list_tags', {});
  const tagExists = tags.tags.some(t => t.name === tagName);
  
  if (!tagExists) {
    await this.callTool('manage_tags', {
      action: 'create',
      tagName: tagName
    });
  }
  
  this.context.tagName = tagName;
});

Given('I have tags {string} and {string}', async function(tag1, tag2) {
  // Create both tags if they don't exist
  for (const tagName of [tag1, tag2]) {
    await this.callTool('manage_tags', {
      action: 'create',
      tagName: tagName
    }).catch(() => {
      // Tag might already exist, that's ok
    });
  }
  
  this.context.tag1 = tag1;
  this.context.tag2 = tag2;
});

Given('I have a tag with no associated tasks', async function() {
  const tagName = `empty-tag-${Date.now()}`;
  
  await this.callTool('manage_tags', {
    action: 'create',
    tagName: tagName
  });
  
  this.context.tagName = tagName;
});

// When steps - Tag operations
When('I request all tags sorted by {string}', async function(sortBy) {
  this.response = await this.callTool('list_tags', {
    sortBy: sortBy
  });
});

When('I create a tag named {string}', async function(tagName) {
  this.response = await this.callTool('manage_tags', {
    action: 'create',
    tagName: tagName
  });
  
  this.context.createdTagName = tagName;
});

When('I rename the tag to {string}', async function(newName) {
  this.response = await this.callTool('manage_tags', {
    action: 'rename',
    tagName: this.context.tagName,
    newName: newName
  });
  
  this.context.renamedTagName = newName;
});

When('I merge {string} into {string}', async function(sourceTag, targetTag) {
  this.response = await this.callTool('manage_tags', {
    action: 'merge',
    tagName: sourceTag,
    targetTag: targetTag
  });
});

When('I delete the tag', async function() {
  this.response = await this.callTool('manage_tags', {
    action: 'delete',
    tagName: this.context.tagName
  });
});

// Then steps - Tag assertions
Then('I should receive a list of tags', function() {
  expect(this.response).to.have.property('tags');
  expect(this.response.tags).to.be.an('array');
});

Then('each tag should show:', async function(dataTable) {
  expect(this.response.tags).to.have.length.greaterThan(0);
  
  const expectedProperties = dataTable.rawTable.slice(1).map(row => row[0]);
  
  this.response.tags.forEach(tag => {
    expectedProperties.forEach(prop => {
      expect(tag).to.have.property(prop);
    });
  });
});

Then('tags should be sorted by usage count descending', function() {
  for (let i = 1; i < this.response.tags.length; i++) {
    const prevCount = this.response.tags[i - 1].taskCount || 0;
    const currCount = this.response.tags[i].taskCount || 0;
    expect(prevCount).to.be.at.least(currCount);
  }
});

Then('the tag should be created successfully', function() {
  expect(this.response).to.have.property('success', true);
});

Then('the tag should appear in the tags list', async function() {
  const tags = await this.callTool('list_tags', {});
  const tagExists = tags.tags.some(t => t.name === this.context.createdTagName);
  expect(tagExists).to.be.true;
});

Then('all tasks with {string} should now have {string}', async function(oldTag, newTag) {
  // Check that no tasks have the old tag
  const oldTagTasks = await this.callTool('list_tasks', {
    tags: [oldTag],
    limit: 1
  });
  
  expect(oldTagTasks.count).to.equal(0);
  
  // Verify the new tag exists in the system
  const tags = await this.callTool('list_tags', {});
  const newTagExists = tags.tags.some(t => t.name === newTag);
  expect(newTagExists).to.be.true;
});

Then('{string} should not exist in the tags list', async function(tagName) {
  const tags = await this.callTool('list_tags', {});
  const tagExists = tags.tags.some(t => t.name === tagName);
  expect(tagExists).to.be.false;
});

Then('{string} should be deleted', async function(tagName) {
  const tags = await this.callTool('list_tags', {});
  const tagExists = tags.tags.some(t => t.name === tagName);
  expect(tagExists).to.be.false;
});

Then('the tag should be removed from OmniFocus', function() {
  expect(this.response).to.have.property('success', true);
});