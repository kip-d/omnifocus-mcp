#!/usr/bin/env node

import { spawn } from 'child_process';

const testScript = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const tasks = [];
    const allTasks = doc.flattenedTasks();
    
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks"
      });
    }
    
    // Just get first task
    if (allTasks.length > 0) {
      const task = allTasks[0];
      tasks.push({
        name: task.name(),
        completed: task.completed()
      });
    }
    
    return JSON.stringify({
      format: 'json',
      data: tasks,
      count: tasks.length
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString()
    });
  }
})();`;

console.log('Running minimal export test...\n');

const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 10000
});

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
  if (stderr) console.log('Stderr:', stderr);
  console.log('Stdout:', stdout);
  
  if (stdout) {
    try {
      const result = JSON.parse(stdout);
      console.log('\nParsed result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Failed to parse output');
    }
  }
});

proc.stdin.write(testScript);
proc.stdin.end();