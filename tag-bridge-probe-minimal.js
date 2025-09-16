#!/usr/bin/env node

/**
 * Minimal Tag Bridge Probe - Focus on bridge behavior only
 */

import { execSync } from 'child_process';

console.log('🔍 Minimal Tag Bridge Probe - Testing bridge behavior\n');

// Test 1: Bridge connectivity confirmed
console.log('Test 1: Confirming bridge works');
try {
  const bridgeTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");
        const result = app.evaluateJavascript("Date.now()");
        return JSON.stringify({bridge: true, timestamp: result});
      })();
    '
  `;

  const result = execSync(bridgeTest, { encoding: 'utf8' }).trim();
  console.log('✅ Bridge confirmed:', JSON.parse(result));
} catch (error) {
  console.log('❌ Bridge failed:', error.message);
  process.exit(1);
}

// Test 2: Can we access OmniFocus data through bridge?
console.log('\nTest 2: OmniFocus data access via bridge');
try {
  const dataAccessTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");

        const bridgeScript = \`
          const doc = Application("OmniFocus").defaultDocument();
          const taskCount = doc.flattenedTasks().length;
          const projectCount = doc.flattenedProjects().length;
          JSON.stringify({taskCount, projectCount});
        \`;

        const bridgeResult = app.evaluateJavascript(bridgeScript);

        return JSON.stringify({
          bridgeDataAccess: true,
          data: JSON.parse(bridgeResult)
        });
      })();
    '
  `;

  const result = execSync(dataAccessTest, { encoding: 'utf8' }).trim();
  console.log('✅ Bridge data access:', JSON.parse(result));
} catch (error) {
  console.log('❌ Bridge data access failed:', error.message);
}

// Test 3: Find existing task with tags for testing
console.log('\nTest 3: Finding existing task with tags');
try {
  const findTaskTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");
        const doc = app.defaultDocument();
        const allTasks = doc.flattenedTasks();

        // Find a task that has tags
        for (let i = 0; i < Math.min(50, allTasks.length); i++) {
          try {
            const task = allTasks[i];
            const tags = task.tags();
            if (tags.length > 0) {
              const tagData = [];
              for (let j = 0; j < tags.length; j++) {
                tagData.push({
                  id: tags[j].id(),
                  name: tags[j].name()
                });
              }
              return JSON.stringify({
                found: true,
                taskId: task.id(),
                taskName: task.name(),
                tagCount: tags.length,
                tags: tagData
              });
            }
          } catch (e) {
            // Skip problematic tasks
          }
        }

        return JSON.stringify({found: false, message: "No tasks with tags found in first 50"});
      })();
    '
  `;

  const result = execSync(findTaskTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);
  console.log('✅ Existing task search:', parsed);

  // Test 4: Query the same task via bridge
  if (parsed.found) {
    console.log('\nTest 4: Query same task via bridge');
    const bridgeQueryTest = `
      osascript -l JavaScript -e '
        (() => {
          const app = Application("OmniFocus");

          const bridgeScript = \`
            const doc = Application("OmniFocus").defaultDocument();
            const allTasks = doc.flattenedTasks();

            for (let i = 0; i < allTasks.length; i++) {
              try {
                const task = allTasks[i];
                if (task.id() === "${parsed.taskId}") {
                  const tags = task.tags();
                  const tagData = [];
                  for (let j = 0; j < tags.length; j++) {
                    tagData.push({
                      id: tags[j].id(),
                      name: tags[j].name()
                    });
                  }
                  return JSON.stringify({
                    found: true,
                    taskId: task.id(),
                    taskName: task.name(),
                    tagCount: tags.length,
                    tags: tagData
                  });
                }
              } catch (e) {}
            }
            return JSON.stringify({found: false});
          \`;

          const bridgeResult = app.evaluateJavascript(bridgeScript);

          return JSON.stringify({
            bridgeQuery: true,
            result: JSON.parse(bridgeResult)
          });
        })();
      '
    `;

    const bridgeResult = execSync(bridgeQueryTest, { encoding: 'utf8' }).trim();
    const bridgeParsed = JSON.parse(bridgeResult);

    console.log('✅ Bridge query result:', bridgeParsed);

    // Compare tag counts
    const directTagCount = parsed.tagCount;
    const bridgeTagCount = bridgeParsed.result.tagCount;

    console.log('\n📊 Tag Visibility Comparison:');
    console.log(`Direct query: ${directTagCount} tags`);
    console.log(`Bridge query: ${bridgeTagCount} tags`);
    console.log(`Consistent: ${directTagCount === bridgeTagCount ? '✅' : '❌'}`);
  }

} catch (error) {
  console.log('❌ Task search failed:', error.message);
}

console.log('\n🔬 Minimal probe complete.');