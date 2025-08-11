#!/usr/bin/env node

import { spawn } from 'child_process';

// Create a minimal test script to identify the issue
const testScript = `(() => {
  const filter = {};
  const format = "csv";
  const fields = null;
  
  try {
    // Test 1: Can we even run?
    const result = { test: 1, status: "started" };
    
    // Test 2: Can we access OmniFocus?
    try {
      const app = Application('OmniFocus');
      result.omnifocusAccess = "success";
    } catch (e) {
      result.omnifocusAccess = "failed: " + e.toString();
      return JSON.stringify(result);
    }
    
    // Test 3: Can we get the document?
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      result.documentAccess = doc ? "success" : "null document";
    } catch (e) {
      result.documentAccess = "failed: " + e.toString();
      return JSON.stringify(result);
    }
    
    // Test 4: Can we get tasks?
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const allTasks = doc.flattenedTasks();
      result.tasksAccess = allTasks ? "success" : "null tasks";
      result.taskCount = allTasks ? allTasks.length : 0;
    } catch (e) {
      result.tasksAccess = "failed: " + e.toString();
      return JSON.stringify(result);
    }
    
    // Test 5: Try the actual export with just one task
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const allTasks = doc.flattenedTasks();
      
      if (!allTasks || allTasks.length === 0) {
        result.export = "no tasks";
        return JSON.stringify(result);
      }
      
      // Try to process just one task
      const task = allTasks[0];
      const taskData = {
        name: "test"
      };
      
      // This is where it might fail
      try {
        taskData.name = task.name();
      } catch (e) {
        taskData.name = "name() failed: " + e.toString();
      }
      
      result.export = "success";
      result.firstTask = taskData;
    } catch (e) {
      result.export = "failed: " + e.toString();
    }
    
    return JSON.stringify(result);
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString(),
      stage: "outer catch"
    });
  }
})();`;

console.log('Testing minimal export script...\n');

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
    console.log('Result:', stdout);
  } else {
    console.log('No output');
  }
});

proc.stdin.write(testScript);
proc.stdin.end();