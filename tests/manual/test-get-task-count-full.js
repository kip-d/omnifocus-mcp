#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { GET_TASK_COUNT_SCRIPT } from '../dist/omnifocus/scripts/tasks/get-task-count.js';
import { spawn } from 'child_process';

async function testGetTaskCount() {
  const omni = new OmniAutomation();
  
  console.log('Testing get_task_count with different filters...\n');
  
  // Test different filter scenarios
  const tests = [
    {
      name: 'No filters',
      filter: {}
    },
    {
      name: 'Completed false',
      filter: { completed: false }
    },
    {
      name: 'With date filter',
      filter: { 
        completed: false,
        dueBefore: '2025-12-31T23:59:59Z'
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\nTest: ${test.name}`);
    console.log('Filter:', JSON.stringify(test.filter));
    
    try {
      const script = omni.buildScript(GET_TASK_COUNT_SCRIPT, { filter: test.filter });
      
      const proc = spawn('osascript', ['-l', 'JavaScript'], {
        timeout: 15000
      });
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, 15000);
      
      await new Promise((resolve) => {
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('close', (code) => {
          clearTimeout(timeout);
          console.log('Exit code:', code);
          console.log('Timed out:', timedOut);
          
          if (stderr) {
            console.log('STDERR:', stderr);
          }
          
          if (stdout) {
            try {
              const result = JSON.parse(stdout);
              console.log('Result:', JSON.stringify(result, null, 2));
            } catch (e) {
              console.log('Failed to parse:', e.message);
              console.log('Output:', stdout.substring(0, 500));
            }
          } else {
            console.log('No output received');
          }
          
          resolve();
        });
        
        proc.stdin.write(script);
        proc.stdin.end();
      });
      
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

testGetTaskCount();