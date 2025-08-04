#!/usr/bin/env node

import { DiagnosticOmniAutomation } from '../dist/omnifocus/DiagnosticOmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';

async function testExportWithDiagnostics() {
  const omni = new DiagnosticOmniAutomation();
  
  console.log('Testing export with diagnostics...\n');
  
  try {
    const script = omni.buildScript(EXPORT_TASKS_SCRIPT, {
      format: 'json',
      filter: { completed: false, limit: 2 },
      fields: null
    });
    
    const result = await omni.execute(script);
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('\nDiagnostic log:');
    omni.getDiagnosticLog().forEach(log => console.log(log));
  }
}

testExportWithDiagnostics();