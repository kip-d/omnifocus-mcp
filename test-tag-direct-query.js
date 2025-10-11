#!/usr/bin/env node

/**
 * Direct OmniFocus query to verify tag persistence
 * Bypasses MCP server entirely to test raw OmniFocus behavior
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function queryTaskDirectly(taskId) {
  const script = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();

    // Find task by ID
    const tasks = doc.flattenedTasks();
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id() === '${taskId}') {
        task = tasks[i];
        break;
      }
    }

    if (!task) {
      return JSON.stringify({ error: 'Task not found' });
    }

    // Try to get tags using OmniJS bridge
    const bridgeScript = \`
      (() => {
        const task = Task.byIdentifier('${taskId}');
        if (!task) return JSON.stringify({ error: 'Task not found in bridge' });

        const tags = task.tags.map(t => t.name);
        return JSON.stringify({ tags: tags });
      })()
    \`;

    const bridgeResult = app.evaluateJavascript(bridgeScript);
    const parsed = JSON.parse(bridgeResult);

    return JSON.stringify({
      taskId: task.id(),
      name: task.name(),
      tagsViaBridge: parsed.tags || []
    });
  `;

  const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "\\'")}'`);
  return JSON.parse(stdout.trim());
}

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    console.error('Usage: node test-tag-direct-query.js <taskId>');
    process.exit(1);
  }

  console.log(`\n🔍 Querying task ${taskId} directly from OmniFocus...\n`);

  const result = await queryTaskDirectly(taskId);
  console.log('📊 Result:', JSON.stringify(result, null, 2));
}

main();
