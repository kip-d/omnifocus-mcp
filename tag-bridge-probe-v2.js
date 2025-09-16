#!/usr/bin/env node

/**
 * Tag Bridge Probe V2 - Using correct JXA patterns from working scripts
 */

import { execSync } from 'child_process';

console.log('🔍 Tag Bridge Probe V2 - Testing with correct JXA patterns\n');

// Test 1: Basic OmniFocus connectivity (following our working pattern)
console.log('Test 1: Basic OmniFocus connectivity');
try {
  const connectTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");
        const doc = app.defaultDocument();

        return JSON.stringify({
          connected: true,
          taskCount: doc.flattenedTasks().length,
          projectCount: doc.flattenedProjects().length
        });
      })();
    '
  `;

  const result = execSync(connectTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);
  console.log('✅ OmniFocus connectivity:', parsed);
} catch (error) {
  console.log('❌ OmniFocus connectivity failed:', error.message);
  process.exit(1);
}

// Test 2: evaluateJavascript basic test
console.log('\nTest 2: evaluateJavascript basic test');
try {
  const bridgeBasicTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");

        // Test evaluateJavascript with simple expression
        const result = app.evaluateJavascript("1 + 1");

        return JSON.stringify({
          bridgeWorks: true,
          testResult: result
        });
      })();
    '
  `;

  const result = execSync(bridgeBasicTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);
  console.log('✅ Basic bridge test:', parsed);
} catch (error) {
  console.log('❌ Basic bridge test failed:', error.message);
}

// Test 3: Create task and immediately query tags (no bridge)
console.log('\nTest 3: Create task and check tags (direct)');
let testTaskId = null;
try {
  const createAndCheckTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");
        const doc = app.defaultDocument();

        // Create task
        const taskName = "DirectTest_" + Date.now();
        const task = app.Task({name: taskName});
        doc.inboxTasks.push(task);

        // Find or create test tag
        const tagName = "ProbeTestTag";
        let testTag = null;
        const allTags = doc.flattenedTags();

        for (let i = 0; i < allTags.length; i++) {
          if (allTags[i].name() === tagName) {
            testTag = allTags[i];
            break;
          }
        }

        if (!testTag) {
          testTag = app.Tag({name: tagName});
          doc.flattenedTags.push(testTag);
        }

        // Add tag to task
        task.addTag(testTag);

        // Check tags immediately
        const taskTags = task.tags();
        const tagData = [];
        for (let i = 0; i < taskTags.length; i++) {
          tagData.push({
            id: taskTags[i].id(),
            name: taskTags[i].name()
          });
        }

        return JSON.stringify({
          taskId: task.id(),
          taskName: task.name(),
          tagCount: taskTags.length,
          tags: tagData
        });
      })();
    '
  `;

  const result = execSync(createAndCheckTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);
  testTaskId = parsed.taskId;
  console.log('✅ Task created with tags (direct):', parsed);
} catch (error) {
  console.log('❌ Task creation failed:', error.message);
}

// Test 4: Use evaluateJavascript to re-query the same task
if (testTaskId) {
  console.log('\nTest 4: Query same task via evaluateJavascript bridge');
  try {
    const bridgeQueryTest = `
      osascript -l JavaScript -e '
        (() => {
          const app = Application("OmniFocus");

          const bridgeScript = \`
            const doc = Application("OmniFocus").defaultDocument();
            const allTasks = doc.flattenedTasks();
            let targetTask = null;

            for (let i = 0; i < allTasks.length; i++) {
              if (allTasks[i].id() === "${testTaskId}") {
                targetTask = allTasks[i];
                break;
              }
            }

            if (targetTask) {
              const taskTags = targetTask.tags();
              const tagData = [];
              for (let i = 0; i < taskTags.length; i++) {
                tagData.push({
                  id: taskTags[i].id(),
                  name: taskTags[i].name()
                });
              }

              JSON.stringify({
                found: true,
                taskId: targetTask.id(),
                taskName: targetTask.name(),
                tagCount: taskTags.length,
                tags: tagData
              });
            } else {
              JSON.stringify({found: false});
            }
          \`;

          const bridgeResult = app.evaluateJavascript(bridgeScript);

          return JSON.stringify({
            bridgeExecuted: true,
            bridgeResult: JSON.parse(bridgeResult)
          });
        })();
      '
    `;

    const result = execSync(bridgeQueryTest, { encoding: 'utf8' }).trim();
    const parsed = JSON.parse(result);
    console.log('✅ Bridge query result:', parsed);

    console.log('\n📊 Tag Visibility Comparison:');
    console.log('This would compare direct vs bridge tag visibility...');

  } catch (error) {
    console.log('❌ Bridge query failed:', error.message);
  }
}

console.log('\n🔬 Probe V2 complete.');