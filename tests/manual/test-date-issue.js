#!/usr/bin/env node

import { spawn } from 'child_process';

// Test if date handling is the issue
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const allTasks = doc.flattenedTasks();
    
    if (!allTasks || allTasks.length === 0) {
      return JSON.stringify({ error: "No tasks" });
    }
    
    // Test date handling on first few tasks
    const results = [];
    const limit = Math.min(5, allTasks.length);
    
    for (let i = 0; i < limit; i++) {
      const task = allTasks[i];
      const result = {
        index: i,
        name: "unknown"
      };
      
      try {
        result.name = task.name();
      } catch (e) {
        result.name = "name error: " + e.toString();
      }
      
      // Test dueDate
      try {
        const dueDate = task.dueDate();
        result.dueDateRaw = String(dueDate);
        result.dueDateType = typeof dueDate;
        
        if (dueDate) {
          try {
            result.dueDateISO = dueDate.toISOString();
          } catch (e) {
            result.dueDateISO = "toISOString error: " + e.toString();
          }
        }
      } catch (e) {
        result.dueDateError = e.toString();
      }
      
      results.push(result);
    }
    
    return JSON.stringify({ results: results });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString()
    });
  }
})();`;

console.log('Testing date handling issue...\n');

const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 5000,
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
      console.log('Results:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Raw output:', stdout);
    }
  } else {
    console.log('No output');
  }
});

proc.stdin.write(testScript);
proc.stdin.end();
