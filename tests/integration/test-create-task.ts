#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

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

const proc: ChildProcess = spawn('osascript', ['-l', 'JavaScript']);

let stdout: string = '';
let stderr: string = '';

proc.stdout.on('data', (data: Buffer) => {
  stdout += data.toString();
});

proc.stderr.on('data', (data: Buffer) => {
  stderr += data.toString();
});

proc.on('close', (code: number | null) => {
  console.log('Exit code:', code);
  
  if (stderr) {
    console.error('Stderr:', stderr);
  }
  
  if (stdout) {
    try {
      const result = JSON.parse(stdout) as any;
      console.log('\nResult:', result);
    } catch (e) {
      console.error('Failed to parse output');
      console.log('Raw output:', stdout);
    }
  }
});

// Write script to stdin
proc.stdin!.write(script);
proc.stdin!.end();