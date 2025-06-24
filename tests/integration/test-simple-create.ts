#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing simple task creation...\n');

const script = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    // Simple task creation
    const taskProps = {
      name: "Test Task from Script"
    };
    
    // Create and add to inbox
    const newTask = app.Task(taskProps);
    const addedTask = doc.inbox.push(newTask);
    
    return JSON.stringify({
      success: true,
      taskId: addedTask.id.primaryKey,
      taskName: addedTask.name()
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString()
    });
  }
})()`;

const proc: ChildProcess = spawn('osascript', ['-l', 'JavaScript']);

let stdout: string = '';

proc.stdout.on('data', (data: Buffer) => {
  stdout += data.toString();
});

proc.on('close', (code: number | null) => {
  console.log('Exit code:', code);
  console.log('Result:', stdout);
});

// Write script to stdin
proc.stdin!.write(script);
proc.stdin!.end();