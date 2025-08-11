#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';

async function testExportScript() {
  const omni = new OmniAutomation();
  
  console.log('Testing export script directly...\n');
  
  try {
    // Build the script with parameters
    const script = omni.buildScript(EXPORT_TASKS_SCRIPT, {
      format: 'json',
      filter: { completed: false, limit: 2 },
      fields: null
    });
    
    console.log('Script length:', script.length);
    
    // Find where the parameters are injected
    const filterIndex = script.indexOf('const filter = ');
    if (filterIndex > -1) {
      console.log('Filter section:', script.substring(filterIndex, filterIndex + 200));
    }
    
    // Execute the script
    console.log('\nExecuting script...');
    const result = await omni.execute(script);
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    if (error.script) {
      console.error('Script snippet:', error.script.substring(0, 500));
    }
  }
}

testExportScript();