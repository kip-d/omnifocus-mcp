#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

console.log('Testing list tasks script...\n');

const filter = { completed: false, limit: 5 };

const script = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    const filter = ${JSON.stringify(filter)};
    const tasks = [];
    const flattenedTasks = doc.flattenedTasks;
    
    let count = 0;
    for (const task of flattenedTasks) {
      if (count >= (filter.limit || 100)) break;
      
      // Apply filters
      if (filter.completed !== undefined && task.completed !== filter.completed) continue;
      
      tasks.push({
        id: task.id.primaryKey,
        name: task.name,
        completed: task.completed,
        flagged: task.flagged
      });
      
      count++;
    }
    
    return JSON.stringify(tasks);
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
      console.log('\nTasks found:', Array.isArray(result) ? result.length : 'Error');
      if (Array.isArray(result)) {
        result.slice(0, 3).forEach(task => {
          console.log(`- ${task.name} (${task.completed ? 'completed' : 'incomplete'})`);
        });
      } else {
        console.log('Result:', result);
      }
    } catch (e) {
      console.error('Failed to parse output:', e);
      console.log('Raw output:', stdout);
    }
  }
});

// Write script to stdin
proc.stdin!.write(script);
proc.stdin!.end();