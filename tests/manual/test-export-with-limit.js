#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';
import { spawn } from 'child_process';

async function testExportWithLimit() {
  const omni = new OmniAutomation();
  
  console.log('Testing export with small limit...\n');
  
  // Test with a small limit
  const params = {
    format: 'csv',
    filter: { limit: 5 },
    fields: null
  };
  
  console.log('Parameters:', JSON.stringify(params, null, 2));
  
  try {
    const script = omni.buildScript(EXPORT_TASKS_SCRIPT, params);
    
    const proc = spawn('osascript', ['-l', 'JavaScript'], {
      timeout: 10000 // 10 seconds should be plenty for 5 tasks
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
            console.log('\nCSV preview:');
            console.log(result.data.substring(0, 500));
          }
        } catch (e) {
          console.log('\nFailed to parse JSON:', e.message);
          console.log('Output length:', stdout.length);
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

testExportWithLimit();