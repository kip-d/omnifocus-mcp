#!/usr/bin/env node

// Test the exact generated script
const { OmniAutomation } = require('./dist/omnifocus/OmniAutomation.js');
const fs = require('fs');

// Read the actual script
const scriptContent = fs.readFileSync('./dist/omnifocus/scripts/perspectives/query-perspective.js', 'utf8');

// Extract the template part
const match = scriptContent.match(/export const QUERY_PERSPECTIVE_SCRIPT = `([\s\S]*?)`;/);
if (!match) {
  console.error('Could not find script template');
  process.exit(1);
}

const template = match[1];

// Create OmniAutomation instance to build script
const omni = new OmniAutomation();
const script = omni.buildScript(template, {
  perspectiveName: 'Flagged',
  limit: 5,
  includeDetails: false
});

// Write to file for inspection
fs.writeFileSync('generated-perspective-script.js', script);
console.log('Generated script written to generated-perspective-script.js');
console.log('\nFirst 500 characters:');
console.log(script.substring(0, 500));
console.log('\n...\n');
console.log('Last 500 characters:');
console.log(script.substring(script.length - 500));