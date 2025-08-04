#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';
import fs from 'fs';

console.log('Debugging export script generation...\n');

const omni = new OmniAutomation();

// Test with the exact parameters from user
const params = {
  format: 'csv',
  filter: {},
  fields: null
};

console.log('Parameters:', JSON.stringify(params, null, 2));

const script = omni.buildScript(EXPORT_TASKS_SCRIPT, params);

// Save to file for inspection
fs.writeFileSync('debug-export-script.js', script);
console.log('\nScript saved to debug-export-script.js');
console.log('Script length:', script.length);

// Look for the parameter injection part
const paramStart = script.indexOf('const filter = ');
const paramEnd = script.indexOf('try {', paramStart);
const paramSection = script.substring(paramStart, paramEnd);

console.log('\nParameter section:');
console.log(paramSection);

// Check if parameters were properly injected
console.log('\nParameter injection check:');
console.log('- filter injected:', script.includes('const filter = {}'));
console.log('- format injected:', script.includes('const format = "csv"'));
console.log('- fields injected:', script.includes('const fields = null'));