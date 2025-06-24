#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Debugging task creation and ID retrieval...\n');

// Test the exact CREATE_TASK_SCRIPT logic
const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    const taskData = {
      name: "Debug Task " + Date.now(),
      note: "Testing ID retrieval",
      flagged: true
    };
    
    console.log("1. Testing doc.inboxTasks vs doc.inboxTasks()...");
    
    // Test property vs method access
    try {
      const inboxProp = doc.inboxTasks;
      console.log("doc.inboxTasks (property): " + typeof inboxProp + ", length: " + inboxProp.length);
    } catch (e) {
      console.log("doc.inboxTasks (property) error: " + e.toString());
    }
    
    try {
      const inboxMethod = doc.inboxTasks();
      console.log("doc.inboxTasks() (method): " + typeof inboxMethod + ", length: " + inboxMethod.length);
    } catch (e) {
      console.log("doc.inboxTasks() (method) error: " + e.toString());
    }
    
    console.log("\\n2. Creating task with app.InboxTask...");
    
    const taskObj = {
      name: taskData.name,
      note: taskData.note,
      flagged: taskData.flagged
    };
    
    const newTask = app.InboxTask(taskObj);
    console.log("Created newTask: " + typeof newTask);
    
    // Try both ways to add to inbox
    console.log("\\n3. Adding to inbox...");
    
    try {
      const inbox = doc.inboxTasks;
      inbox.push(newTask);
      console.log("✓ Successfully pushed to doc.inboxTasks (property)");
    } catch (e) {
      console.log("✗ Error pushing to doc.inboxTasks (property): " + e.toString());
      
      try {
        const inbox2 = doc.inboxTasks();
        inbox2.push(newTask);
        console.log("✓ Successfully pushed to doc.inboxTasks() (method)");
      } catch (e2) {
        console.log("✗ Error pushing to doc.inboxTasks() (method): " + e2.toString());
      }
    }
    
    console.log("\\n4. Searching for created task...");
    
    // Wait a moment
    delay(0.5);
    
    // Try to find the task
    const allInboxTasks = doc.inboxTasks();
    console.log("Total inbox tasks: " + allInboxTasks.length);
    
    let taskFound = false;
    for (let i = allInboxTasks.length - 1; i >= 0; i--) {
      const task = allInboxTasks[i];
      if (task.name() === taskData.name) {
        console.log("✓ Found our task!");
        taskFound = true;
        
        try {
          const taskId = task.id.primaryKey;
          console.log("Task ID (property): " + taskId);
          
          // Clean up
          task.remove();
          console.log("✓ Task cleaned up");
          
          return JSON.stringify({
            success: true,
            taskId: taskId,
            message: "Task created and ID retrieved successfully"
          });
        } catch (e) {
          console.log("✗ Error getting task ID: " + e.toString());
          
          // Clean up anyway
          try {
            task.remove();
          } catch (cleanupError) {}
          
          return JSON.stringify({
            error: true,
            message: "Task created but could not get ID: " + e.toString()
          });
        }
      }
    }
    
    if (!taskFound) {
      return JSON.stringify({
        error: true,
        message: "Task was not found in inbox after creation"
      });
    }
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Script error: " + error.toString(),
      stack: error.stack
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
    } catch (e) {
      console.error('Failed to parse output');
      console.log('Raw output:', stdout);
    }
  }
});

// Write script to stdin
proc.stdin!.write(testScript);
proc.stdin!.end();