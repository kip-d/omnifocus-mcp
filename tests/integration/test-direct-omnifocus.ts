#!/usr/bin/env node

/**
 * Direct test of OmniFocus JXA script execution
 */

import { execSync } from 'child_process';

console.log('Testing direct OmniFocus access...\n');

try {
  // Test 1: Simple count
  console.log('1. Getting task count...');
  const countScript = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    const tasks = doc.flattenedTasks();
    JSON.stringify({count: tasks.length});
  `;
  
  const countResult = execSync(`osascript -l JavaScript -e '${countScript}'`, {
    encoding: 'utf8',
    timeout: 5000
  }).trim();
  
  console.log(`✓ Found ${JSON.parse(countResult).count} tasks\n`);
  
  // Test 2: Get a task with ID
  console.log('2. Getting first task with ID...');
  const idScript = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    const tasks = doc.flattenedTasks();
    if (tasks.length > 0) {
      const task = tasks[0];
      JSON.stringify({
        name: task.name(),
        id: task.id.primaryKey(),
        idType: typeof task.id.primaryKey
      });
    } else {
      JSON.stringify({error: 'No tasks found'});
    }
  `;
  
  const idResult = execSync(`osascript -l JavaScript -e '${idScript}'`, {
    encoding: 'utf8',
    timeout: 5000
  }).trim();
  
  const taskData = JSON.parse(idResult);
  if (taskData.error) {
    console.log(`⚠️  ${taskData.error}`);
  } else {
    console.log(`✓ First task: "${taskData.name}"`);
    console.log(`  ID: ${taskData.id}`);
    console.log(`  ID type: ${taskData.idType}\n`);
  }
  
  // Test 3: Create and retrieve a task
  console.log('3. Creating a test task...');
  const createScript = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    const taskName = 'Direct Test Task ' + Date.now();
    
    // Create task
    const newTask = app.InboxTask({name: taskName});
    doc.inboxTasks.push(newTask);
    
    // Find it again to get ID
    const inbox = doc.inboxTasks();
    let foundTask = null;
    for (let i = inbox.length - 1; i >= 0; i--) {
      if (inbox[i].name() === taskName) {
        foundTask = inbox[i];
        break;
      }
    }
    
    if (foundTask) {
      JSON.stringify({
        created: true,
        name: foundTask.name(),
        id: foundTask.id.primaryKey(),
        idString: String(foundTask.id.primaryKey())
      });
    } else {
      JSON.stringify({error: 'Could not find created task'});
    }
  `;
  
  const createResult = execSync(`osascript -l JavaScript -e '${createScript}'`, {
    encoding: 'utf8',
    timeout: 10000
  }).trim();
  
  const created = JSON.parse(createResult);
  if (created.error) {
    console.log(`❌ ${created.error}`);
  } else {
    console.log(`✓ Created task: "${created.name}"`);
    console.log(`  ID: ${created.id}`);
    console.log(`  ID as string: ${created.idString}`);
  }
  
  console.log('\n✅ Direct OmniFocus access is working!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.message.includes('timeout')) {
    console.error('\nOmniFocus appears to be hanging or not responding.');
    console.error('Please try:');
    console.error('1. Quit and restart OmniFocus');
    console.error('2. Check if OmniFocus has any dialog boxes open');
    console.error('3. Make sure OmniFocus has automation permissions');
  }
  process.exit(1);
}