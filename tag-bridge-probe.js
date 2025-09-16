#!/usr/bin/env node

/**
 * Standalone Tag Bridge Probe
 * Tests evaluateJavascript bridge behavior for tag assignment and rehydration
 * Run independently of MCP server to isolate bridge functionality
 */

import { execSync } from 'child_process';

console.log('🔍 Tag Bridge Probe - Testing evaluateJavascript behavior\n');

// Test 1: Basic bridge connectivity
console.log('Test 1: Basic bridge connectivity');
try {
  const basicTest = `
    osascript -l JavaScript -e '
      const app = Application("OmniFocus");
      const result = app.evaluateJavascript("{test: true, timestamp: Date.now()}");
      JSON.stringify(result);
    '
  `;

  const result = execSync(basicTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);
  console.log('✅ Bridge connectivity:', parsed);
} catch (error) {
  console.log('❌ Bridge connectivity failed:', error.message);
}

// Test 2: Task creation with tag assignment
console.log('\nTest 2: Task creation with tag assignment');
try {
  const createTest = `
    osascript -l JavaScript -e '
      const app = Application("OmniFocus");
      const doc = app.defaultDocument();

      // Create simple task first
      const taskName = "Bridge Test Task " + Date.now();
      const inbox = doc.inbox();
      const task = app.Task({name: taskName});
      inbox.tasks.push(task);

      JSON.stringify({
        success: true,
        taskId: task.id(),
        taskName: task.name(),
        message: "Task created successfully"
      });
    '
  `;

  const result = execSync(createTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);
  console.log('✅ Task created with tag:', parsed);

  // Store task ID for bridge test
  const taskId = parsed.taskId;

  // Test 3: Bridge-based tag rehydration
  console.log('\nTest 3: Bridge-based tag rehydration');

  const bridgeTest = `
    osascript -l JavaScript -e '
      const app = Application("OmniFocus");

      // Use bridge to rehydrate task and check tags
      const bridgeScript = \`
        const doc = Application("OmniFocus").defaultDocument;
        const tasks = doc.flattenedTasks();
        let targetTask = null;

        for (let i = 0; i < tasks.length; i++) {
          if (tasks[i].id() === "${taskId}") {
            targetTask = tasks[i];
            break;
          }
        }

        if (targetTask) {
          const tags = targetTask.tags();
          const tagData = [];
          for (let i = 0; i < tags.length; i++) {
            tagData.push({
              id: tags[i].id(),
              name: tags[i].name()
            });
          }
          return {
            found: true,
            taskId: targetTask.id(),
            taskName: targetTask.name(),
            tagCount: tags.length,
            tags: tagData
          };
        } else {
          return {found: false};
        }
      \`;

      const result = app.evaluateJavascript(bridgeScript);
      JSON.stringify(result);
    '
  `;

  const bridgeResult = execSync(bridgeTest, { encoding: 'utf8' }).trim();
  const bridgeParsed = JSON.parse(bridgeResult);
  console.log('✅ Bridge rehydration result:', bridgeParsed);

  // Test 4: Direct query comparison
  console.log('\nTest 4: Direct query comparison (no bridge)');

  const directTest = `
    osascript -l JavaScript -e '
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks();
      let targetTask = null;

      for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].id() === "${taskId}") {
          targetTask = tasks[i];
          break;
        }
      }

      if (targetTask) {
        const tags = targetTask.tags();
        const tagData = [];
        for (let i = 0; i < tags.length; i++) {
          tagData.push({
            id: tags[i].id(),
            name: tags[i].name()
          });
        }
        JSON.stringify({
          found: true,
          taskId: targetTask.id(),
          taskName: targetTask.name(),
          tagCount: tags.length,
          tags: tagData
        });
      } else {
        JSON.stringify({found: false});
      }
    '
  `;

  const directResult = execSync(directTest, { encoding: 'utf8' }).trim();
  const directParsed = JSON.parse(directResult);
  console.log('✅ Direct query result:', directParsed);

  // Compare results
  console.log('\n📊 Comparison:');
  console.log(`Bridge tag count: ${bridgeParsed.tagCount || 0}`);
  console.log(`Direct tag count: ${directParsed.tagCount || 0}`);
  console.log(`Tag visibility consistent: ${(bridgeParsed.tagCount || 0) === (directParsed.tagCount || 0)}`);

} catch (error) {
  console.log('❌ Tag assignment test failed:', error.message);
}

console.log('\n🔬 Probe complete. Check results above for bridge behavior patterns.');