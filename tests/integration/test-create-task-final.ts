#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';
import { CREATE_TASK_SCRIPT } from '../../src/omnifocus/scripts/tasks';

console.log('Testing final CREATE_TASK_SCRIPT with ID fixes...\n');

// Use the actual CREATE_TASK_SCRIPT
const taskData = {
  name: "Final Test Task " + Date.now(),
  note: "Testing the fixed CREATE_TASK_SCRIPT",
  flagged: true
};

// Replace the template placeholder with actual data
const script = CREATE_TASK_SCRIPT.replace('{{taskData}}', JSON.stringify(taskData));

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