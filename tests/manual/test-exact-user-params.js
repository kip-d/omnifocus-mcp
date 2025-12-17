#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';
import { spawn } from 'child_process';

async function testExactUserParams() {
  const omni = new OmniAutomation();

  console.log('Testing with exact user parameters...\n');

  // Exact parameters from user report
  const params = {
    fields: ['id', 'name', 'project', 'dueDate', 'flagged', 'completed'],
    filter: { completed: false },
    format: 'csv',
  };

  console.log('Parameters:', JSON.stringify(params, null, 2));

  try {
    const script = omni.buildScript(EXPORT_TASKS_SCRIPT, params);

    // Check the generated script
    console.log('\nScript length:', script.length);

    // Look for the parameter section
    const paramMatch = script.match(/const fields = (\[.*?\]);/);
    if (paramMatch) {
      console.log('Fields parameter:', paramMatch[1]);
    }

    const filterMatch = script.match(/const filter = ({.*?});/);
    if (filterMatch) {
      console.log('Filter parameter:', filterMatch[1]);
    }

    // Save script for debugging
    const fs = await import('fs');
    fs.writeFileSync('test-exact-params-script.js', script);
    console.log('\nScript saved to test-exact-params-script.js');

    // Try to execute
    const proc = spawn('osascript', ['-l', 'JavaScript'], {
      timeout: 15000,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, 15000);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      console.log('\nExecution completed');
      console.log('Exit code:', code);
      console.log('Timed out:', timedOut);

      if (stderr) {
        console.log('\nSTDERR:', stderr);
      }

      if (stdout) {
        console.log('\nSTDOUT length:', stdout.length);
        if (stdout.length < 1000) {
          console.log('STDOUT:', stdout);
        } else {
          console.log('STDOUT (first 1000 chars):', stdout.substring(0, 1000));
        }
      } else {
        console.log('\nNo output received');
      }
    });

    proc.stdin.write(script);
    proc.stdin.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testExactUserParams();
