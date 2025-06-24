#!/usr/bin/env node
import { OmniAutomation } from './dist/omnifocus/OmniAutomation.js';
import { LIST_TASKS_SCRIPT } from './dist/omnifocus/scripts/tasks.js';

const omni = new OmniAutomation();

const script = omni.buildScript(LIST_TASKS_SCRIPT, {
  filter: { completed: false, limit: 5 }
});

console.log('Generated script:');
console.log(script);
console.log('\n\nExecuting...');

omni.execute(script)
  .then(result => {
    console.log('Success:', result);
  })
  .catch(error => {
    console.error('Error:', error);
  });