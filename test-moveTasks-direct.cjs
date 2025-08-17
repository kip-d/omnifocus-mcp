#!/usr/bin/env node

// Direct test of moveTasks function via osascript
const { execSync } = require('child_process');

const script = `
const app = Application('OmniFocus');
const doc = app.defaultDocument();

// Get the first two tasks from inbox to test with
const allTasks = doc.flattenedTasks();
if (allTasks.length < 2) {
  "Need at least 2 tasks to test";
} else {
  const task1 = allTasks[0];
  const task2 = allTasks[1];
  
  const task1Id = task1.id();
  const task2Id = task2.id();
  
  // Try to use evaluateJavascript to call moveTasks
  const moveScript = \`
    (() => {
      const child = Task.byIdentifier('\${task1Id}');
      const parent = Task.byIdentifier('\${task2Id}');
      
      if (!child || !parent) {
        return 'Tasks not found';
      }
      
      try {
        // Try the global moveTasks function
        moveTasks([child], parent);
        return 'Success: moved task';
      } catch (e) {
        return 'Error: ' + e.message;
      }
    })()
  \`;
  
  const result = app.evaluateJavascript(moveScript);
  result;
}
`;

try {
  console.log('Testing moveTasks via evaluateJavascript bridge...\n');
  const result = execSync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' });
  console.log('Result:', result.trim());
} catch (error) {
  console.error('Error:', error.message);
  if (error.stdout) {
    console.log('Output:', error.stdout.toString());
  }
  if (error.stderr) {
    console.log('Stderr:', error.stderr.toString());
  }
}