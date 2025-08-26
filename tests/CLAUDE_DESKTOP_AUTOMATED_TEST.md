# Automated OmniFocus MCP v2.0.0 Test Suite

Please run this automated test suite and report the results in a structured format. Execute each test, track the results, and provide a comprehensive report at the end.

```
I'll run a comprehensive test suite for the OmniFocus MCP v2.0.0 server. Let me execute each test category systematically and report the results.

## Starting Automated Test Suite

I'll test:
1. Basic connectivity and version
2. V2 tool operations (tasks, projects) 
3. CRUD operations with special focus on tag assignment
4. Advanced features (recurring tasks, subtasks)
5. Performance benchmarks
6. Error handling
7. Analytics tools

Let me begin by checking the connection and then run through each test category, tracking successes, failures, and performance metrics.
```

After this introduction, please:

1. First, run `get_version_info` to verify we're testing v2.0.0

2. Then execute this test sequence, storing results as you go:

```javascript
// Test tracking
const testResults = {
  passed: [],
  failed: [],
  performance: [],
  criticalIssues: []
};

// Test helper
async function runTest(name, testFn) {
  const start = Date.now();
  try {
    const result = await testFn();
    const time = Date.now() - start;
    testResults.passed.push({ name, time, result });
    console.log(`✅ ${name}: PASSED (${time}ms)`);
    return { success: true, result, time };
  } catch (error) {
    testResults.failed.push({ name, error: error.message });
    console.log(`❌ ${name}: FAILED - ${error.message}`);
    return { success: false, error: error.message };
  }
}
```

3. Run each test group:

### Group A: Task Queries
```javascript
// Test different task query modes
await runTest("Task Query - All", () => 
  tasks({ mode: "all", limit: 5, details: false }));

await runTest("Task Query - Today", () => 
  tasks({ mode: "today", limit: 10, details: false }));

await runTest("Task Query - Search", () => 
  tasks({ mode: "search", search: "test", limit: 5 }));

await runTest("Task Query - Overdue", () => 
  tasks({ mode: "overdue", limit: 10 }));
```

### Group B: Project Operations
```javascript
let testProjectId;

await runTest("Project List", () => 
  projects({ operation: "list", limit: 5, details: false }));

await runTest("Project Create", async () => {
  const result = await projects({ 
    operation: "create", 
    name: `MCP Test ${Date.now()}`
  });
  testProjectId = result.data?.project?.id;
  return result;
});

if (testProjectId) {
  await runTest("Project Update", () => 
    projects({ 
      operation: "update", 
      projectId: testProjectId, 
      note: "Updated via test" 
    }));

  await runTest("Project Delete", () => 
    projects({ operation: "delete", projectId: testProjectId }));
}
```

### Group C: Task CRUD with Tag Verification
```javascript
let testTaskId;

await runTest("Create Task with Tags", async () => {
  const result = await create_task({
    name: `Tag Test ${Date.now()}`,
    tags: ["test", "mcp"],
    flagged: true
  });
  testTaskId = result.data?.task?.id;
  
  // CRITICAL: Verify tags were assigned
  if (!result.data?.task?.tags?.includes("test")) {
    testResults.criticalIssues.push("Tags not assigned during creation!");
  }
  return result;
});

if (testTaskId) {
  await runTest("Update Task", () => 
    update_task({ 
      taskId: testTaskId, 
      name: "Updated Task",
      note: "Test note"
    }));

  await runTest("Complete Task", () => 
    complete_task({ taskId: testTaskId }));
}
```

### Group D: Advanced Features
```javascript
await runTest("Recurring Task", async () => {
  const result = await create_task({
    name: "Weekly Recurring",
    repeatRule: {
      unit: "week",
      steps: 1,
      method: "fixed",
      weekdays: ["monday", "friday"]
    }
  });
  if (result.data?.task?.id) {
    await delete_task({ taskId: result.data.task.id });
  }
  return result;
});

await runTest("Task with Subtask", async () => {
  const parent = await create_task({ 
    name: "Parent Task", 
    sequential: true 
  });
  
  if (parent.data?.task?.id) {
    const child = await create_task({
      name: "Subtask",
      parentTaskId: parent.data.task.id
    });
    
    // Cleanup
    if (child.data?.task?.id) {
      await delete_task({ taskId: child.data.task.id });
    }
    await delete_task({ taskId: parent.data.task.id });
    
    return { parent, child };
  }
});
```

### Group E: Performance Tests
```javascript
await runTest("Large Query Performance", async () => {
  const start = Date.now();
  const result = await tasks({ 
    mode: "all", 
    limit: 100, 
    details: false,
    skipAnalysis: true 
  });
  const time = Date.now() - start;
  
  if (time > 2000) {
    testResults.criticalIssues.push(`Large query took ${time}ms (>2s threshold)`);
  }
  
  testResults.performance.push({ 
    test: "100 tasks query", 
    time, 
    acceptable: time < 2000 
  });
  
  return result;
});
```

### Group F: Error Handling
```javascript
await runTest("Invalid Task ID Error", async () => {
  try {
    await update_task({ taskId: "invalid_xyz", name: "Test" });
    throw new Error("Should have failed with invalid ID");
  } catch (error) {
    if (error.message.includes("not found") || error.message.includes("invalid")) {
      return { correctError: true };
    }
    throw error;
  }
});

await runTest("Validation Error", async () => {
  try {
    await tasks({ mode: "invalid_mode" });
    throw new Error("Should have failed with validation error");
  } catch (error) {
    if (error.message.includes("Invalid enum")) {
      return { correctError: true };
    }
    throw error;
  }
});
```

4. Generate Final Report:

```javascript
// Calculate statistics
const totalTests = testResults.passed.length + testResults.failed.length;
const passRate = (testResults.passed.length / totalTests * 100).toFixed(1);
const avgTime = testResults.passed.reduce((sum, t) => sum + t.time, 0) / testResults.passed.length;
const maxTime = Math.max(...testResults.passed.map(t => t.time));
const minTime = Math.min(...testResults.passed.map(t => t.time));

// Generate report
console.log("\n=== FINAL TEST REPORT ===\n");
console.log(`✅ Passed: ${testResults.passed.length}/${totalTests} (${passRate}%)`);
console.log(`❌ Failed: ${testResults.failed.length}/${totalTests}`);
console.log(`\n⚡ Performance:`);
console.log(`  - Average: ${avgTime.toFixed(0)}ms`);
console.log(`  - Fastest: ${minTime}ms`);
console.log(`  - Slowest: ${maxTime}ms`);

if (testResults.criticalIssues.length > 0) {
  console.log(`\n🚨 CRITICAL ISSUES:`);
  testResults.criticalIssues.forEach(issue => console.log(`  - ${issue}`));
}

if (testResults.failed.length > 0) {
  console.log(`\n❌ FAILED TESTS:`);
  testResults.failed.forEach(({ name, error }) => {
    console.log(`  ${name}: ${error}`);
  });
}

console.log(`\n📊 VERDICT: ${passRate >= 90 ? "✅ READY FOR RELEASE" : "⚠️ NEEDS INVESTIGATION"}`);
```

Please run this automated test suite and provide:
1. The complete console output
2. The final test report
3. Any unexpected errors or warnings
4. Your assessment of whether v2.0.0 is ready for release

The most critical test is whether tags are properly assigned during task creation (Group C). This is a key v2.0.0 feature that must work.