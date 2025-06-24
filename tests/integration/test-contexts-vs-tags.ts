#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing contexts vs tags in OmniFocus...\n');

const script = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    console.log("Testing different collection access methods...");
    
    // Test 1: flattenedContexts
    try {
      console.log("1. Testing doc.flattenedContexts():");
      const contexts = doc.flattenedContexts();
      console.log("   Success - found " + contexts.length + " contexts");
    } catch (e) {
      console.log("   Error: " + e.toString());
    }
    
    // Test 2: flattenedTags
    try {
      console.log("2. Testing doc.flattenedTags():");
      const tags = doc.flattenedTags();
      console.log("   Success - found " + tags.length + " tags");
    } catch (e) {
      console.log("   Error: " + e.toString());
    }
    
    // Test 3: Create simple task without tags/contexts
    try {
      console.log("3. Testing simple task creation:");
      const taskObj = {
        name: "Simple Test Task " + Date.now()
      };
      
      const newTask = app.InboxTask(taskObj);
      const inbox = doc.inboxTasks;
      inbox.push(newTask);
      console.log("   Success - task created");
      
      // Try to find and get ID
      delay(0.5);
      const allInboxTasks = doc.inboxTasks();
      for (let i = allInboxTasks.length - 1; i >= 0; i--) {
        const task = allInboxTasks[i];
        if (task.name() === taskObj.name) {
          const taskId = task.id();
          console.log("   Success - got ID: " + taskId);
          
          // Clean up
          task.remove();
          console.log("   Cleaned up task");
          break;
        }
      }
    } catch (e) {
      console.log("   Error: " + e.toString());
    }
    
    return JSON.stringify({
      success: true,
      message: "Context vs tags testing completed"
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

proc.stdin!.write(script);
proc.stdin!.end();