#!/usr/bin/env node
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation.js';
import { CREATE_TASK_SCRIPT } from '../../src/omnifocus/scripts/tasks.js';

console.log('Debugging MCP create task script generation...\n');

const omniAutomation = new OmniAutomation();

const taskData = {
  name: "Debug MCP Task " + Date.now(),
  note: "Testing MCP script generation",
  flagged: true,
  tags: ['test', 'debug']
};

console.log('1. Original CREATE_TASK_SCRIPT template:');
console.log('=====================================');
console.log(CREATE_TASK_SCRIPT);

console.log('\n2. Building script with parameters...');
console.log('=====================================');
const builtScript = omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData });
console.log(builtScript);

console.log('\n3. Executing the script...');
console.log('========================');
try {
  const result = await omniAutomation.execute(builtScript);
  console.log('Result:', result);
  
  if (result.success && result.taskId) {
    console.log('\n✅ SUCCESS: Task created with ID:', result.taskId);
  } else if (result.error) {
    console.log('\n❌ FAILED:', result.message);
  }
} catch (error) {
  console.error('\n❌ EXECUTION ERROR:', error);
}