#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('Testing task creation...\n');

const script = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    // Test different ways to create a task
    console.log('Testing task creation methods...');
    
    // Method 1: Direct push
    const task1 = doc.inbox.push(app.Task({name: "Test Task 1"}));
    
    // Method 2: new Task
    const task2 = new doc.Task({name: "Test Task 2"});
    doc.inbox.push(task2);
    
    // Method 3: make method
    const task3 = app.Task.make({name: "Test Task 3"});
    doc.inbox.push(task3);
    
    return JSON.stringify({
      success: true,
      methods: ["direct push", "new Task", "make method"],
      message: "Created test tasks"
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString(),
      stack: error.stack
    });
  }
})()`;

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
      console.log('\nResult:', result);
    } catch (e) {
      console.error('Failed to parse output');
      console.log('Raw output:', stdout);
    }
  }
});

// Write script to stdin
proc.stdin.write(script);
proc.stdin.end();