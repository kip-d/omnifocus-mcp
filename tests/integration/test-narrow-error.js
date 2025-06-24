#!/usr/bin/env node
import { spawn } from 'child_process';

// Test to find the exact line causing the error
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    const filter = {"search": "test", "limit": 2};
    
    try {
      const allTasks = doc.flattenedTasks();
      
      if (allTasks.length > 0) {
        const task = allTasks[0];
        
        // Test each property access individually
        const tests = [];
        
        try {
          task.completed();
          tests.push("completed() works");
        } catch (e) {
          tests.push("completed() error: " + e.toString());
        }
        
        try {
          task.flagged();
          tests.push("flagged() works");
        } catch (e) {
          tests.push("flagged() error: " + e.toString());
        }
        
        try {
          task.inInbox();
          tests.push("inInbox() works");
        } catch (e) {
          tests.push("inInbox() error: " + e.toString());
        }
        
        try {
          task.id.primaryKey();
          tests.push("id.primaryKey() works");
        } catch (e) {
          tests.push("id.primaryKey() error: " + e.toString());
        }
        
        try {
          task.name();
          tests.push("name() works");
        } catch (e) {
          tests.push("name() error: " + e.toString());
        }
        
        // Test the actual filter comparisons
        try {
          if (filter.completed !== undefined && task.completed() !== filter.completed) {
            tests.push("completed filter comparison works");
          }
        } catch (e) {
          tests.push("completed filter error: " + e.toString());
        }
        
        return JSON.stringify({
          success: true,
          tests: tests
        });
      }
      
      return JSON.stringify({
        error: false,
        message: "No tasks found"
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Error: " + error.toString(),
        details: error.message
      });
    }
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString()
    });
  }
})()`;

console.log('Testing individual property access...');
const proc = spawn('osascript', ['-l', 'JavaScript']);

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
  
  if (stderr) {
    console.error('Stderr:', stderr);
  }
  
  if (stdout) {
    try {
      const result = JSON.parse(stdout);
      console.log('\nResult:');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('Failed to parse output:', e);
      console.log('Raw output:', stdout);
    }
  }
});

// Write script to stdin
proc.stdin.write(testScript);
proc.stdin.end();