#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('Testing OmniFocus access...\n');

const script = `(() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument;
    
    // Simple test - count tasks
    const taskCount = doc.flattenedTasks.length;
    
    return JSON.stringify({
      success: true,
      taskCount: taskCount,
      version: app.version()
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.toString()
    });
  }
})()`;

const proc = spawn('osascript', ['-l', 'JavaScript']);

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
  
  if (stderr) {
    console.error('Stderr:', stderr);
  }
  
  if (stdout) {
    console.log('Stdout:', stdout);
    try {
      const result = JSON.parse(stdout);
      console.log('\nParsed result:', result);
    } catch (e) {
      console.error('Failed to parse output');
    }
  }
});

// Write script to stdin
proc.stdin.write(script);
proc.stdin.end();