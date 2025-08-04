#!/usr/bin/env node

import { spawn } from 'child_process';

// Minimal test to find the issue
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Step 1: Try to get flattenedTasks
    const allTasks = doc.flattenedTasks();
    const step1 = { 
      success: true, 
      allTasksLength: allTasks.length,
      allTasksType: typeof allTasks
    };
    
    // Step 2: Try whose query
    let step2 = { success: false };
    try {
      const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
      step2 = {
        success: true,
        incompleteLength: incompleteTasks.length,
        incompleteType: typeof incompleteTasks
      };
    } catch (e) {
      step2.error = e.toString();
    }
    
    // Step 3: Try iteration
    let step3 = { success: false };
    try {
      let count = 0;
      for (let i = 0; i < Math.min(10, allTasks.length); i++) {
        count++;
      }
      step3 = { success: true, counted: count };
    } catch (e) {
      step3.error = e.toString();
    }
    
    // Step 4: Try accessing task properties
    let step4 = { success: false };
    try {
      if (allTasks.length > 0) {
        const task = allTasks[0];
        const completed = task.completed();
        step4 = { 
          success: true, 
          firstTaskCompleted: completed,
          completedType: typeof completed
        };
      }
    } catch (e) {
      step4.error = e.toString();
    }
    
    return JSON.stringify({
      step1: step1,
      step2: step2,
      step3: step3,
      step4: step4
    }, null, 2);
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString(),
      stack: error.stack
    });
  }
})();`;

console.log('Running minimal get_task_count test...\n');

const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 10000
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
    console.log('Output:', stdout);
  } else {
    console.log('No output');
  }
});

proc.stdin.write(testScript);
proc.stdin.end();