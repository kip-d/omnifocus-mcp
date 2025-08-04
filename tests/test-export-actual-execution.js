#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';
import { spawn } from 'child_process';

async function testExportExecution() {
  const omni = new OmniAutomation();
  
  console.log('Testing actual export execution...\n');
  
  // Test with minimal CSV export
  const params = {
    format: 'csv',
    filter: {},
    fields: null
  };
  
  console.log('Parameters:', JSON.stringify(params, null, 2));
  
  try {
    const script = omni.buildScript(EXPORT_TASKS_SCRIPT, params);
    
    // Execute the script
    const proc = spawn('osascript', ['-l', 'JavaScript'], {
      timeout: 30000
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
        console.log('\nSTDOUT length:', stdout.length);
        console.log('First 1000 chars:', stdout.substring(0, 1000));
        
        try {
          const result = JSON.parse(stdout);
          console.log('\nParsed result:');
          console.log('- format:', result.format);
          console.log('- count:', result.count);
          console.log('- error:', result.error);
          if (result.error) {
            console.log('- message:', result.message);
            console.log('- context:', result.context);
            console.log('- stack:', result.stack);
          }
          if (result.data && result.format === 'csv') {
            console.log('- CSV preview:', result.data.substring(0, 200) + '...');
          }
        } catch (e) {
          console.log('\nFailed to parse JSON:', e.message);
          console.log('Raw output:', stdout);
        }
      } else {
        console.log('\nNo output received');
      }
    });
    
    // Write the script
    proc.stdin.write(script);
    proc.stdin.end();
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testExportExecution();