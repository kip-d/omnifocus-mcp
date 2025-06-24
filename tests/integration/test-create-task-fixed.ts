#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing task creation with ID fix...\n');

const taskData = {
  name: "Final Test Task " + Date.now(),
  note: "Testing the fixed CREATE_TASK_SCRIPT",
  flagged: true
};

// Wrap the CREATE_TASK_SCRIPT logic in a function
const script = `(() => {
  const taskData = ${JSON.stringify(taskData)};
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    // Create task data object for JXA
    const taskObj = {
      name: taskData.name
    };
    
    // Add optional properties
    if (taskData.note !== undefined) taskObj.note = taskData.note;
    if (taskData.flagged !== undefined) taskObj.flagged = taskData.flagged;
    if (taskData.dueDate !== undefined && taskData.dueDate) taskObj.dueDate = new Date(taskData.dueDate);
    if (taskData.deferDate !== undefined && taskData.deferDate) taskObj.deferDate = new Date(taskData.deferDate);
    if (taskData.estimatedMinutes !== undefined) taskObj.estimatedMinutes = taskData.estimatedMinutes;
    
    // Create the task using JXA syntax
    const newTask = app.InboxTask(taskObj);
    const inbox = doc.inboxTasks;
    inbox.push(newTask);
    
    // Try to get the real OmniFocus ID by finding the task we just created
    let taskId = null;
    let createdTask = null;
    
    try {
      const allInboxTasks = doc.inboxTasks();
      for (let i = allInboxTasks.length - 1; i >= 0; i--) {
        const task = allInboxTasks[i];
        if (task.name() === taskData.name) {
          taskId = task.id();
          createdTask = task;
          break;
        }
      }
    } catch (e) {
      // If we can't get the real ID, generate a temporary one
      taskId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    }
    
    return JSON.stringify({
      success: true,
      taskId: taskId,
      task: {
        id: taskId,
        name: taskData.name,
        flagged: taskData.flagged || false,
        inInbox: true
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to create task: " + error.toString(),
      details: error.message
    });
  }
})()`;

const proc: ChildProcess = spawn('osascript', ['-l', 'JavaScript']);

let stdout: string = '';
let stderr: string = '';

proc.stdout!.on('data', (data: Buffer) => {
  stdout += data.toString();
});

proc.stderr!.on('data', (data: Buffer) => {
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
      
      if (result.success && result.taskId) {
        console.log('\n✅ SUCCESS: Task created with ID:', result.taskId);
        console.log('Task details:', result.task);
      } else if (result.error) {
        console.log('\n❌ FAILED:', result.message);
      }
    } catch (e) {
      console.error('Failed to parse output');
      console.log('Raw output:', stdout);
    }
  }
});

proc.stdin!.write(script);
proc.stdin!.end();