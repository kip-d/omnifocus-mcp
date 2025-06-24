#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing different ways to access task ID...\n');

const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    const taskData = {
      name: "ID Access Test " + Date.now(),
      note: "Testing different ID access methods"
    };
    
    // Create task
    const taskObj = { name: taskData.name, note: taskData.note };
    const newTask = app.InboxTask(taskObj);
    const inbox = doc.inboxTasks;
    inbox.push(newTask);
    
    delay(0.5);
    
    // Find the task
    const allInboxTasks = doc.inboxTasks();
    for (let i = allInboxTasks.length - 1; i >= 0; i--) {
      const task = allInboxTasks[i];
      if (task.name() === taskData.name) {
        console.log("Found task: " + task.name());
        
        // Test different ID access methods
        console.log("\\n--- Testing ID access methods ---");
        
        // Method 1: task.id
        try {
          console.log("1. task.id:");
          const id1 = task.id;
          console.log("   type: " + typeof id1);
          console.log("   value: " + id1);
        } catch (e) {
          console.log("   ✗ Error: " + e.toString());
        }
        
        // Method 2: task.id()
        try {
          console.log("2. task.id():");
          const id2 = task.id();
          console.log("   type: " + typeof id2);
          console.log("   value: " + id2);
          
          // If this works, try primaryKey
          if (id2) {
            try {
              console.log("   primaryKey (property): " + id2.primaryKey);
            } catch (e) {
              console.log("   primaryKey (property) error: " + e.toString());
            }
            
            try {
              console.log("   primaryKey() (method): " + id2.primaryKey());
            } catch (e) {
              console.log("   primaryKey() (method) error: " + e.toString());
            }
          }
        } catch (e) {
          console.log("   ✗ Error: " + e.toString());
        }
        
        // Method 3: properties()
        try {
          console.log("3. task.properties():");
          const props = task.properties();
          console.log("   type: " + typeof props);
          console.log("   keys: " + Object.keys(props).join(", "));
          if (props.id) {
            console.log("   props.id: " + props.id);
          }
        } catch (e) {
          console.log("   ✗ Error: " + e.toString());
        }
        
        // Method 4: Direct conversion to string
        try {
          console.log("4. String conversion:");
          console.log("   task.toString(): " + task.toString());
        } catch (e) {
          console.log("   ✗ Error: " + e.toString());
        }
        
        // Clean up
        try {
          task.remove();
          console.log("\\n✓ Task cleaned up");
        } catch (e) {
          console.log("\\n✗ Cleanup error: " + e.toString());
        }
        
        return JSON.stringify({
          success: true,
          message: "ID access testing completed"
        });
      }
    }
    
    return JSON.stringify({
      error: true,
      message: "Could not find created task"
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Script error: " + error.toString()
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

proc.stdin!.write(testScript);
proc.stdin!.end();