#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';
import { spawn } from 'child_process';

async function testExportWithSpecificLimit() {
  const omni = new OmniAutomation();

  console.log('Testing export with user parameters plus reasonable limit...\n');

  // User parameters with added limit
  const params = {
    fields: ['id', 'name', 'project', 'dueDate', 'flagged', 'completed'],
    filter: {
      completed: false,
      limit: 100, // Add reasonable limit to prevent timeout
    },
    format: 'csv',
  };

  console.log('Parameters:', JSON.stringify(params, null, 2));

  try {
    const script = omni.buildScript(EXPORT_TASKS_SCRIPT, params);

    const proc = spawn('osascript', ['-l', 'JavaScript'], {
      timeout: 20000, // 20 seconds
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
      console.log('\nExecution completed');
      console.log('Exit code:', code);

      if (stderr) {
        console.log('\nSTDERR:', stderr);
      }

      if (stdout) {
        try {
          const result = JSON.parse(stdout);
          console.log('\nResult:');
          console.log('- format:', result.format);
          console.log('- count:', result.count);
          console.log('- limited:', result.limited);
          console.log('- message:', result.message);
          console.log('- error:', result.error);

          if (result.data && result.format === 'csv') {
            console.log('\nCSV headers:');
            const lines = result.data.split('\n');
            console.log(lines[0]);
            console.log('\nFirst few records:');
            for (let i = 1; i < Math.min(4, lines.length); i++) {
              console.log(lines[i]);
            }
          }
        } catch (e) {
          console.log('\nFailed to parse JSON:', e.message);
          console.log('Output length:', stdout.length);
          console.log('First 500 chars:', stdout.substring(0, 500));
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

testExportWithSpecificLimit();
