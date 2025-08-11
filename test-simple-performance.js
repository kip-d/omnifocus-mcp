#!/usr/bin/env node

/**
 * Simple performance test
 */

import { execSync } from 'child_process';

// Test getting task count different ways
const tests = [
  {
    name: "JXA whose() count",
    script: `
      (() => {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        const start = Date.now();
        const count = doc.flattenedTasks.whose({completed: false})().length;
        const end = Date.now();
        return JSON.stringify({ count, time: end - start });
      })()`
  },
  {
    name: "JXA all tasks count",
    script: `
      (() => {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        const start = Date.now();
        const count = doc.flattenedTasks().length;
        const end = Date.now();
        return JSON.stringify({ count, time: end - start });
      })()`
  },
  {
    name: "Omni Automation filter count",
    script: `
      (() => {
        const app = Application('OmniFocus');
        app.includeStandardAdditions = true;
        const result = app.evaluateJavascript(\`
          (() => {
            const start = Date.now();
            const count = flattenedTasks.filter(t => !t.completed).length;
            const end = Date.now();
            return JSON.stringify({ count, time: end - start });
          })()
        \`);
        return result;
      })()`
  },
  {
    name: "Omni Automation all count",
    script: `
      (() => {
        const app = Application('OmniFocus');
        app.includeStandardAdditions = true;
        const result = app.evaluateJavascript(\`
          (() => {
            const start = Date.now();
            const count = flattenedTasks.length;
            const end = Date.now();
            return JSON.stringify({ count, time: end - start });
          })()
        \`);
        return result;
      })()`
  }
];

console.log('Performance Test: Counting Tasks\n');
console.log('=================================\n');

for (const test of tests) {
  console.log(`${test.name}:`);
  const startTime = Date.now();
  try {
    const result = execSync(`osascript -l JavaScript -e '${test.script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    const endTime = Date.now();
    const data = JSON.parse(result);
    console.log(`  Tasks: ${data.count}`);
    console.log(`  Internal time: ${data.time}ms`);
    console.log(`  Total time: ${endTime - startTime}ms\n`);
  } catch (error) {
    console.log(`  Error: ${error.message}\n`);
  }
}