#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { GET_TASK_COUNT_SCRIPT } from '../dist/omnifocus/scripts/tasks/get-task-count.js';
import { spawn } from 'child_process';

async function testOptimizedCount() {
  const omni = new OmniAutomation();

  console.log('Testing optimized get_task_count...\n');

  const filter = { completed: false };
  const script = omni.buildScript(GET_TASK_COUNT_SCRIPT, { filter });

  const proc = spawn('osascript', ['-l', 'JavaScript'], {
    timeout: 65000, // 65 seconds
  });

  const startTime = Date.now();
  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  proc.on('close', (code) => {
    const totalTime = Date.now() - startTime;
    console.log('Exit code:', code);
    console.log('Total time:', totalTime + 'ms');

    if (stderr) console.log('STDERR:', stderr);

    if (stdout) {
      try {
        const result = JSON.parse(stdout);
        console.log('\nResult:', JSON.stringify(result, null, 2));
      } catch (e) {
        console.log('Failed to parse:', e.message);
        console.log('Output:', stdout);
      }
    } else {
      console.log('No output');
    }
  });

  proc.stdin.write(script);
  proc.stdin.end();
}

testOptimizedCount();
