#!/usr/bin/env node

import { spawn } from 'child_process';

// Super simple test
const testScript = `(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const tasks = doc.flattenedTasks();
  return tasks.length.toString();
})();`;

console.log('Running super simple count test...\n');

const proc = spawn('osascript', ['-l', 'JavaScript'], {
  timeout: 5000,
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
  if (stderr) console.log('STDERR:', stderr);
  if (stdout) {
    console.log('Task count:', stdout.trim());
  } else {
    console.log('No output');
  }
});

proc.stdin.write(testScript);
proc.stdin.end();
