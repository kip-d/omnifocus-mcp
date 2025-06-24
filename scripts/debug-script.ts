#!/usr/bin/env node
import { OmniAutomation } from 'src/omnifocus/OmniAutomation';
import { LIST_TASKS_SCRIPT } from 'src/omnifocus/scripts/tasks';

const omni = new OmniAutomation();

const script = omni.buildScript(LIST_TASKS_SCRIPT, {
  filter: { completed: false, limit: 5 }
});

console.log('Generated script:');
console.log(script);
console.log('\n\nExecuting...');

omni.execute(script)
  .then((result: any) => {
    console.log('Success:', result);
  })
  .catch((error: Error) => {
    console.error('Error:', error);
  });