#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';

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
    console.log('Stdout:', stdout);
    try {
      const result = JSON.parse(stdout) as any;
      console.log('\nParsed result:', result);
    } catch (e) {
      console.error('Failed to parse output');
    }
  }
});

// Write script to stdin
proc.stdin!.write(script);
proc.stdin!.end();