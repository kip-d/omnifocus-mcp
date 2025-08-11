#!/usr/bin/env node

import { spawn } from 'child_process';

// Test different counting methods
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const results = {};
    
    // Method 1: Direct length on flattenedTasks
    const start1 = Date.now();
    const allTasks = doc.flattenedTasks();
    const count1 = allTasks.length;
    results.method1_all_tasks = {
      count: count1,
      time_ms: Date.now() - start1
    };
    
    // Method 2: Using whose() then length
    const start2 = Date.now();
    const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
    const count2 = incompleteTasks.length;
    results.method2_incomplete_tasks = {
      count: count2,
      time_ms: Date.now() - start2
    };
    
    // Method 3: Multiple whose conditions
    const start3 = Date.now();
    const flaggedIncompleteTasks = doc.flattenedTasks.whose({
      completed: false,
      flagged: true
    })();
    const count3 = flaggedIncompleteTasks.length;
    results.method3_flagged_incomplete = {
      count: count3,
      time_ms: Date.now() - start3
    };
    
    // Method 4: Inbox tasks
    const start4 = Date.now();
    const inboxTasks = doc.inboxTasks();
    const count4 = inboxTasks.length;
    results.method4_inbox = {
      count: count4,
      time_ms: Date.now() - start4
    };
    
    // Method 5: Project's tasks
    const start5 = Date.now();
    const projects = doc.flattenedProjects();
    if (projects.length > 0) {
      const firstProject = projects[0];
      const projectTasks = firstProject.tasks();
      results.method5_first_project_tasks = {
        project_name: firstProject.name(),
        count: projectTasks.length,
        time_ms: Date.now() - start5
      };
    }
    
    return JSON.stringify(results, null, 2);
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString()
    });
  }
})();`;

console.log('Testing different counting methods...\n');

const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 30000
});

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  stdout += data.toString();
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
});

proc.on('close', (code) => {
  console.log('Exit code:', code);
  if (stderr) console.log('STDERR:', stderr);
  if (stdout) {
    console.log('Results:', stdout);
  } else {
    console.log('No output');
  }
});

proc.stdin.write(testScript);
proc.stdin.end();