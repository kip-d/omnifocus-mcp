#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { EXPORT_TASKS_SCRIPT } from '../dist/omnifocus/scripts/export.js';

console.log('Testing export tasks script generation...\n');

const omni = new OmniAutomation();

// Test 1: Minimal CSV export
const params1 = {
  format: 'csv',
  filter: {},
  fields: null,
};

console.log('Test 1 - Minimal CSV export:');
console.log('Parameters:', JSON.stringify(params1, null, 2));

const script1 = omni.buildScript(EXPORT_TASKS_SCRIPT, params1);
console.log('\nGenerated script length:', script1.length);
console.log('First 500 chars:', script1.substring(0, 500));

// Check for parameter declarations
const hasFilterDecl = script1.includes('const filter = ');
const hasFormatDecl = script1.includes('const format = ');
const hasFieldsDecl = script1.includes('const fields = ');

console.log('\nParameter declarations:');
console.log('- filter:', hasFilterDecl);
console.log('- format:', hasFormatDecl);
console.log('- fields:', hasFieldsDecl);

// Test 2: With specific fields and filter
const params2 = {
  format: 'csv',
  filter: { completed: false },
  fields: ['id', 'name', 'project', 'dueDate', 'flagged', 'completed'],
};

console.log('\n\nTest 2 - With fields and filter:');
console.log('Parameters:', JSON.stringify(params2, null, 2));

const script2 = omni.buildScript(EXPORT_TASKS_SCRIPT, params2);

// Extract the parameter declarations
const paramSection = script2.substring(script2.indexOf('const filter'), script2.indexOf('try {'));
console.log('\nParameter declarations section:');
console.log(paramSection);

// Check if the script has proper structure
console.log('\nScript structure checks:');
console.log('- Has IIFE wrapper:', script2.includes('(() => {'));
console.log('- Has try block:', script2.includes('try {'));
console.log('- Has error handling:', script2.includes('formatError'));

// Look for potential issues
console.log('\nPotential issues:');
const beforeTry = script2.substring(0, script2.indexOf('try {'));
const undeclaredVars = beforeTry.match(/\b(filter|format|fields)\b(?!.*const.*=)/g);
if (undeclaredVars) {
  console.log('- Found undeclared variables:', undeclaredVars);
} else {
  console.log('- No undeclared variables found');
}
