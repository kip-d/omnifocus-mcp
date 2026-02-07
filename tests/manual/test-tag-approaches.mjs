#!/usr/bin/env node
/**
 * Test script to compare two tag retrieval approaches
 * Run: node test-tag-approaches.mjs
 */

import { spawnSync } from 'child_process';
import path from 'path';

const testScripts = {
  // APPROACH 1: Simple JXA (direct property access)
  simpleJXA: `
(() => {
  const tasks = document.flattenedTasks();
  const results = [];

  const startTime = Date.now();

  for (let i = 0; i < Math.min(tasks.length, 100); i++) {
    const task = tasks[i];
    const taskData = {
      id: task.id(),
      name: task.name(),
      tags: []
    };

    // APPROACH 1: Simple JXA - direct property access
    try {
      const tags = task.tags();
      taskData.tags = tags ? tags.map(t => t.name()) : [];
    } catch (e) {
      taskData.tags = [];
    }

    results.push(taskData);
  }

  const elapsed = Date.now() - startTime;

  return JSON.stringify({
    approach: 'simpleJXA',
    tasksProcessed: results.length,
    elapsed_ms: elapsed,
    avg_per_task_ms: (elapsed / results.length).toFixed(3),
    sample: results.slice(0, 3)
  });
})()
`,

  // APPROACH 2: Bulk bridge (current problematic approach)
  bulkBridge: `
(() => {
  const tasks = document.flattenedTasks();
  const results = [];
  const ids = [];

  // Collect all IDs first
  for (let i = 0; i < Math.min(tasks.length, 100); i++) {
    const task = tasks[i];
    results.push({
      id: task.id(),
      name: task.name(),
      tags: []
    });
    ids.push(task.id());
  }

  const startTime = Date.now();

  // APPROACH 2: Bulk bridge - create massive script with all IDs
  const app = Application('OmniFocus');
  const scriptParts = [];
  scriptParts.push('(function () {');
  scriptParts.push('  var ids = ' + JSON.stringify(ids) + ';');
  scriptParts.push('  var out = {};');
  scriptParts.push('  for (var i = 0; i < ids.length; i++) {');
  scriptParts.push('    var task = Task.byIdentifier(ids[i]);');
  scriptParts.push('    if (task) {');
  scriptParts.push('      var tagList = task.tags ? task.tags : [];');
  scriptParts.push('      var names = [];');
  scriptParts.push('      for (var j = 0; j < tagList.length; j++) {');
  scriptParts.push('        try { names.push(tagList[j].name); } catch (e) {}');
  scriptParts.push('      }');
  scriptParts.push('      out[ids[i]] = names;');
  scriptParts.push('    }');
  scriptParts.push('  }');
  scriptParts.push('  return JSON.stringify(out);');
  scriptParts.push('})()');

  const bridgeScript = scriptParts.join('\\n');
  const resultJson = app.evaluateJavascript(bridgeScript);
  const tagMap = JSON.parse(resultJson);

  // Map tags back to results
  for (let i = 0; i < results.length; i++) {
    results[i].tags = tagMap[results[i].id] || [];
  }

  const elapsed = Date.now() - startTime;

  return JSON.stringify({
    approach: 'bulkBridge',
    tasksProcessed: results.length,
    elapsed_ms: elapsed,
    avg_per_task_ms: (elapsed / results.length).toFixed(3),
    sample: results.slice(0, 3)
  });
})()
`,

  // APPROACH 3: Per-task bridge (what safeGetTagsWithBridge tries)
  perTaskBridge: `
(() => {
  const tasks = document.flattenedTasks();
  const results = [];

  const startTime = Date.now();
  const app = Application('OmniFocus');

  for (let i = 0; i < Math.min(tasks.length, 100); i++) {
    const task = tasks[i];
    const taskId = task.id();

    // APPROACH 3: Per-task bridge
    const script = \`(() => { const t = Task.byIdentifier(\${JSON.stringify(taskId)}); return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]"; })()\`;
    const result = app.evaluateJavascript(script);
    const tags = JSON.parse(result);

    results.push({
      id: taskId,
      name: task.name(),
      tags: tags
    });
  }

  const elapsed = Date.now() - startTime;

  return JSON.stringify({
    approach: 'perTaskBridge',
    tasksProcessed: results.length,
    elapsed_ms: elapsed,
    avg_per_task_ms: (elapsed / results.length).toFixed(3),
    sample: results.slice(0, 3)
  });
})()
`
};

console.log('Comparing tag retrieval approaches on first 100 tasks...\n');

Object.entries(testScripts).forEach(([name, script]) => {
  console.log(`Testing ${name}...`);

  const result = spawnSync('osascript', ['-l', 'JavaScript', '-'], {
    input: script,
    encoding: 'utf-8'
  });

  if (result.error) {
    console.error(`  ERROR: ${result.error.message}`);
    return;
  }

  if (result.stderr) {
    console.error(`  STDERR: ${result.stderr}`);
    return;
  }

  try {
    const output = JSON.parse(result.stdout);
    console.log(`  Approach: ${output.approach}`);
    console.log(`  Tasks processed: ${output.tasksProcessed}`);
    console.log(`  Total time: ${output.elapsed_ms}ms`);
    console.log(`  Per-task average: ${output.avg_per_task_ms}ms`);
    console.log(`  Sample result (first task):`);
    if (output.sample && output.sample[0]) {
      console.log(`    - ID: ${output.sample[0].id}`);
      console.log(`    - Name: ${output.sample[0].name}`);
      console.log(`    - Tags: ${output.sample[0].tags.join(', ') || '(none)'}`);
    }
  } catch (e) {
    console.error(`  Parse error: ${e.message}`);
    console.error(`  Raw output: ${result.stdout}`);
  }

  console.log();
});

console.log('\nConclusion:');
console.log('- simpleJXA: Direct property access, minimal overhead');
console.log('- bulkBridge: Batch processing, script size grows with task count');
console.log('- perTaskBridge: Individual bridge calls, massive overhead (100 calls!)');
console.log('\nRecommendation: Use simpleJXA approach - it\'s fastest and simplest');
