import { OmniAutomation } from './dist/omnifocus/OmniAutomation.js';

async function test() {
  const omni = new OmniAutomation();
  
  const script = `(() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const tasks = doc.flattenedTasks();
    
    return {
      taskCount: tasks.length,
      message: 'Quick test complete'
    };
  })()`;
  
  console.log('Running quick test script...');
  
  try {
    const result = await omni.execute(script);
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

test();