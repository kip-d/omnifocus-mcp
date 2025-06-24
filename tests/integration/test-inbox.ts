#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing inbox and task creation...\n');

const script = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    // Get inbox info
    const inbox = doc.inbox;
    const inboxTasks = inbox();
    
    // Try the documented way to create a task
    const newTaskName = "Test Task " + new Date().toISOString();
    
    // Method from OmniAutomation docs
    inbox.beginning.push(app.Task({name: newTaskName}));
    
    return JSON.stringify({
      success: true,
      inboxType: typeof inbox,
      inboxTaskCount: inboxTasks.length,
      created: newTaskName
    });
  } catch (error) {
    // Try alternative approach
    try {
      const app = Application('OmniFocus');
      
      // Use the make() method
      const task = app.make({
        new: 'task',
        withProperties: {
          name: 'Test Task Alternative'
        }
      });
      
      return JSON.stringify({
        success: true,
        method: 'make',
        taskName: task.name()
      });
    } catch (error2) {
      return JSON.stringify({
        error: true,
        message: error.toString(),
        alternative: error2.toString()
      });
    }
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