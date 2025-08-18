#!/usr/bin/env node

const { execSync } = require('child_process');

const script = `
const app = Application('OmniFocus');
const doc = app.defaultDocument();

// Simple test without evaluateJavascript first
const tasks = doc.flattenedTasks();
let flaggedCount = 0;

for (let i = 0; i < Math.min(100, tasks.length); i++) {
  try {
    if (tasks[i].flagged() && !tasks[i].completed()) {
      flaggedCount++;
    }
  } catch (e) {
    // Skip
  }
}

"Found " + flaggedCount + " flagged tasks via JXA";
`;

try {
  console.log('Testing direct flagged task count...\n');
  const result = execSync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' });
  console.log('Result:', result.trim());
} catch (error) {
  console.error('Error:', error.message);
}