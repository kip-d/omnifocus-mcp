import { CREATE_TASK_SCRIPT } from './dist/omnifocus/scripts/tasks.js';
import { OmniAutomation } from './dist/omnifocus/OmniAutomation.js';

// Test the exact same data that was causing issues
const testTaskData = {
  name: "Test with tags",
  flagged: false,
  tags: ["test-tag", "automation"],
  sequential: false
};

const omni = new OmniAutomation();
console.log('Testing script generation...');

try {
  const script = omni.buildScript(CREATE_TASK_SCRIPT, { taskData: testTaskData });
  console.log(`Script generated successfully`);
  console.log(`Script length: ${script.length} characters`);
  console.log(`Max allowed: ${300000} characters`);
  
  // Look for any obvious issues at the end
  const endOfScript = script.slice(-500);
  console.log('Last 500 characters of script:');
  console.log(endOfScript);
  
  // Check if it cuts off mid-function
  if (!endOfScript.includes('})();')) {
    console.log('⚠️  Script appears to be truncated - missing final })();');
  }
  
} catch (error) {
  console.error('Error during script generation:', error);
}
