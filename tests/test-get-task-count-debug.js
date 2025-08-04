#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { GET_TASK_COUNT_SCRIPT } from '../dist/omnifocus/scripts/tasks/get-task-count.js';
import fs from 'fs';

async function debugGetTaskCount() {
  const omni = new OmniAutomation();
  
  console.log('Generating get_task_count script...\n');
  
  const filter = { completed: false };
  const script = omni.buildScript(GET_TASK_COUNT_SCRIPT, { filter });
  
  // Save the script for inspection
  fs.writeFileSync('test-get-task-count-generated.js', script);
  console.log('Script saved to test-get-task-count-generated.js');
  console.log('Script length:', script.length);
  
  // Look for the filter line
  const lines = script.split('\n');
  const filterLine = lines.find(line => line.includes('const filter ='));
  if (filterLine) {
    console.log('\nFilter line:', filterLine.trim());
  }
  
  // Check if helpers are included
  console.log('\nHelpers included:', script.includes('function safeGet'));
  console.log('isValidDate included:', script.includes('function isValidDate'));
  console.log('formatError included:', script.includes('function formatError'));
}

debugGetTaskCount();