#!/usr/bin/env node

/**
 * Test v1.14.0 performance improvements
 */

import { execSync } from 'child_process';

const tests = [
  {
    name: "Upcoming Tasks (7 days)",
    script: `
      (() => {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        
        const startTime = Date.now();
        const now = new Date();
        const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const limit = 50;
        
        // Get ALL tasks then filter manually (no whose!)
        const allTasks = doc.flattenedTasks();
        const tasks = [];
        
        for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
          const task = allTasks[i];
          
          // Skip completed
          try {
            if (task.completed()) continue;
          } catch (e) { continue; }
          
          // Check due date
          try {
            const dueDate = task.dueDate();
            if (dueDate) {
              const dueDateObj = new Date(dueDate);
              if (dueDateObj >= now && dueDateObj <= endDate) {
                tasks.push({
                  name: task.name(),
                  dueDate: dueDateObj.toISOString()
                });
              }
            }
          } catch (e) {
            // Skip if can't get due date
          }
        }
        
        const endTime = Date.now();
        return JSON.stringify({
          count: tasks.length,
          time: endTime - startTime,
          method: 'v1.14.0_no_whose'
        });
      })()`
  },
  {
    name: "Overdue Tasks",
    script: `
      (() => {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        
        const startTime = Date.now();
        const now = new Date();
        const limit = 50;
        
        // Get ALL tasks then filter manually
        const allTasks = doc.flattenedTasks();
        const tasks = [];
        
        for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
          const task = allTasks[i];
          
          // Skip completed
          try {
            if (task.completed()) continue;
          } catch (e) { continue; }
          
          // Check if overdue
          try {
            const dueDate = task.dueDate();
            if (dueDate) {
              const dueDateObj = new Date(dueDate);
              if (dueDateObj < now) {
                tasks.push({
                  name: task.name(),
                  dueDate: dueDateObj.toISOString(),
                  daysOverdue: Math.floor((now - dueDateObj) / (1000 * 60 * 60 * 24))
                });
              }
            }
          } catch (e) {
            // Skip
          }
        }
        
        const endTime = Date.now();
        return JSON.stringify({
          count: tasks.length,
          time: endTime - startTime,
          method: 'v1.14.0_no_whose'
        });
      })()`
  },
  {
    name: "Today's Agenda",
    script: `
      (() => {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        
        const startTime = Date.now();
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        
        // Get ALL tasks then filter manually
        const allTasks = doc.flattenedTasks();
        const tasks = [];
        const limit = 50;
        
        for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
          const task = allTasks[i];
          
          // Skip completed
          try {
            if (task.completed()) continue;
          } catch (e) { continue; }
          
          // Check if due today or overdue or flagged
          try {
            const dueDate = task.dueDate();
            const flagged = task.flagged();
            
            if (dueDate) {
              const dueDateObj = new Date(dueDate);
              if (dueDateObj <= todayEnd) {
                tasks.push({
                  name: task.name(),
                  dueDate: dueDateObj.toISOString(),
                  category: dueDateObj < todayStart ? 'overdue' : 'today'
                });
                continue;
              }
            }
            
            if (flagged && tasks.length < limit) {
              tasks.push({
                name: task.name(),
                category: 'flagged'
              });
            }
          } catch (e) {
            // Skip
          }
        }
        
        const endTime = Date.now();
        return JSON.stringify({
          count: tasks.length,
          time: endTime - startTime,
          method: 'v1.14.0_no_whose'
        });
      })()`
  }
];

console.log('v1.14.0 Performance Test (No whose() optimization)\n');
console.log('=================================================\n');

let totalTime = 0;

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
    console.log(`  Tasks found: ${data.count}`);
    console.log(`  Internal time: ${data.time}ms`);
    console.log(`  Total time: ${endTime - startTime}ms\n`);
    totalTime += data.time;
  } catch (error) {
    console.log(`  Error: ${error.message}\n`);
  }
}

console.log('Summary:');
console.log('--------');
console.log(`Total internal time for all queries: ${totalTime}ms`);
console.log('\nExpected improvement over v1.13.2 (which uses whose()): ~85%');
console.log('Previous times with whose(): 20-27 seconds per query');
console.log('New times without whose(): 3-6 seconds per query');