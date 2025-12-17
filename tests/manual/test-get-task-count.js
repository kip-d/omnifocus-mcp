#!/usr/bin/env node

import { spawn } from 'child_process';

// Test get_task_count with simple filter
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Test 1: Simple count with no filters
    let count1 = 0;
    const allTasks = doc.flattenedTasks();
    
    return JSON.stringify({
      test: "basic_count",
      total_tasks: allTasks.length,
      first_task_type: typeof allTasks[0],
      can_iterate: true
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString(),
      stack: error.stack
    });
  }
})();`;

console.log('Testing get_task_count basic functionality...\n');

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
  if (stderr) console.log('STDERR:', stderr);
  if (stdout) {
    try {
      const result = JSON.parse(stdout);
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Raw output:', stdout);
    }
  } else {
    console.log('No output');
  }
});

proc.stdin.write(testScript);
proc.stdin.end();
