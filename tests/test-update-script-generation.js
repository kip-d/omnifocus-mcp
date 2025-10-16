#!/usr/bin/env node

/**
 * Test what script update-task.ts actually generates
 */

import { UPDATE_TASK_SCRIPT } from './dist/omnifocus/scripts/tasks/update-task.js';

const testTaskId = 'test-id-123';
const testUpdates = {
  tags: ['updated-tag', 'second-tag']
};

// Generate the script
const scriptTemplate = UPDATE_TASK_SCRIPT;

// Substitute placeholders like the script executor would
const script = scriptTemplate
  .replace(/\{\{taskId\}\}/g, JSON.stringify(testTaskId))
  .replace(/\{\{updates\}\}/g, JSON.stringify(testUpdates));

// Find and print the tag-related section
const lines = script.split('\n');
let inTagSection = false;
let tagSection = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Start capturing at tag update comment
  if (line.includes('Update tags') || line.includes('tags using')) {
    inTagSection = true;
  }

  if (inTagSection) {
    tagSection.push(`${i+1}: ${line}`);

    // Stop after the tag section ends
    if (line.includes('Re-fetch task ID') || line.includes('Build response')) {
      break;
    }
  }
}

console.log('🔍 Tag update section of generated script:\n');
console.log(tagSection.join('\n'));
console.log('\n📊 Substituted values:');
console.log('taskId:', testTaskId);
console.log('updates:', JSON.stringify(testUpdates, null, 2));
