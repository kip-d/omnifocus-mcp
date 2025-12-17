#!/usr/bin/env node

/**
 * Comprehensive tag operation diagnostic
 * Tests each step of tag operations to find where persistence fails
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runScript(script) {
  const escaped = script.replace(/'/g, "'\\''");
  const { stdout } = await execAsync(`osascript -l JavaScript -e '${escaped}'`);
  return JSON.parse(stdout.trim());
}

async function main() {
  console.log('🧪 Tag Operation Sequence Diagnostic\n');

  const uniqueName = `Tag Diagnostic ${Date.now()}`;

  // Step 1: Create task WITHOUT tags
  console.log('📝 Step 1: Creating task without tags...');
  const createScript = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const task = app.Task({ name: '${uniqueName}' });
    doc.inboxTasks.push(task);
    const taskId = task.id();
    JSON.stringify({ taskId: taskId, name: task.name() });
  `;

  const createResult = await runScript(createScript);
  console.log('✅ Created:', createResult);
  const taskId = createResult.taskId;

  // Wait for task to be persisted
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 2: Query tags via bridge (should be empty)
  console.log('\n🔍 Step 2: Querying tags (should be empty)...');
  const queryScript1 = `
    const app = Application('OmniFocus');
    const bridgeScript = \`
      (() => {
        const task = Task.byIdentifier('${taskId}');
        if (!task) return JSON.stringify({ error: 'task_not_found' });
        const tags = task.tags.map(t => t.name);
        return JSON.stringify({ success: true, tags: tags });
      })()
    \`;
    const result = app.evaluateJavascript(bridgeScript);
    result;
  `;

  const query1 = await runScript(queryScript1);
  console.log('📊 Tags before update:', query1);

  // Wait before update
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 3: Set tags via bridge
  console.log('\n🏷️  Step 3: Setting tags via bridge...');
  const setTagsScript = `
    const app = Application('OmniFocus');
    const bridgeScript = \`
      (() => {
        const task = Task.byIdentifier('${taskId}');
        if (!task) return JSON.stringify({ error: 'task_not_found' });

        const tagNames = ["test-tag-1", "test-tag-2"];
        task.clearTags();
        const added = [];

        for (const name of tagNames) {
          let tag = flattenedTags.byName(name);
          if (!tag) tag = new Tag(name);
          task.addTag(tag);
          added.push(name);
        }

        return JSON.stringify({ success: true, tags: added });
      })()
    \`;
    const result = app.evaluateJavascript(bridgeScript);
    result;
  `;

  const setResult = await runScript(setTagsScript);
  console.log('📊 Set tags result:', setResult);

  // Wait for persistence
  console.log('\n⏱️  Waiting 2 seconds for OmniFocus to persist changes...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 4: Query tags again via bridge
  console.log('\n🔍 Step 4: Querying tags after update...');
  const queryScript2 = `
    const app = Application('OmniFocus');
    const bridgeScript = \`
      (() => {
        const task = Task.byIdentifier('${taskId}');
        if (!task) return JSON.stringify({ error: 'task_not_found' });
        const tags = task.tags.map(t => t.name);
        return JSON.stringify({ success: true, tags: tags });
      })()
    \`;
    const result = app.evaluateJavascript(bridgeScript);
    result;
  `;

  const query2 = await runScript(queryScript2);
  console.log('📊 Tags after update:', query2);

  // Step 5: Try querying via JXA (not bridge)
  console.log('\n🔍 Step 5: Querying via JXA (not bridge)...');
  const jxaQueryScript = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const tasks = doc.flattenedTasks();
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id() === '${taskId}') {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      JSON.stringify({ error: 'task_not_found' });
    } else {
      // JXA tag query - note this might not work in OF 4.x
      try {
        const tags = task.tags();
        const tagNames = [];
        for (let i = 0; i < tags.length; i++) {
          tagNames.push(tags[i].name());
        }
        JSON.stringify({ success: true, tags: tagNames, source: 'jxa' });
      } catch (e) {
        JSON.stringify({ success: false, error: e.message, source: 'jxa' });
      }
    }
  `;

  const jxaQuery = await runScript(jxaQueryScript);
  console.log('📊 Tags via JXA:', jxaQuery);

  // Clean up
  console.log('\n🧹 Cleaning up...');
  const deleteScript = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const tasks = doc.flattenedTasks();
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id() === '${taskId}') {
        doc.delete(tasks[i]);
        break;
      }
    }
    JSON.stringify({ deleted: true });
  `;

  await runScript(deleteScript);
  console.log('✅ Cleanup complete\n');

  // Analysis
  console.log('📊 Analysis:');
  if (query2.success && query2.tags && query2.tags.length === 2) {
    console.log('✅ SUCCESS: Tags persisted correctly via bridge!');
  } else {
    console.log('❌ PROBLEM: Tags did not persist via bridge');
    console.log('   Expected: ["test-tag-1", "test-tag-2"]');
    console.log('   Got:', JSON.stringify(query2.tags || []));
  }
}

main().catch(console.error);
