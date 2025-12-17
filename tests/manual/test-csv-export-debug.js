#!/usr/bin/env node

import { spawn } from 'child_process';

// Create a minimal CSV export script to test
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Test 1: Can we access the document?
    if (!doc) {
      return JSON.stringify({
        error: true,
        test: "doc_access",
        message: "Cannot access OmniFocus document"
      });
    }
    
    // Test 2: Can we get tasks?
    const allTasks = doc.flattenedTasks();
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        test: "tasks_access",
        message: "Cannot access tasks"
      });
    }
    
    // Test 3: Can we build a simple CSV?
    const tasks = [];
    const limit = 2;
    
    for (let i = 0; i < Math.min(allTasks.length, limit); i++) {
      const task = allTasks[i];
      tasks.push({
        name: task.name(),
        completed: task.completed()
      });
    }
    
    // Test 4: Build CSV
    let csv = "name,completed\\n";
    for (const task of tasks) {
      csv += task.name + "," + task.completed + "\\n";
    }
    
    return JSON.stringify({
      format: "csv",
      data: csv,
      count: tasks.length,
      test: "success"
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      test: "exception",
      message: error.toString(),
      stack: error.stack ? error.stack.toString() : "no stack"
    });
  }
})();`;

console.log('Testing minimal CSV export...\n');

const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 10000,
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
  if (stderr) console.log('Stderr:', stderr);
  if (stdout) {
    console.log('Raw output:', stdout);
    try {
      const result = JSON.parse(stdout);
      console.log('\nParsed result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Failed to parse output');
    }
  } else {
    console.log('No output received');
  }
});

proc.stdin.write(testScript);
proc.stdin.end();
