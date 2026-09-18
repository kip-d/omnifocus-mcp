#!/usr/bin/env osascript -l JavaScript

// Test script to verify undocumented OmniFocus API extensions
// Tests properties on the running OmniFocus (version printed at start)

function run() {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;

  const doc = app.defaultDocument;
  const results = {
    version: app.version(),
    tests: {
      project: {},
      tag: {},
      task: {},
    },
  };

  console.log(`Testing OmniFocus version: ${app.version()}\n`);

  // Helper function to test a property
  function testProperty(obj, propName, objType) {
    // Step 1: read the property. Some properties are functions in JXA.
    let actualValue;
    try {
      const value = obj[propName];
      actualValue = typeof value === 'function' ? value() : value;
    } catch (e) {
      results.tests[objType][propName] = { exists: false, error: e.message };
      console.log(`❌ ${objType}.${propName}: ERROR - ${e.message}`);
      return false;
    }

    // Step 2: describe it with JXA's own formatter. Automation.getDisplayString
    // renders object specifiers (project.nextTask returns one; String() on it
    // throws "Can't convert types", and typeof reports 'function') as their
    // object path, and passes strings, numbers, booleans, dates, and null
    // through. A value we can read but cannot describe is NOT a pass: it is
    // recorded exists:true / inspectable:false and counted as a failure, so
    // the summary never reports success for a property nobody could inspect.
    try {
      const shown = Automation.getDisplayString(actualValue);
      results.tests[objType][propName] = {
        exists: true,
        inspectable: true,
        type: typeof actualValue, // a specifier shows as 'function' here; its display string is the tell
        value: shown,
      };
      console.log(`✅ ${objType}.${propName}: ${typeof actualValue} = ${shown}`);
      return true;
    } catch (e) {
      results.tests[objType][propName] = {
        exists: true,
        inspectable: false,
        type: typeof actualValue,
        error: e.message,
      };
      console.log(
        `⚠️  ${objType}.${propName}: ${typeof actualValue} read OK but could not be described - ${e.message}`,
      );
      return false;
    }
  }

  // Test Project extensions
  console.log('\n=== Testing Project Extensions ===');
  const projects = doc.flattenedProjects();
  if (projects.length > 0) {
    const project = projects[0];
    console.log(`Using project: "${project.name()}"`);
    testProperty(project, 'effectiveStatus', 'project');
    testProperty(project, 'singletonActionHolder', 'project');
    // Also test the properties we thought were duplicates
    testProperty(project, 'nextTask', 'project');
    testProperty(project, 'defaultSingletonActionHolder', 'project');
  } else {
    console.log('⚠️  No projects available for testing');
  }

  // Test Tag extensions
  console.log('\n=== Testing Tag Extensions ===');
  const tags = doc.flattenedTags();
  if (tags.length > 0) {
    const tag = tags[0];
    console.log(`Using tag: "${tag.name()}"`);
    testProperty(tag, 'availableTaskCount', 'tag');
    testProperty(tag, 'remainingTaskCount', 'tag');
  } else {
    console.log('⚠️  No tags available for testing');
  }

  // Test Task extensions
  console.log('\n=== Testing Task Extensions ===');
  const tasks = doc.flattenedTasks();
  if (tasks.length > 0) {
    const task = tasks[0];
    console.log(`Using task: "${task.name()}"`);
    testProperty(task, 'numberOfTasks', 'task');
    testProperty(task, 'numberOfAvailableTasks', 'task');
    testProperty(task, 'numberOfCompletedTasks', 'task');
    testProperty(task, 'next', 'task');
    testProperty(task, 'blocked', 'task');
    testProperty(task, 'inInbox', 'task');
    testProperty(task, 'effectivelyCompleted', 'task');
    testProperty(task, 'effectivelyDropped', 'task');
  } else {
    console.log('⚠️  No tasks available for testing');
  }

  // Summary
  console.log('\n=== Summary ===');
  let totalTests = 0;
  let passedTests = 0;

  for (const objType in results.tests) {
    for (const prop in results.tests[objType]) {
      totalTests++;
      const r = results.tests[objType][prop];
      if (r.exists && r.inspectable !== false) {
        passedTests++;
      }
    }
  }

  console.log(`Passed: ${passedTests}/${totalTests} tests`);
  console.log(`\nFull results (JSON):\n${JSON.stringify(results, null, 2)}`);

  return JSON.stringify(results, null, 2);
}
