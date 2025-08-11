#!/usr/bin/env node

/**
 * Test script to compare performance of different approaches
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Helper to run osascript
function runScript(script) {
  const startTime = Date.now();
  try {
    const result = execSync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    const endTime = Date.now();
    return {
      success: true,
      result: JSON.parse(result),
      time: endTime - startTime
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      success: false,
      error: error.message,
      time: endTime - startTime
    };
  }
}

// Test 1: Pure JXA approach (current v1.13.2)
const pureJXAScript = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const limit = 50;
  
  const startTime = Date.now();
  const now = new Date();
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  // Get incomplete tasks
  const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
  
  const tasks = [];
  for (let i = 0; i < incompleteTasks.length && tasks.length < limit; i++) {
    const task = incompleteTasks[i];
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
  }
  
  const endTime = Date.now();
  return JSON.stringify({
    count: tasks.length,
    time: endTime - startTime,
    method: 'pure_jxa'
  });
})()
`;

// Test 2: Pure Omni Automation (filter all)
const pureOmniScript = `
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;
  
  const omniScript = \`
    (() => {
      const startTime = Date.now();
      const now = new Date();
      const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const limit = 50;
      
      // This is what we did wrong - filtering ALL tasks
      const tasks = flattenedTasks.filter(task => {
        return !task.completed && 
               task.dueDate && 
               task.dueDate >= now && 
               task.dueDate <= endDate;
      });
      
      const results = tasks.slice(0, limit).map(task => ({
        name: task.name,
        dueDate: task.dueDate.toISOString()
      }));
      
      const endTime = Date.now();
      return JSON.stringify({
        count: results.length,
        time: endTime - startTime,
        method: 'pure_omni_filter_all'
      });
    })()
  \`;
  
  return app.evaluateJavascript(omniScript);
})()
`;

// Test 3: Smart Hybrid (JXA filtering + Omni for tags)
const smartHybridScript = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const limit = 50;
  
  const startTime = Date.now();
  const now = new Date();
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  // Use JXA for filtering
  const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
  
  const tasks = [];
  const taskIds = [];
  for (let i = 0; i < incompleteTasks.length && tasks.length < limit; i++) {
    const task = incompleteTasks[i];
    const dueDate = task.dueDate();
    if (dueDate) {
      const dueDateObj = new Date(dueDate);
      if (dueDateObj >= now && dueDateObj <= endDate) {
        const id = task.id();
        tasks.push({
          id: id,
          name: task.name(),
          dueDate: dueDateObj.toISOString()
        });
        taskIds.push(id);
      }
    }
  }
  
  // Get tags via Omni (what JXA can't do well)
  if (taskIds.length > 0) {
    app.includeStandardAdditions = true;
    const omniScript = \`
      (() => {
        const ids = \${JSON.stringify(taskIds)};
        const tagData = {};
        for (const id of ids) {
          try {
            const task = Task.byIdentifier(id);
            if (task && task.tags) {
              tagData[id] = task.tags.map(t => t.name);
            }
          } catch (e) {
            tagData[id] = [];
          }
        }
        return JSON.stringify(tagData);
      })()
    \`;
    
    try {
      const tagDataJson = app.evaluateJavascript(omniScript);
      const tagData = JSON.parse(tagDataJson);
      for (const task of tasks) {
        task.tags = tagData[task.id] || [];
      }
    } catch (e) {
      // Continue without tags
    }
  }
  
  const endTime = Date.now();
  return JSON.stringify({
    count: tasks.length,
    time: endTime - startTime,
    method: 'smart_hybrid'
  });
})()
`;

console.log('Testing different approaches for upcoming tasks (7 days)...\n');

// Run tests
console.log('1. Pure JXA (current v1.13.2 approach):');
const jxaResult = runScript(pureJXAScript);
if (jxaResult.success) {
  console.log(`   Tasks found: ${jxaResult.result.count}`);
  console.log(`   Internal time: ${jxaResult.result.time}ms`);
  console.log(`   Total time: ${jxaResult.time}ms\n`);
} else {
  console.log(`   Error: ${jxaResult.error}\n`);
}

console.log('2. Pure Omni Automation (broken v1.13.0 approach):');
const omniResult = runScript(pureOmniScript);
if (omniResult.success) {
  console.log(`   Tasks found: ${omniResult.result.count}`);
  console.log(`   Internal time: ${omniResult.result.time}ms`);
  console.log(`   Total time: ${omniResult.time}ms\n`);
} else {
  console.log(`   Error: ${omniResult.error}\n`);
}

console.log('3. Smart Hybrid (JXA filter + Omni tags):');
const hybridResult = runScript(smartHybridScript);
if (hybridResult.success) {
  console.log(`   Tasks found: ${hybridResult.result.count}`);
  console.log(`   Internal time: ${hybridResult.result.time}ms`);
  console.log(`   Total time: ${hybridResult.time}ms\n`);
} else {
  console.log(`   Error: ${hybridResult.error}\n`);
}

// Summary
console.log('Summary:');
console.log('--------');
if (jxaResult.success && omniResult.success && hybridResult.success) {
  const baseline = jxaResult.time;
  console.log(`Pure JXA: ${jxaResult.time}ms (baseline)`);
  console.log(`Pure Omni: ${omniResult.time}ms (${((omniResult.time / baseline - 1) * 100).toFixed(0)}% ${omniResult.time > baseline ? 'slower' : 'faster'})`);
  console.log(`Smart Hybrid: ${hybridResult.time}ms (${((hybridResult.time / baseline - 1) * 100).toFixed(0)}% ${hybridResult.time > baseline ? 'slower' : 'faster'})`);
}