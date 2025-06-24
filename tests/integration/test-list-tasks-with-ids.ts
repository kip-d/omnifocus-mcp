#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing LIST_TASKS_SCRIPT to verify IDs are returned...\n');

// Test the list tasks functionality
const script = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    const filter = {
      limit: 5,
      completed: false
    };
    
    const tasks = [];
    const allTasks = doc.flattenedTasks();
    const limit = Math.min(filter.limit || 100, 1000);
    let count = 0;
    
    for (let i = 0; i < allTasks.length && count < limit; i++) {
      const task = allTasks[i];
      
      // Skip if task doesn't match filters
      if (filter.completed !== undefined && task.completed() !== filter.completed) continue;
      
      // Build task object with safe property access
      const taskObj = {
        id: task.id(),
        name: task.name(),
        completed: task.completed(),
        flagged: task.flagged(),
        inInbox: task.inInbox()
      };
      
      // Add optional properties safely
      try {
        const note = task.note();
        if (note) taskObj.note = note;
      } catch (e) {}
      
      try {
        const project = task.containingProject();
        if (project) {
          taskObj.project = project.name();
          taskObj.projectId = project.id();
        }
      } catch (e) {}
      
      tasks.push(taskObj);
      count++;
    }
    
    return JSON.stringify({
      tasks: tasks,
      count: tasks.length,
      message: "Retrieved " + tasks.length + " tasks"
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to list tasks: " + error.toString()
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
      
      if (result.tasks && result.tasks.length > 0) {
        console.log('\n✅ SUCCESS: Retrieved tasks with IDs');
        console.log('Sample task IDs:');
        result.tasks.slice(0, 3).forEach((task: any, index: number) => {
          console.log(`  ${index + 1}. ${task.name} - ID: ${task.id}`);
        });
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