#!/usr/bin/env osascript -l JavaScript

function testByIdentifier() {
    const app = Application('OmniFocus');
    app.includeStandardAdditions = true;
    const doc = app.defaultDocument();
    
    console.log("=== Testing Task.byIdentifier ===\n");
    
    // First, get a task ID to test with
    const tasks = doc.flattenedTasks();
    if (tasks.length === 0) {
        console.log("No tasks found to test with");
        return;
    }
    
    const testTask = tasks[0];
    const taskId = testTask.id();
    console.log(`Test task: "${testTask.name()}"`);
    console.log(`Task ID: ${taskId}\n`);
    
    // Test different ways to access byIdentifier
    console.log("1. Testing app.Task.byIdentifier:");
    try {
        console.log("  app.Task type:", typeof app.Task);
        console.log("  app.Task.byIdentifier type:", typeof app.Task.byIdentifier);
        
        if (typeof app.Task.byIdentifier === 'function') {
            const found = app.Task.byIdentifier(taskId);
            console.log("  Result:", found);
            if (found) {
                console.log("  Found task name:", found.name());
            }
        } else {
            console.log("  byIdentifier is not a function");
        }
    } catch (e) {
        console.log("  Error:", e.message);
    }
    
    console.log("\n2. Testing doc.Task.byIdentifier:");
    try {
        console.log("  doc.Task type:", typeof doc.Task);
        console.log("  doc.Task.byIdentifier type:", typeof doc.Task.byIdentifier);
        
        if (typeof doc.Task.byIdentifier === 'function') {
            const found = doc.Task.byIdentifier(taskId);
            console.log("  Result:", found);
            if (found) {
                console.log("  Found task name:", found.name());
            }
        } else {
            console.log("  byIdentifier is not a function");
        }
    } catch (e) {
        console.log("  Error:", e.message);
    }
    
    console.log("\n3. Testing Task constructor directly:");
    try {
        // Check what app.Task actually is
        console.log("  app.Task.name:", app.Task.name);
        console.log("  Is constructor:", app.Task.prototype !== undefined);
        
        // List all properties
        const taskProps = Object.getOwnPropertyNames(app.Task);
        console.log("  All app.Task properties:", taskProps.join(', '));
        
        // Check prototype
        if (app.Task.prototype) {
            const protoProps = Object.getOwnPropertyNames(app.Task.prototype);
            console.log("  app.Task.prototype properties:", protoProps.join(', '));
        }
    } catch (e) {
        console.log("  Error:", e.message);
    }
    
    console.log("\n4. Alternative lookup methods:");
    // Test whose() with id
    try {
        const byId = doc.flattenedTasks.whose({id: taskId});
        console.log(`  whose({id: "${taskId}"}):`, byId.length, "results");
        if (byId.length > 0) {
            console.log("  First result name:", byId[0].name());
        }
    } catch (e) {
        console.log("  whose() error:", e.message);
    }
    
    // Time comparison
    console.log("\n5. Performance comparison:");
    
    // Time iteration method
    const start1 = Date.now();
    let foundByIteration = null;
    for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].id() === taskId) {
            foundByIteration = tasks[i];
            break;
        }
    }
    const time1 = Date.now() - start1;
    console.log(`  Iteration method: ${time1}ms`);
    
    // Time whose method
    const start2 = Date.now();
    const foundByWhose = doc.flattenedTasks.whose({id: taskId});
    const time2 = Date.now() - start2;
    console.log(`  whose() method: ${time2}ms`);
}

testByIdentifier();