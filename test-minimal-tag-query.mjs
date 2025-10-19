#!/usr/bin/env node
/**
 * Minimal test to identify REAL bottleneck in tag queries
 * Compare: OmniJS approach vs JXA approach
 */

import { spawnSync } from 'child_process';

const tests = {
  // APPROACH A: OmniJS bridge (like query-perspective.ts)
  omniJSBridge: `
(() => {
  const app = Application('OmniFocus');

  const script = \`
    (() => {
      const results = [];
      let count = 0;

      const startTime = Date.now();

      inbox.forEach(task => {
        results.push({
          id: task.id.primaryKey,
          name: task.name,
          tags: task.tags ? task.tags.map(t => t.name) : []
        });
        count++;
        if (count >= 50) return; // Stop at 50 for comparison
      });

      const elapsed = Date.now() - startTime;

      return JSON.stringify({
        approach: 'omniJSBridge',
        tasksProcessed: results.length,
        elapsed_ms: elapsed,
        sample: results.slice(0, 3)
      });
    })()
  \`;

  const resultJson = app.evaluateJavascript(script);
  return resultJson;
})()
`,

  // APPROACH B: JXA flattenedTasks (like current list-tasks.ts)
  jxaFlattenedTasks: `
(() => {
  const doc = Application('OmniFocus').document;

  const startTime = Date.now();

  const results = [];
  const allTasks = doc.flattenedTasks();
  let count = 0;

  for (let i = 0; i < allTasks.length && count < 50; i++) {
    const task = allTasks[i];
    const tags = task.tags();
    const tagNames = tags ? tags.map(t => t.name()) : [];

    results.push({
      id: task.id(),
      name: task.name(),
      tags: tagNames
    });
    count++;
  }

  const elapsed = Date.now() - startTime;

  return JSON.stringify({
    approach: 'jxaFlattenedTasks',
    tasksProcessed: results.length,
    elapsed_ms: elapsed,
    sample: results.slice(0, 3)
  });
})()
`,

  // APPROACH C: OmniJS bridge with just first 50 (minimal comparison)
  omniJSBridgeMinimal: `
(() => {
  const app = Application('OmniFocus');

  const script = \`
    (() => {
      const results = [];
      let count = 0;

      const startTime = Date.now();

      // Use OmniJS collection and iterate there
      inbox.forEach(task => {
        if (count >= 50) return;
        results.push({
          id: task.id.primaryKey,
          name: task.name,
          tags: task.tags ? task.tags.map(t => t.name) : []
        });
        count++;
      });

      const elapsed = Date.now() - startTime;

      return JSON.stringify({
        approach: 'omniJSBridgeMinimal',
        tasksProcessed: results.length,
        elapsed_ms: elapsed,
        sample: results.slice(0, 3)
      });
    })()
  \`;

  const resultJson = app.evaluateJavascript(script);
  return resultJson;
})()
`
};

console.log('Minimal Tag Query Test - Finding the REAL Bottleneck\n');
console.log('='.repeat(70));
console.log('');

Object.entries(tests).forEach(([name, script]) => {
  console.log(`\n${name.toUpperCase()}`);
  console.log('-'.repeat(70));

  const result = spawnSync('osascript', ['-l', 'JavaScript', '-'], {
    input: script,
    encoding: 'utf-8',
    timeout: 120000
  });

  if (result.error) {
    console.error(`ERROR: ${result.error.message}`);
    return;
  }

  if (result.stderr) {
    console.error(`STDERR: ${result.stderr.substring(0, 200)}`);
    return;
  }

  try {
    const output = JSON.parse(result.stdout);
    console.log(`Approach: ${output.approach}`);
    console.log(`Tasks processed: ${output.tasksProcessed}`);
    console.log(`Time elapsed: ${output.elapsed_ms}ms`);
    console.log(`Per-task average: ${(output.elapsed_ms / output.tasksProcessed).toFixed(2)}ms`);

    if (output.sample?.length > 0) {
      console.log(`Sample task:`);
      console.log(`  - ID: ${output.sample[0].id}`);
      console.log(`  - Name: ${output.sample[0].name}`);
      console.log(`  - Tags: ${output.sample[0].tags.join(', ') || '(none)'}`);
    }
  } catch (e) {
    console.error(`Parse error: ${e.message}`);
    console.log(`Raw output: ${result.stdout.substring(0, 300)}`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('\nKEY FINDING:');
console.log('- If OmniJS bridge is MUCH faster → redesign list-tasks.ts');
console.log('- If JXA is competitive → tag retrieval not the bottleneck');
console.log('- If both are slow → look at other factors (filtering, response formatting)');
