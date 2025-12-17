#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';

console.log('Testing script parameter injection...\n');

const omni = new OmniAutomation();

// Test 1: Basic parameter injection
const template1 = `(() => {
  const projectId = {{projectId}};
  const completeAllTasks = {{completeAllTasks}};
  return JSON.stringify({ projectId: projectId, completeAllTasks: completeAllTasks });
})();`;

const params1 = {
  projectId: 'test123',
  completeAllTasks: false,
};

const script1 = omni.buildScript(template1, params1);
console.log('Test 1 - Basic injection:');
console.log('Generated script:', script1);
console.log('');

// Test 2: With backticks in parameter (edge case from user report)
const params2 = {
  projectId: `paPQgPIw_ii`, // Using backticks like in user report
  completeAllTasks: `false`,
};

const script2 = omni.buildScript(template1, params2);
console.log('Test 2 - With backticks:');
console.log('Generated script:', script2);
console.log('');

// Test 3: Missing parameter declarations (simulating the bug)
const buggyTemplate = `(() => {
  // Missing parameter declarations!
  if (projectId === 'test') {
    return 'found';
  }
})();`;

const script3 = omni.buildScript(buggyTemplate, params1);
console.log('Test 3 - Buggy template (missing declarations):');
console.log('Generated script:', script3);
console.log('Note: This script will fail with "Can\'t find variable: projectId"\n');

// Test 4: Complex object parameters
const params4 = {
  filter: {
    completed: false,
    tags: ['work', 'urgent'],
  },
  options: {
    limit: 50,
    includeDetails: false,
  },
};

const template4 = `(() => {
  const filter = {{filter}};
  const options = {{options}};
  return JSON.stringify({ filter: filter, options: options });
})();`;

const script4 = omni.buildScript(template4, params4);
console.log('Test 4 - Complex objects:');
console.log('Generated script:', script4);
