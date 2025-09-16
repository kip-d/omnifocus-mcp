#!/usr/bin/env node

/**
 * Test OmniJS Bridge Approach - Using actual OmniJS syntax
 */

import { execSync } from 'child_process';

console.log('🧪 Testing OmniJS Bridge Approach\n');

// Find a task to test with
console.log('Step 1: Finding test task');
let testTaskId = null;
try {
  const findTaskTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");
        const doc = app.defaultDocument();
        const allTasks = doc.flattenedTasks();

        for (let i = 0; i < Math.min(10, allTasks.length); i++) {
          try {
            const task = allTasks[i];
            if (!task.completed()) {
              return JSON.stringify({
                found: true,
                taskId: task.id(),
                taskName: task.name()
              });
            }
          } catch (e) {}
        }

        return JSON.stringify({found: false});
      })();
    '
  `;

  const result = execSync(findTaskTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);

  if (parsed.found) {
    testTaskId = parsed.taskId;
    console.log(`✅ Found test task: ${parsed.taskName} (${testTaskId})`);
  } else {
    console.log('❌ No test task found');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Find task failed:', error.message);
  process.exit(1);
}

// Test 2: Use OmniJS bridge to get tags
console.log('\nStep 2: Testing OmniJS bridge - get tags');
try {
  const getTagsTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");

        // OmniJS syntax - this should work
        const omniJSScript = \`
          (() => {
            const t = Task.byIdentifier("${testTaskId}");
            return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]";
          })()
        \`;

        const bridgeResult = app.evaluateJavascript(omniJSScript);

        return JSON.stringify({
          success: true,
          taskId: "${testTaskId}",
          bridgeResult: bridgeResult,
          tags: JSON.parse(bridgeResult)
        });
      })();
    '
  `;

  const result = execSync(getTagsTest, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(result);
  console.log('✅ OmniJS bridge - get tags:', parsed);

  // Test 3: Set tags via OmniJS bridge
  console.log('\nStep 3: Testing OmniJS bridge - set tags');

  const setTagsTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");

        // OmniJS syntax to set tags
        const omniJSScript = \`
          (() => {
            const task = Task.byIdentifier("${testTaskId}");
            if (!task) return JSON.stringify({success: false, error: "task_not_found"});

            const tagNames = ["BridgeTestTag", "OmniJSTest"];
            task.clearTags();
            const added = [];

            for (const name of tagNames) {
              let tag = flattenedTags.byName(name);
              if (!tag) tag = new Tag(name);
              task.addTag(tag);
              added.push(name);
            }

            return JSON.stringify({success: true, tags: added});
          })()
        \`;

        const bridgeResult = app.evaluateJavascript(omniJSScript);

        return JSON.stringify({
          success: true,
          taskId: "${testTaskId}",
          bridgeResult: bridgeResult,
          setResult: JSON.parse(bridgeResult)
        });
      })();
    '
  `;

  const setResult = execSync(setTagsTest, { encoding: 'utf8' }).trim();
  const setParsed = JSON.parse(setResult);
  console.log('✅ OmniJS bridge - set tags:', setParsed);

  // Test 4: Verify tags were set by re-reading them
  console.log('\nStep 4: Verifying tags were set');

  const verifyTagsTest = `
    osascript -l JavaScript -e '
      (() => {
        const app = Application("OmniFocus");

        const omniJSScript = \`
          (() => {
            const t = Task.byIdentifier("${testTaskId}");
            return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]";
          })()
        \`;

        const bridgeResult = app.evaluateJavascript(omniJSScript);

        return JSON.stringify({
          success: true,
          taskId: "${testTaskId}",
          finalTags: JSON.parse(bridgeResult)
        });
      })();
    '
  `;

  const verifyResult = execSync(verifyTagsTest, { encoding: 'utf8' }).trim();
  const verifyParsed = JSON.parse(verifyResult);
  console.log('✅ Tag verification:', verifyParsed);

  console.log('\n📊 Tag Assignment Test Results:');
  console.log(`Original tags: ${JSON.stringify(parsed.tags)}`);
  console.log(`Expected tags: ["BridgeTestTag", "OmniJSTest"]`);
  console.log(`Final tags: ${JSON.stringify(verifyParsed.finalTags)}`);

  const expectedTags = ["BridgeTestTag", "OmniJSTest"];
  const finalTags = verifyParsed.finalTags;
  const tagsMatch = expectedTags.every(tag => finalTags.includes(tag));

  console.log(`✅ Tag assignment successful: ${tagsMatch}`);

} catch (error) {
  console.log('❌ OmniJS bridge test failed:', error.message);
}

console.log('\n🧪 OmniJS bridge test complete.');