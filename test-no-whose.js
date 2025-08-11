#!/usr/bin/env node

/**
 * Test without using whose() - manual filtering in JXA
 */

import { execSync } from 'child_process';

const tests = [
  {
    name: "JXA manual filter (no whose)",
    script: `
      (() => {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        const start = Date.now();
        
        // Get ALL tasks (fast) then filter manually
        const allTasks = doc.flattenedTasks();
        let count = 0;
        for (let i = 0; i < allTasks.length; i++) {
          if (!allTasks[i].completed()) {
            count++;
          }
        }
        
        const end = Date.now();
        return JSON.stringify({ count, time: end - start });
      })()`
  },
  {
    name: "JXA manual filter with date check",
    script: `
      (() => {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        const start = Date.now();
        const now = new Date();
        const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        // Get ALL tasks then filter manually
        const allTasks = doc.flattenedTasks();
        const upcoming = [];
        
        for (let i = 0; i < allTasks.length && upcoming.length < 50; i++) {
          const task = allTasks[i];
          if (!task.completed()) {
            try {
              const dueDate = task.dueDate();
              if (dueDate) {
                const dueDateObj = new Date(dueDate);
                if (dueDateObj >= now && dueDateObj <= endDate) {
                  upcoming.push(task.name());
                }
              }
            } catch (e) {
              // Skip if can't get due date
            }
          }
        }
        
        const end = Date.now();
        return JSON.stringify({ count: upcoming.length, time: end - start });
      })()`
  },
  {
    name: "Omni Automation upcoming tasks",
    script: `
      (() => {
        const app = Application('OmniFocus');
        app.includeStandardAdditions = true;
        const result = app.evaluateJavascript(\`
          (() => {
            const start = Date.now();
            const now = new Date();
            const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            
            const upcoming = flattenedTasks.filter(task => {
              return !task.completed && 
                     task.dueDate && 
                     task.dueDate >= now && 
                     task.dueDate <= endDate;
            }).slice(0, 50);
            
            const end = Date.now();
            return JSON.stringify({ count: upcoming.length, time: end - start });
          })()
        \`);
        return result;
      })()`
  }
];

console.log('Performance Test: Manual Filtering vs whose()\n');
console.log('=============================================\n');

for (const test of tests) {
  console.log(`${test.name}:`);
  const startTime = Date.now();
  try {
    const result = execSync(`osascript -l JavaScript -e '${test.script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    const endTime = Date.now();
    const data = JSON.parse(result);
    console.log(`  Count: ${data.count}`);
    console.log(`  Internal time: ${data.time}ms`);
    console.log(`  Total time: ${endTime - startTime}ms\n`);
  } catch (error) {
    console.log(`  Error: ${error.message}\n`);
  }
}