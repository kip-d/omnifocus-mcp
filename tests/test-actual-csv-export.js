#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';
import { spawn } from 'child_process';

async function testActualExport() {
  const omni = new OmniAutomation();
  
  console.log('Testing actual export script...\n');
  
  try {
    // Build the script
    const script = omni.buildScript(EXPORT_TASKS_SCRIPT, {
      format: 'csv',
      filter: { completed: false, limit: 2 },
      fields: null
    });
    
    console.log('Script built, length:', script.length);
    
    // Test the script directly
    const proc = spawn('osascript', ['-l', 'JavaScript'], {
      timeout: 30000 // 30 seconds
    });
    
    let stdout = '';
    let stderr = '';
    let errorOccurred = false;
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (error) => {
      errorOccurred = true;
      console.error('Process error:', error);
    });
    
    const timeout = setTimeout(() => {
      console.log('Script timed out after 30 seconds');
      proc.kill();
    }, 30000);
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      console.log('Exit code:', code);
      console.log('Error occurred:', errorOccurred);
      if (stderr) console.log('Stderr:', stderr);
      if (stdout) {
        console.log('Stdout length:', stdout.length);
        console.log('First 500 chars:', stdout.substring(0, 500));
        try {
          const result = JSON.parse(stdout);
          console.log('\nParsed result:', JSON.stringify(result, null, 2));
        } catch (e) {
          console.log('Failed to parse output:', e.message);
          console.log('Raw output:', stdout);
        }
      } else {
        console.log('No output received');
      }
    });
    
    // Write the script
    proc.stdin.write(script);
    proc.stdin.end();
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testActualExport();