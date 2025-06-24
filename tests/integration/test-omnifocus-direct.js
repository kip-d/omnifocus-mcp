#!/usr/bin/env node

/**
 * Direct test of OmniFocus JXA API
 */

import { execSync } from 'child_process';

console.log('Testing OmniFocus Direct Access...\n');

const tests = [
  {
    name: 'Get OmniFocus version',
    script: `Application("OmniFocus").version()`
  },
  {
    name: 'Access default document',
    script: `const app = Application("OmniFocus"); app.defaultDocument.name()`
  },
  {
    name: 'Create a simple task in inbox',
    script: `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const taskName = "Direct Test " + Date.now();
      
      // Create task using make() method
      const task = app.make({
        new: "task",
        withProperties: {
          name: taskName
        },
        at: doc.inboxTasks
      });
      
      taskName;
    `
  },
  {
    name: 'List first few inbox tasks',
    script: `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const inbox = doc.inboxTasks;
      const tasks = [];
      
      // Get up to 5 tasks
      const count = Math.min(5, inbox.length);
      for (let i = 0; i < count; i++) {
        try {
          const task = inbox[i];
          tasks.push({
            name: task.name(),
            id: task.id()
          });
        } catch (e) {
          tasks.push({error: e.toString()});
        }
      }
      
      JSON.stringify(tasks);
    `
  },
  {
    name: 'Get projects count',
    script: `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      doc.projects.length;
    `
  }
];

for (const test of tests) {
  console.log(`🧪 ${test.name}...`);
  try {
    const result = execSync(`osascript -l JavaScript -e '${test.script.replace(/'/g, "\\'")}'`, {
      encoding: 'utf8',
      timeout: 10000
    }).trim();
    console.log(`✅ Result: ${result}\n`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);
  }
}

// Now test with the actual script template
console.log('🧪 Testing with actual MCP script template...');
try {
  const script = `
    const app = Application("OmniFocus");
    const doc = app.defaultDocument;
    
    const filter = {limit: 5, completed: false};
    const tasks = [];
    
    // Try different approaches
    try {
      // Approach 1: Use inbox tasks
      const inboxTasks = doc.inboxTasks;
      const limit = Math.min(filter.limit || 5, inboxTasks.length);
      
      for (let i = 0; i < limit; i++) {
        try {
          const task = inboxTasks[i];
          tasks.push({
            id: task.id(),
            name: task.name(),
            completed: task.completed(),
            flagged: task.flagged()
          });
        } catch (e) {
          // Skip problematic tasks
        }
      }
      
      JSON.stringify({
        success: true,
        approach: "inbox",
        count: tasks.length,
        tasks: tasks
      });
    } catch (error) {
      JSON.stringify({
        error: true,
        message: error.toString(),
        approach: "inbox"
      });
    }
  `;
  
  const result = execSync(`osascript -l JavaScript -e '${script.replace(/'/g, "\\'")}'`, {
    encoding: 'utf8',
    timeout: 10000
  }).trim();
  
  console.log('✅ Script result:', result);
  
} catch (error) {
  console.log('❌ Script error:', error.message);
}